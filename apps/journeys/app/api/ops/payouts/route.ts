import { apiContext, boundedBody, failure, reply } from '../../../../lib/api/server';
import { uuid } from '../../../../lib/api/validation';

export const dynamic = 'force-dynamic';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Normalise a YYYY-MM query value to the first day of the month, or null. */
function monthStart(value: unknown): string | null {
  if (typeof value !== 'string' || !MONTH.test(value)) return null;
  return `${value}-01`;
}
function currentMonth(): string {
  return `${new Date().toISOString().slice(0, 7)}-01`;
}
function mapError(message: string) {
  if (/forbidden/.test(message)) return failure('FORBIDDEN', 403);
  if (/invalid_/.test(message)) return failure('INVALID', 400);
  if (/payout_already_recorded|no_earnings|mixed_currency/.test(message)) return failure('CONFLICT', 409);
  return failure('UNAVAILABLE', 503);
}

/** Monthly creator payout accrual for the operations dashboard.
 *
 * GET returns the paid-booking accrual for one calendar month (gross, 15% commission,
 * net) per creator and any payout already recorded for that month. POST records the
 * manual bank transfer after it happened; the database re-checks the active-ops role and
 * refuses a second payout for the same creator and month.
 */
export async function GET(request: Request) {
  const ctx = await apiContext(request, 'ops', false);
  if (ctx.response) return ctx.response;
  if (!ctx.actor.roles.includes('ops')) return failure('FORBIDDEN', 403);
  const raw = new URL(request.url).searchParams.get('month');
  const start = raw === null ? currentMonth() : monthStart(raw);
  if (!start) return failure('INVALID', 400);
  try {
    const client = ctx.client;
    if (!client) throw new Error('unavailable');
    const response = await client.rpc('kinnso_ops_payout_accrual', { p_month: start });
    if (response.error) throw new Error(response.error.message);
    return reply({ ok: true, data: response.data });
  } catch (error) {
    return mapError(error instanceof Error ? error.message : '');
  }
}

export async function POST(request: Request) {
  const ctx = await apiContext(request, 'ops', true);
  if (ctx.response) return ctx.response;
  if (!ctx.actor.roles.includes('ops')) return failure('FORBIDDEN', 403);
  let body: unknown;
  try {
    body = await boundedBody(request, 4096);
  } catch {
    return failure('INVALID', 400);
  }
  const input = (body ?? {}) as Record<string, unknown>;
  const start = monthStart(input.month);
  const creatorId = uuid(input.creatorId) ? input.creatorId : null;
  const reference = typeof input.reference === 'string' ? input.reference.trim() : '';
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (!start || !creatorId || reference.length < 3 || reference.length > 200 || note.length > 1000) {
    return failure('INVALID', 400);
  }
  try {
    const client = ctx.client;
    if (!client) throw new Error('unavailable');
    const response = await client.rpc('kinnso_ops_record_payout', {
      p_month: start, p_creator_id: creatorId, p_reference: reference, p_note: note || null,
    });
    if (response.error) throw new Error(response.error.message);
    return reply({ ok: true, data: response.data });
  } catch (error) {
    return mapError(error instanceof Error ? error.message : '');
  }
}
