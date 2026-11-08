import { apiContext, boundedBody, failure, reply } from '../../../../../../lib/api/server';
import { deleteThread, getThread, updateThread } from '../../../../../../lib/chat/server';
import { isUuid, parseThreadUpdate } from '../../../../../../lib/chat/contracts';
import { modelConfigured } from '../../../../../../lib/ai/spaces-chat';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ spaceId: string; threadId: string }> };

export async function GET(request: Request, { params }: Params) {
  const ctx = await apiContext(request, 'conversation');
  if (ctx.response) return ctx.response;
  const { spaceId, threadId } = await params;
  if (!isUuid(spaceId) || !isUuid(threadId)) return failure('INVALID', 400);
  try {
    const thread = await getThread(threadId);
    if (thread.spaceId !== spaceId) return failure('NOT_FOUND', 404);
    return reply({
      ok: true,
      data: {
        ...thread,
        model: modelConfigured() ? (process.env.KINNSO_MODEL_ID ?? 'configured') : 'none:tool-grounded',
      },
    });
  } catch {
    return failure('NOT_FOUND', 404);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const ctx = await apiContext(request, 'conversation', true);
  if (ctx.response) return ctx.response;
  const { spaceId, threadId } = await params;
  if (!isUuid(spaceId) || !isUuid(threadId)) return failure('INVALID', 400);
  let body: unknown;
  try {
    body = await boundedBody(request, 8192);
  } catch {
    return failure('INVALID', 400);
  }
  const update = parseThreadUpdate(body);
  if (!update) return failure('INVALID', 400);
  try {
    const thread = await getThread(threadId);
    if (thread.spaceId !== spaceId) return failure('NOT_FOUND', 404);
  } catch {
    return failure('NOT_FOUND', 404);
  }
  try {
    return reply({ ok: true, data: await updateThread(threadId, update) });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('thread_not_found')) return failure('NOT_FOUND', 404);
    if (message.includes('invalid_thread')) return failure('INVALID', 400);
    return failure('UNAVAILABLE', 503);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const ctx = await apiContext(request, 'conversation', true);
  if (ctx.response) return ctx.response;
  const { threadId } = await params;
  if (!isUuid(threadId)) return failure('INVALID', 400);
  try {
    return reply({ ok: true, data: await deleteThread(threadId) });
  } catch {
    return failure('NOT_FOUND', 404);
  }
}
