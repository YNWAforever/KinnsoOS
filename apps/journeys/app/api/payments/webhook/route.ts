/** Signed provider webhook ingestion (P3).
 *
 * The provider posts JSON with a Stripe-style signature header. The route verifies
 * the signature over the raw body before parsing, reduces the event to the bounded
 * fields the ledger needs, and calls a service-role-only RPC. It is inert until
 * KINNSO_PAYMENTS_WEBHOOK_SECRET is configured: unconfigured environments (including
 * production while payments are off) answer 503 and touch nothing.
 */
import { paymentsProvider } from '../../../../lib/payments/provider';
import { paymentsServiceClient } from '../../../../lib/payments/service';
import {
  MAX_WEBHOOK_BYTES,
  SUPPORTED_WEBHOOK_TYPES,
  parseWebhookEvent,
  verifyWebhookSignature,
  webhookSecret,
} from '../../../../lib/payments/webhook';

export const dynamic = 'force-dynamic';

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

function failure(status: number, code: string) {
  return reply({ received: false, error: code }, status);
}

async function readBody(request: Request): Promise<string | null> {
  const length = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(length) && length > MAX_WEBHOOK_BYTES) return null;
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > MAX_WEBHOOK_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function POST(request: Request) {
  const secret = webhookSecret();
  const provider = paymentsProvider();
  if (!secret || (provider.name !== 'fake' && provider.name !== 'stripe')) {
    return failure(503, 'not_configured');
  }
  const rawBody = await readBody(request);
  if (rawBody === null) return failure(400, 'invalid_body');
  const signature = verifyWebhookSignature(rawBody, request.headers.get('stripe-signature'), secret);
  if (!signature.ok) return failure(400, 'invalid_signature');
  const event = parseWebhookEvent(rawBody);
  if (!event) return failure(400, 'invalid_payload');
  if (!(SUPPORTED_WEBHOOK_TYPES as readonly string[]).includes(event.type)) {
    return reply({ received: true, ignored: true, reason: 'unsupported-event' });
  }
  const client = paymentsServiceClient();
  if (!client) return failure(503, 'unavailable');
  try {
    // Charge-level refund events have no client_reference_id, so they take the
    // refund-specific ingestion path that can resolve the payment from its intent.
    const refunding = event.type === 'charge.refunded';
    const response = await client.rpc(refunding ? 'kinnso_payment_refund_ingest' : 'kinnso_payment_webhook_ingest', {
      p_provider: provider.name,
      p_event_id: event.id,
      p_event_type: event.type,
      p_payment_id: event.paymentId,
      p_payload: event.payload,
    });
    if (response.error) {
      if (/invalid_webhook/.test(response.error.message ?? '')) return failure(400, 'invalid_webhook');
      return failure(503, 'unavailable');
    }
    const data = (response.data ?? {}) as { replayed?: unknown; ignored?: unknown; refunded?: unknown; providerRefundId?: unknown };
    return reply({
      received: true,
      replayed: data.replayed === true,
      ...(typeof data.ignored === 'string' && data.ignored ? { ignored: data.ignored } : {}),
      ...(data.refunded === true ? { refunded: true } : {}),
      ...(typeof data.providerRefundId === 'string' && data.providerRefundId ? { providerRefundId: data.providerRefundId } : {}),
    });
  } catch {
    return failure(503, 'unavailable');
  }
}
