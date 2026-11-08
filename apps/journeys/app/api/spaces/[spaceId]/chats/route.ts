import { apiContext, boundedBody, failure, reply } from '../../../../../lib/api/server';
import { createThread, listThreads } from '../../../../../lib/chat/server';
import { isUuid } from '../../../../../lib/chat/contracts';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ spaceId: string }> };

export async function GET(request: Request, { params }: Params) {
  const ctx = await apiContext(request, 'conversation');
  if (ctx.response) return ctx.response;
  const { spaceId } = await params;
  if (!isUuid(spaceId)) return failure('INVALID', 400);
  try {
    return reply({ ok: true, data: { items: await listThreads(spaceId) } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('space_not_found')) return failure('NOT_FOUND', 404);
    return failure('UNAVAILABLE', 503);
  }
}

export async function POST(request: Request, { params }: Params) {
  const ctx = await apiContext(request, 'conversation', true);
  if (ctx.response) return ctx.response;
  const { spaceId } = await params;
  if (!isUuid(spaceId)) return failure('INVALID', 400);
  let body: { id?: unknown; title?: unknown };
  try {
    body = (await boundedBody(request, 8192)) as typeof body;
  } catch {
    return failure('INVALID', 400);
  }
  const id = typeof body.id === 'string' && isUuid(body.id) ? body.id : crypto.randomUUID();
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : '';
  try {
    return reply({ ok: true, data: await createThread(id, spaceId, title) }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('space_not_found')) return failure('NOT_FOUND', 404);
    if (message.includes('invalid_thread')) return failure('INVALID', 400);
    return failure('UNAVAILABLE', 503);
  }
}
