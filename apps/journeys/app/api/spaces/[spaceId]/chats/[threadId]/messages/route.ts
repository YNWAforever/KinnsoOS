import { apiContext, boundedBody, failure } from '../../../../../../../lib/api/server';
import { appendMessage, getThread, renameThread, reserveChatTurn } from '../../../../../../../lib/chat/server';
import { connectMcp } from '../../../../../../../lib/mcp/client';
import { runChatTurn } from '../../../../../../../lib/ai/spaces-chat';
import { isUuid } from '../../../../../../../lib/chat/contracts';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Params = { params: Promise<{ spaceId: string; threadId: string }> };

function sse(event: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode('data: ' + JSON.stringify(event) + '\n\n');
}

export async function POST(request: Request, { params }: Params) {
  const ctx = await apiContext(request, 'conversation', true);
  if (ctx.response) return ctx.response;
  const { spaceId, threadId } = await params;
  if (!isUuid(spaceId) || !isUuid(threadId)) return failure('INVALID', 400);

  let body: { body?: unknown; requestId?: unknown; locale?: unknown };
  try {
    body = (await boundedBody(request, 16384)) as typeof body;
  } catch {
    return failure('INVALID', 400);
  }
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  if (!text || text.length > 8000) return failure('INVALID', 400);
  const requestId = typeof body.requestId === 'string' && isUuid(body.requestId) ? body.requestId : crypto.randomUUID();
  const locale = body.locale === 'zh-HK' ? 'zh-HK' : 'en';

  let thread;
  try {
    thread = await getThread(threadId);
  } catch {
    return failure('NOT_FOUND', 404);
  }
  if (thread.spaceId !== spaceId) return failure('NOT_FOUND', 404);

  // Bound paid model turns per actor before any provider call.
  try {
    const budget = await reserveChatTurn(Number(process.env.KINNSO_CHAT_TURNS_PER_HOUR ?? 30));
    if (!budget.allowed) {
      return Response.json({ ok: false, code: 'RATE_LIMITED', retryable: true, requestId: crypto.randomUUID(), limit: budget.limit, resetAt: budget.resetAt }, { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': '600' } });
    }
  } catch {
    return failure('UNAVAILABLE', 503);
  }

  const history = thread.messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({ role: message.role as 'user' | 'assistant', body: message.body }));

  try {
    await appendMessage(threadId, requestId, 'user', text, null, {});
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('idempotency_conflict')) return failure('CONFLICT', 409);
    if (message.includes('invalid_message_limit')) return failure('INVALID', 400);
    return failure('UNAVAILABLE', 503);
  }

  const cookie = request.headers.get('cookie') ?? '';
  const controller = new AbortController();
  request.signal.addEventListener('abort', () => controller.abort(), { once: true });

  const stream = new ReadableStream<Uint8Array>({
    async start(streamController) {
      const send = (event: Record<string, unknown>) => {
        try {
          streamController.enqueue(sse(event));
        } catch {
          /* client disconnected */
        }
      };
      send({ type: 'accepted', requestId, threadId });
      try {
        const mcp = await connectMcp(cookie);
        send({ type: 'mcp', protocolVersion: mcp.protocolVersion, server: mcp.serverInfo, tools: mcp.tools.map((tool) => tool.name) });
        const result = await runChatTurn({
          locale,
          history,
          question: text,
          threadId,
          mcp,
          signal: controller.signal,
          emit: (event) => send(event),
        });
        const assistantRequestId = crypto.randomUUID();
        const stored = await appendMessage(threadId, assistantRequestId, 'assistant', result.text || '(no content)', null, {
          model: result.model,
          tools: result.tools,
        });
        if (thread.title === 'New chat' || thread.title === '\u65b0\u7684\u5c0d\u8a71') {
          // Name the thread from its first question, so the chat list is readable.
          try {
            await renameThread(threadId, text.slice(0, 120));
          } catch {
            /* renaming is cosmetic */
          }
        }
        send({ type: 'done', threadId, messageId: stored.id, sequence: stored.sequence, model: result.model });
      } catch (error) {
        send({ type: 'error', code: 'TURN_FAILED', message: error instanceof Error ? error.message.slice(0, 200) : 'turn failed' });
      } finally {
        try {
          streamController.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      controller.abort();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      Vary: 'Cookie',
    },
  });
}
