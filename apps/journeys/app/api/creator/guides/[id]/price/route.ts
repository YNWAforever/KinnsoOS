import { apiContext, boundedBody, failure, reply } from '../../../../../../lib/api/server';
import { object, uuid } from '../../../../../../lib/api/validation';

export const dynamic = 'force-dynamic';

const MIN_MINOR = 100;
const MAX_MINOR = 10000000;

function mapError(message: string) {
  if (/payments_disabled/.test(message)) return failure('FORBIDDEN', 403);
  if (/creator_required|actor_required|forbidden/.test(message)) return failure('FORBIDDEN', 403);
  if (/guide_not_found/.test(message)) return failure('NOT_FOUND', 404);
  if (/invalid_price/.test(message)) return failure('INVALID', 400);
  return failure('UNAVAILABLE', 503);
}

/** Read one owned guide's flat price plus the payments runtime flag. The studio
 *  price panel renders only when `paymentsEnabled` is true, so a flag-off
 *  environment stays inert even though the route exists. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await apiContext(request, 'creator');
  if (ctx.response) return ctx.response;
  const { id } = await context.params;
  if (!uuid(id)) return failure('INVALID', 400);
  if (!ctx.actor.roles.includes('creator')) return failure('FORBIDDEN', 403);
  try {
    const response = await ctx.client.rpc('kinnso_creator_guide_price', { p_guide_id: id });
    if (response.error) throw new Error(response.error.message);
    return reply({ ok: true, data: response.data });
  } catch (error) {
    return mapError(error instanceof Error ? error.message : '');
  }
}

/** Creator sets the flat trip price for one owned guide (HKD minor units), or clears it.
 *  The RPC refuses while the payments flag is off, so production stays inert. */
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await apiContext(request, 'creator', true);
  if (ctx.response) return ctx.response;
  const { id } = await context.params;
  if (!uuid(id)) return failure('INVALID', 400);
  if (!ctx.actor.roles.includes('creator')) return failure('FORBIDDEN', 403);
  let body: Record<string, unknown>;
  try {
    body = object(await boundedBody(request, 1024), ['priceMinor']);
  } catch {
    return failure('INVALID', 400);
  }
  if (body.priceMinor !== null && (typeof body.priceMinor !== 'number' || !Number.isSafeInteger(body.priceMinor) || body.priceMinor < MIN_MINOR || body.priceMinor > MAX_MINOR)) return failure('INVALID', 400);
  try {
    const response = await ctx.client.rpc('kinnso_creator_set_guide_price', { p_guide_id: id, p_price_minor: body.priceMinor });
    if (response.error) throw new Error(response.error.message);
    return reply({ ok: true, data: response.data });
  } catch (error) {
    return mapError(error instanceof Error ? error.message : '');
  }
}
