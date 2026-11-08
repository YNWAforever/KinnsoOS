import { failure, reply } from '../../../../../lib/api/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** In-product alert inbox.
 *
 * A destination the project can own without an external account: it authenticates
 * with `KINNSO_ALERT_INBOX_TOKEN` and records the delivery in the deployment log.
 * It exists so alert delivery can be exercised end-to-end before the owner points
 * `KINNSO_ALERT_WEBHOOK_URL` at their real destination. It stores nothing.
 */
export async function POST(request: Request) {
  const token = process.env.KINNSO_ALERT_INBOX_TOKEN ?? '';
  if (!token) return failure('UNAVAILABLE', 503);
  const supplied = request.headers.get('x-kinnso-alert-token') ?? '';
  if (supplied.length !== token.length || supplied !== token) return failure('AUTH_REQUIRED', 401);
  let payload: unknown = null;
  try {
    payload = await request.json();
  } catch {
    return failure('INVALID', 400);
  }
  const record = payload as { state?: unknown; text?: unknown; checkedAt?: unknown } | null;
  if (!record || typeof record.state !== 'string' || typeof record.text !== 'string') return failure('INVALID', 400);
  // The log line is the receipt: no message bodies, no user data, just the alert state.
  console.log(JSON.stringify({ event: 'ALERT_RECEIVED', state: record.state, checkedAt: record.checkedAt ?? null, text: record.text.slice(0, 300) }));
  return reply({ ok: true, data: { received: true, state: record.state } });
}
