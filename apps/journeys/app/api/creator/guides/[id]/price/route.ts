import { apiContext, boundedBody, failure, reply } from '../../../../../../lib/api/server';
import { uuid } from '../../../../../../lib/api/validation';

export const dynamic = 'force-dynamic';

function mapError(message: string) {
  if (/creator_required|actor_required|forbidden/.test(message)) return failure('FORBIDDEN', 403);
  if (/guide_not_found/.test(message)) return failure('NOT_FOUND', 404);
  if (/invalid_price/.test(message)) return failure('INVALID', 400);
  return failure('UNAVAILABLE', 503);
}

/** Creator sets the flat trip price for one owned guide (HKD minor units), or clears it.
 *  Prices are inert until the payments flag is enabled; nothing charges here. */
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await apiContext(request, 'creator', true);
  if (ctx.response) return ctx.response;
  const { id } = await context.params;
  if (!uuid(id)) return failure('INVALID', 400);
  if (!ctx.actor.roles.includes('creator')) return failure('FORBIDDEN', 403);
  let input: unknown;
  try {
    input = await boundedBody(request, 1024);
  } catch {
    return failure('INVALID', 400);
  }
  const body = input as { priceMinor?: unknown } | null;
  if (!body || typeof body !== 'object') return failure('INVALID', 400);
  if (body.priceMinor !== null && (typeof body.priceMinor !== 'number' || !Number.isInteger(body.priceMinor))) return failure('INVALID', 400);
  try {
    const response = await ctx.client.rpc('kinnso_creator_set_guide_price', { p_guide_id: id, p_price_minor: body.priceMinor });
    if (response.error) throw new Error(response.error.message);
    return reply({ ok: true, data: response.data });
  } catch (error) {
    return mapError(error instanceof Error ? error.message : '');
  }
}
