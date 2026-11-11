import { apiContext, boundedBody, failure, reply } from '../../../../../lib/api/server';
import { uuid } from '../../../../../lib/api/validation';
import { paymentsProvider } from '../../../../../lib/payments/provider';

export const dynamic = 'force-dynamic';

function errorCode(message: string): string {
  if (/payments_disabled/.test(message)) return 'payments-disabled';
  if (/payment_expired/.test(message)) return 'payment-expired';
  if (/fake_provider_required/.test(message)) return 'provider-mismatch';
  if (/payment_not_payable|checkout_not_pending/.test(message)) return 'not-payable';
  if (/payment_not_found/.test(message)) return 'not-found';
  if (/forbidden/.test(message)) return 'forbidden';
  return 'unavailable';
}

function mapError(message: string) {
  if (/payments_disabled|forbidden/.test(message)) return failure('FORBIDDEN', 403);
  if (/payment_not_found/.test(message)) return failure('NOT_FOUND', 404);
  if (/payment_expired|payment_not_payable|checkout_not_pending|fake_provider_required/.test(message)) return failure('CONFLICT', 409);
  return failure('UNAVAILABLE', 503);
}

/** Confirm the fake provider's test checkout (local/acceptance only).
 *  A browser form post redirects back to the request list; a fetch call gets JSON.
 *  Confirmation is one-way and replay-safe in the database. */
export async function POST(request: Request) {
  const isForm = (request.headers.get('content-type') ?? '').includes('application/x-www-form-urlencoded');
  const ctx = await apiContext(request, 'trips', true);
  if (ctx.response) return ctx.response;
  if (paymentsProvider().name !== 'fake') return failure('NOT_FOUND', 404);
  let paymentId: unknown = null;
  let locale = 'en';
  try {
    if (isForm) {
      const form = await request.formData();
      paymentId = form.get('paymentId');
      locale = form.get('locale') === 'zh-HK' ? 'zh-HK' : 'en';
    } else {
      const body = (await boundedBody(request, 1024)) as { paymentId?: unknown } | null;
      paymentId = body && typeof body === 'object' ? body.paymentId : null;
    }
  } catch {
    return failure('INVALID', 400);
  }
  if (!uuid(paymentId)) return failure('INVALID', 400);
  const siteUrl = (process.env.KINNSO_SITE_URL ?? new URL(request.url).origin).replace(/\/+$/, '');
  try {
    const client = ctx.client;
    if (!client) throw new Error('unavailable');
    const response = await client.rpc('kinnso_traveller_confirm_fake_payment', { p_payment_id: paymentId });
    if (response.error) throw new Error(response.error.message);
    if ((response.data as { expired?: boolean } | null)?.expired === true) throw new Error('payment_expired');
    if (isForm) return Response.redirect(`${siteUrl}/${locale}/requests?paid=1`, 303);
    return reply({ ok: true, data: response.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (isForm) return Response.redirect(`${siteUrl}/${locale}/requests?pay_error=${errorCode(message)}`, 303);
    return mapError(message);
  }
}
