import { apiContext, boundedBody, failure, reply } from '../../../lib/api/server';
import { createSpace, listSpaces } from '../../../lib/chat/server';
import { isUuid } from '../../../lib/chat/contracts';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const ctx = await apiContext(request, 'conversation');
  if (ctx.response) return ctx.response;
  try {
    return reply({ ok: true, data: { items: await listSpaces() } });
  } catch {
    return failure('UNAVAILABLE', 503);
  }
}

export async function POST(request: Request) {
  const ctx = await apiContext(request, 'conversation', true);
  if (ctx.response) return ctx.response;
  let body: { id?: unknown; name?: unknown; description?: unknown };
  try {
    body = (await boundedBody(request, 8192)) as typeof body;
  } catch {
    return failure('INVALID', 400);
  }
  const id = typeof body.id === 'string' && isUuid(body.id) ? body.id : crypto.randomUUID();
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (!name || name.length > 80 || description.length > 280) return failure('INVALID', 400);
  try {
    return reply({ ok: true, data: await createSpace(id, name, description) }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('invalid_space_limit')) return failure('INVALID', 400);
    return failure('UNAVAILABLE', 503);
  }
}
