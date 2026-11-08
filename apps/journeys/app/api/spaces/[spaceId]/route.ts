import { apiContext, boundedBody, failure, reply } from '../../../../lib/api/server';
import { deleteSpace, updateSpace } from '../../../../lib/chat/server';
import { isUuid, parseSpaceUpdate } from '../../../../lib/chat/contracts';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ spaceId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const ctx = await apiContext(request, 'conversation', true);
  if (ctx.response) return ctx.response;
  const { spaceId } = await params;
  if (!isUuid(spaceId)) return failure('INVALID', 400);
  let body: unknown;
  try {
    body = await boundedBody(request, 8192);
  } catch {
    return failure('INVALID', 400);
  }
  const update = parseSpaceUpdate(body);
  if (!update) return failure('INVALID', 400);
  try {
    return reply({ ok: true, data: await updateSpace(spaceId, update) });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('space_not_found')) return failure('NOT_FOUND', 404);
    if (message.includes('invalid_space')) return failure('INVALID', 400);
    return failure('UNAVAILABLE', 503);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const ctx = await apiContext(request, 'conversation', true);
  if (ctx.response) return ctx.response;
  const { spaceId } = await params;
  if (!isUuid(spaceId)) return failure('INVALID', 400);
  try {
    return reply({ ok: true, data: await deleteSpace(spaceId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('space_not_found')) return failure('NOT_FOUND', 404);
    return failure('UNAVAILABLE', 503);
  }
}
