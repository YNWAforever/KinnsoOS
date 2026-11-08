import { apiContext, failure, reply } from '../../../../../../lib/api/server';
import { deleteThread, getThread } from '../../../../../../lib/chat/server';
import { isUuid } from '../../../../../../lib/chat/contracts';
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
