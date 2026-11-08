import { apiContext, boundedBody, failure } from '../../../../../../../lib/api/server';
import { appendMessage, getThread, renameThread, reserveChatTurn } from '../../../../../../../lib/chat/server';
import type { ChatMessage } from '../../../../../../../lib/chat/contracts';
import { assistantMetadata, chatTurnLimit, isUuid, regenerateRequested } from '../../../../../../../lib/chat/contracts';
import { connectMcp } from '../../../../../../../lib/mcp/client';
import { runChatTurn } from '../../../../../../../lib/ai/spaces-chat';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Params = { params: Promise<{ spaceId: string; threadId: string }> };

function sse(event: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode('data: ' + JSON.stringify(event) + '\n\n');
}

function lastUserIndex(messages: ChatMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'user') return index;
  }
  return -1;
}

function rateLimited(limit: number, resetAt: string, used: number) {
  return Response.json(
    { ok: false, code: 'RATE_LIMITED', retryable: true, requestId: crypto.randomUUID(), used, limit, resetAt },
    { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': '600' } },
  );
}

export async function POST(request: Request, { params }: Params) {
  const ctx = await apiContext(request, 'conversation', true);
  if (ctx.response) return ctx.response;
  const { spaceId, threadId } = await params;
  if (!isUuid(spaceId) || !isUuid(threadId)) return failure('INVALID', 400);

  let body: { body?: unknown; requestId?: unknown; locale?: unknown; regenerate?: unknown };
  try {
    body = (await boundedBody(request, 16384)) as typeof body;
  } catch {
    return failure('INVALID', 400);
  }
  if (!body || typeof body !== 'object') return failure('INVALID', 400);
  const regenerate = regenerateRequested(body.regenerate);
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  if (!regenerate && (!text || text.length > 8000)) return failure('INVALID', 400);
  const requestId = typeof body.requestId === 'string' && isUuid(body.requestId) ? body.requestId : crypto.randomUUID();
  const locale = body.locale === 'zh-HK' ? 'zh-HK' : 'en';

  let thread;
  try {
    thread = await getThread(threadId);
  } catch {
    return failure('NOT_FOUND', 404);
  }
  if (thread.spaceId !== spaceId) return failure('NOT_FOUND', 404);

  // Regenerate re-answers the last user message without appending another one.
  const regenerateFrom = regenerate ? lastUserIndex(thread.messages) : -1;
  if (regenerate && regenerateFrom < 0) return failure('INVALID', 400);
  const question = regenerate ? thread.messages[regenerateFrom].body.trim() : text;
  if (!question || question.length > 8000) return failure('INVALID', 400);

  // Bound paid model turns per actor before any provider call. The limit uses
  // the same clamp the usage meter reports, so the 429 and the meter agree.
  try {
    const budget = await reserveChatTurn(chatTurnLimit(process.env.KINNSO_CHAT_TURNS_PER_HOUR));
    if (!budget.allowed) return rateLimited(budget.limit, budget.resetAt, budget.used);
  } catch {
    return failure('UNAVAILABLE', 503);
  }

  const history = (regenerate ? thread.messages.slice(0, regenerateFrom) : thread.messages)
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({ role: message.role as 'user' | 'assistant', body: message.body }));

  if (!regenerate) {
    try {
      await appendMessage(threadId, requestId, 'user', text);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('idempotency_conflict')) return failure('CONFLICT', 409);
      if (message.includes('invalid_message_limit')) return failure('INVALID', 400);
      return failure('UNAVAILABLE', 503);
    }
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
      send(regenerate ? { type: 'accepted', requestId, threadId, regenerate: true } : { type: 'accepted', requestId, threadId });
      try {
        const mcp = await connectMcp(cookie);
        send({ type: 'mcp', protocolVersion: mcp.protocolVersion, server: mcp.serverInfo, tools: mcp.tools.map((tool) => tool.name) });
        const turnStartedAt = performance.now();
        const result = await runChatTurn({
          locale,
          history,
          question,
          threadId,
          mcp,
          signal: controller.signal,
          emit: (event) => send(event),
        });
        const metadata = assistantMetadata(result, performance.now() - turnStartedAt);
        const assistantRequestId = crypto.randomUUID();
        const stored = await appendMessage(threadId, assistantRequestId, 'assistant', result.text || '(no content)', null, {}, metadata);
        if (thread.title === 'New chat' || thread.title === '新的對話') {
          // Name the thread from its first question, so the chat list is readable.
          try {
            await renameThread(threadId, question.slice(0, 120));
          } catch {
            /* renaming is cosmetic */
          }
        }
        send({ type: 'done', threadId, messageId: stored.id, sequence: stored.sequence, model: result.model, metadata });
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
