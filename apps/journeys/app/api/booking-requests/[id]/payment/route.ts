import { apiContext, boundedBody, failure, reply } from '../../../../../lib/api/server';
import { uuid } from '../../../../../lib/api/validation';
import { paymentsProvider } from '../../../../../lib/payments/provider';

export const dynamic = 'force-dynamic';

function mapError(message: string) {
  if (/payments_disabled/.test(message)) return failure('FORBIDDEN', 403);
  if (/booking_not_found|payment_not_found/.test(message)) return failure('NOT_FOUND', 404);
  if (/payment_already_paid|booking_not_payable|payment_expired|checkout_not_pending|fake_provider_required|provider_mismatch/.test(message)) return failure('CONFLICT', 409);
  if (/actor_required|forbidden/.test(message)) return failure('FORBIDDEN', 403);
  if (/invalid_/.test(message)) return failure('INVALID', 400);
  return failure('UNAVAILABLE', 503);
}

/** The traveller reads the payment attached to their own request. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await apiContext(request, 'trips');
  if (ctx.response) return ctx.response;
  const { id } = await context.params;
  if (!uuid(id)) return failure('INVALID', 400);
  try {
    const client = ctx.client;
    if (!client) throw new Error('unavailable');
    const response = await client.rpc('kinnso_traveller_payment', { p_booking_request_id: id, p_payment_id: null });
    if (response.error) throw new Error(response.error.message);
    return reply({ ok: true, data: response.data });
  } catch (error) {
    return mapError(error instanceof Error ? error.message : '');
  }
}

/** Start (or retry) the hosted checkout for the traveller's own accepted request.
 *  The RPC owns the flag/status/deadline checks; the adapter only receives an amount
 *  this server-side read already produced. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await apiContext(request, 'trips', true);
  if (ctx.response) return ctx.response;
  const { id } = await context.params;
  if (!uuid(id)) return failure('INVALID', 400);
  let locale = 'en';
  try {
    const input = await boundedBody(request, 512);
    const body = input as { locale?: unknown } | null;
    if (body && typeof body === 'object' && body.locale === 'zh-HK') locale = 'zh-HK';
  } catch {
    return failure('INVALID', 400);
  }
  const provider = paymentsProvider();
  try {
    const client = ctx.client;
    if (!client) throw new Error('unavailable');
    const summary = await client.rpc('kinnso_traveller_payment', { p_booking_request_id: id, p_payment_id: null });
    if (summary.error) throw new Error(summary.error.message);
    if ((summary.data as { enabled?: boolean } | null)?.enabled !== true) return failure('FORBIDDEN', 403);
    if (!provider.configured) return failure('UNAVAILABLE', 503);
    const started = await client.rpc('kinnso_traveller_start_checkout', { p_booking_request_id: id });
    if (started.error) throw new Error(started.error.message);
    const start = started.data as {
      paymentId: string;
      amountMinor: number;
      currency: string;
      guideTitle: string;
      deadlineAt: string;
      expired?: boolean;
    };
    if (start.expired === true) return failure('CONFLICT', 409);
    const session = await provider.createCheckout({
      paymentId: start.paymentId,
      amountMinor: start.amountMinor,
      currency: start.currency,
      guideTitle: start.guideTitle,
      locale,
    });
    const recorded = await client.rpc('kinnso_traveller_record_checkout', {
      p_payment_id: start.paymentId,
      p_provider: provider.name,
      p_session_id: session.sessionId,
      p_url: session.url,
    });
    if (recorded.error) throw new Error(recorded.error.message);
    return reply({
      ok: true,
      data: {
        url: session.url,
        mode: session.mode,
        paymentId: start.paymentId,
        amountMinor: start.amountMinor,
        currency: start.currency,
        deadlineAt: start.deadlineAt,
      },
    });
  } catch (error) {
    return mapError(error instanceof Error ? error.message : '');
  }
}
