/** Provider webhook verification and event reduction (P3).
 *
 * Signatures follow the Stripe convention: `t=<unix seconds>,v1=<hex hmac>[,v1=...]`
 * over `${timestamp}.${rawBody}`, HMAC-SHA256 with the endpoint secret. Verification
 * is pure and bounded (5-minute tolerance, 64 KiB body cap) so a forged or replayed
 * request can be rejected before any database call. Nothing here trusts the provider
 * payload for state: the database decides the transition.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const WEBHOOK_TOLERANCE_SECONDS = 300;
export const MAX_WEBHOOK_BYTES = 65536;
export const SUPPORTED_WEBHOOK_TYPES = [
  'checkout.session.completed',
  'checkout.session.expired',
  'payment_intent.payment_failed',
  'charge.refunded',
] as const;

export function webhookSecret(env: Record<string, string | undefined> = process.env): string {
  return env.KINNSO_PAYMENTS_WEBHOOK_SECRET ?? env.STRIPE_WEBHOOK_SECRET ?? '';
}

export type SignatureResult =
  | { ok: true }
  | { ok: false; reason: 'missing' | 'malformed' | 'stale' | 'mismatch' };

export function verifyWebhookSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): SignatureResult {
  if (!secret) return { ok: false, reason: 'missing' };
  if (!header) return { ok: false, reason: 'missing' };
  let timestamp = '';
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key === 't' && value) timestamp = value;
    else if ((key === 'v1' || key === 'v0') && value) signatures.push(value);
  }
  if (!/^\d{1,12}$/.test(timestamp) || signatures.length === 0) return { ok: false, reason: 'malformed' };
  const at = Number(timestamp);
  if (!Number.isSafeInteger(at) || Math.abs(nowSeconds - at) > WEBHOOK_TOLERANCE_SECONDS) {
    return { ok: false, reason: 'stale' };
  }
  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  const expectedBytes = Buffer.from(expected, 'hex');
  for (const candidate of signatures) {
    if (!/^[0-9a-f]{64}$/i.test(candidate)) continue;
    const bytes = Buffer.from(candidate.toLowerCase(), 'hex');
    if (bytes.length === expectedBytes.length && timingSafeEqual(bytes, expectedBytes)) return { ok: true };
  }
  return { ok: false, reason: 'mismatch' };
}

export type WebhookEvent = {
  id: string;
  type: string;
  paymentId: string | null;
  payload: Record<string, unknown>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function identifier(value: unknown, max: number): string {
  return typeof value === 'string' && value.trim() !== '' && value.length <= max ? value.trim() : '';
}

function objectId(value: unknown, max: number): string {
  if (typeof value === 'string') return identifier(value, max);
  if (value && typeof value === 'object') return identifier((value as { id?: unknown }).id, max);
  return '';
}

/** Reduce a signed provider event to the bounded fields the ledger needs.
 *  Unknown shapes fail closed; an event without a known payment is still recorded
 *  (unmapped) so the provider's retries can stop. */
export function parseWebhookEvent(rawBody: string): WebhookEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const event = parsed as { id?: unknown; type?: unknown; data?: { object?: unknown } };
  const id = identifier(event.id, 200);
  const type = identifier(event.type, 100);
  const object = event.data?.object;
  if (!id || !type || !object || typeof object !== 'object') return null;
  const record = object as Record<string, unknown>;
  const metadata = record.metadata && typeof record.metadata === 'object'
    ? (record.metadata as Record<string, unknown>)
    : {};
  const rawPayment = identifier(record.client_reference_id, 64) || identifier(metadata.payment_id, 64);
  const payload: Record<string, unknown> = {
    sessionId: identifier(record.id, 200) || null,
    paymentIntentId: objectId(record.payment_intent, 200) || null,
    amountTotal: typeof record.amount_total === 'number' && Number.isSafeInteger(record.amount_total) ? record.amount_total : null,
    currency: identifier(record.currency, 8).toLowerCase() || null,
    mode: identifier(record.mode, 20) || null,
    paymentStatus: identifier(record.payment_status ?? record.status, 30) || null,
  };
  if (type === 'charge.refunded') {
    // A Charge has no client_reference_id; the payment is resolved later from the
    // stored payment intent. `refund` is the single full-refund id on the charge.
    payload.refundId = objectId(record.refund, 200) || null;
    payload.amountRefunded = typeof record.amount_refunded === 'number' && Number.isSafeInteger(record.amount_refunded) ? record.amount_refunded : null;
    payload.refunded = typeof record.refunded === 'boolean' ? record.refunded : null;
  }
  return { id, type, paymentId: UUID.test(rawPayment) ? rawPayment.toLowerCase() : null, payload };
}
