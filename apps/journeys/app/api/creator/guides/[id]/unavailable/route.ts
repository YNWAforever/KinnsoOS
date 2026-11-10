import { apiContext, boundedBody, failure, reply } from '../../../../../../lib/api/server';
import { uuid } from '../../../../../../lib/api/validation';

export const dynamic = 'force-dynamic';

function mapError(message: string) {
  if (/creator_required|actor_required|forbidden/.test(message)) return failure('FORBIDDEN', 403);
  if (/guide_not_found/.test(message)) return failure('NOT_FOUND', 404);
  if (/range_overlap/.test(message)) return failure('CONFLICT', 409);
  if (/invalid_dates|range_too_long|too_many_ranges/.test(message)) return failure('INVALID', 400);
  return failure('UNAVAILABLE', 503);
}

/** Creator's own blocked date ranges for one owned guide. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await apiContext(request, 'creator');
  if (ctx.response) return ctx.response;
  const { id } = await context.params;
  if (!uuid(id)) return failure('INVALID', 400);
  if (!ctx.actor.roles.includes('creator')) return failure('FORBIDDEN', 403);
  try {
    const response = await ctx.client.rpc('kinnso_creator_guide_unavailable', { p_guide_id: id });
    if (response.error) throw new Error(response.error.message);
    return reply({ ok: true, data: { ranges: response.data ?? [] } });
  } catch (error) {
    return mapError(error instanceof Error ? error.message : '');
  }
}

/** Add a blocked range. Request-only booking then refuses overlapping requests. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await apiContext(request, 'creator', true);
  if (ctx.response) return ctx.response;
  const { id } = await context.params;
  if (!uuid(id)) return failure('INVALID', 400);
  if (!ctx.actor.roles.includes('creator')) return failure('FORBIDDEN', 403);
  let input: unknown;
  try {
    input = await boundedBody(request, 4096);
  } catch {
    return failure('INVALID', 400);
  }
  const body = input as { startsOn?: unknown; endsOn?: unknown } | null;
  if (!body || typeof body !== 'object') return failure('INVALID', 400);
  if (typeof body.startsOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.startsOn)) return failure('INVALID', 400);
  const endsOn = typeof body.endsOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.endsOn) ? body.endsOn : body.startsOn;
  try {
    const response = await ctx.client.rpc('kinnso_creator_add_unavailable', { p_guide_id: id, p_starts_on: body.startsOn, p_ends_on: endsOn });
    if (response.error) throw new Error(response.error.message);
    return reply({ ok: true, data: response.data }, 201);
  } catch (error) {
    return mapError(error instanceof Error ? error.message : '');
  }
}
