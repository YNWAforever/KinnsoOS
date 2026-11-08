import { apiContext, failure, reply } from '../../../../lib/api/server';
import { opsPublishedGuides } from '../../../../lib/content-honesty/server';

export const dynamic = 'force-dynamic';

const MAX_LIMIT = 200;

/** Ops-only published-guide corpus with the derived honesty status, ordered by
 * title. The fresh actor roles are checked here for an explicit 403 and the RPC
 * repeats the is_active_ops() gate at the database boundary. The RPC also
 * clamps the limit to 1..200; this handler only rejects a non-numeric value so
 * a malformed query cannot ride through as NaN. */
export async function GET(request: Request) {
  const ctx = await apiContext(request, 'ops');
  if (ctx.response) return ctx.response;
  if (!ctx.actor.roles.includes('ops')) return failure('FORBIDDEN', 403);
  const raw = new URL(request.url).searchParams.get('limit');
  if (raw !== null && !/^[0-9]{1,9}$/.test(raw)) return failure('INVALID', 400);
  const limit = raw === null ? undefined : Math.min(MAX_LIMIT, Math.max(1, Number(raw)));
  try {
    return reply({ ok: true, data: await opsPublishedGuides(limit) });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/forbidden|not_authorized/.test(message)) return failure('FORBIDDEN', 403);
    return failure('UNAVAILABLE', 503);
  }
}
