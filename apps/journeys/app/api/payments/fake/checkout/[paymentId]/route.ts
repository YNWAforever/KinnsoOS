import { apiContext, failure } from '../../../../../../lib/api/server';
import { uuid } from '../../../../../../lib/api/validation';
import { formatMoneyMinor, formatPaymentDeadline } from '../../../../../../lib/payments/format';
import { paymentsProvider } from '../../../../../../lib/payments/provider';

export const dynamic = 'force-dynamic';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}

function page(body: string): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Test checkout — Kinnso</title>
<style>
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#f6f7f9;color:#111}
main{max-width:460px;margin:8vh auto;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:28px}
h1{font-size:20px;margin:0 0 4px}
.meta{color:#556;font-size:14px;margin:6px 0}
.amount{font-size:30px;font-weight:700;margin:18px 0}
.badge{display:inline-block;background:#fff7e6;color:#8a5a00;border:1px solid #f0d9a8;border-radius:999px;padding:2px 10px;font-size:12px;margin-bottom:14px}
button{width:100%;padding:12px 16px;font-size:16px;border:0;border-radius:10px;background:#14532d;color:#fff;cursor:pointer}
a{display:block;text-align:center;margin-top:12px;color:#556;font-size:14px}
</style>
</head>
<body><main data-testid="fake-checkout">${body}</main></body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', Vary: 'Cookie' },
  });
}

/** Provider-hosted checkout page for the fake adapter (local/acceptance only):
 *  clearly labelled test mode, no card fields and no charge. */
export async function GET(request: Request, context: { params: Promise<{ paymentId: string }> }) {
  const ctx = await apiContext(request, 'trips');
  if (ctx.response) return ctx.response;
  const { paymentId } = await context.params;
  if (!uuid(paymentId)) return failure('INVALID', 400);
  if (paymentsProvider().name !== 'fake') return failure('NOT_FOUND', 404);
  const siteUrl = (process.env.KINNSO_SITE_URL ?? new URL(request.url).origin).replace(/\/+$/, '');
  const locale = new URL(request.url).searchParams.get('locale') === 'zh-HK' ? 'zh-HK' : 'en';
  try {
    const client = ctx.client;
    if (!client) throw new Error('unavailable');
    const response = await client.rpc('kinnso_traveller_payment', { p_booking_request_id: null, p_payment_id: paymentId });
    if (response.error) throw new Error(response.error.message);
    const data = response.data as {
      paymentStatus: string;
      bookingStatus: string;
      amountMinor: number;
      currency: string;
      deadlineAt: string | null;
      guideTitle: string;
    };
    if (data.paymentStatus === 'paid' || data.bookingStatus === 'paid') {
      return Response.redirect(`${siteUrl}/${locale}/requests?paid=1`, 303);
    }
    if (data.paymentStatus === 'expired' || data.bookingStatus === 'payment_expired') {
      return page(`<h1>Payment window closed</h1>
<p class="meta">This test checkout has expired. Nothing was charged.</p>
<a href="${siteUrl}/${locale}/requests">Back to my requests</a>`);
    }
    return page(`<span class="badge">Test mode — no money is charged</span>
<h1>${escapeHtml(data.guideTitle)}</h1>
<p class="meta">Amount due</p>
<div class="amount" data-testid="fake-checkout-amount" data-amount-minor="${data.amountMinor}">${escapeHtml(formatMoneyMinor(data.amountMinor, data.currency))}</div>
<p class="meta">Pay before ${escapeHtml(formatPaymentDeadline(data.deadlineAt))}</p>
<form method="post" action="/api/payments/fake/confirm">
<input type="hidden" name="paymentId" value="${escapeHtml(paymentId)}" />
<input type="hidden" name="locale" value="${locale}" />
<button type="submit" data-testid="fake-checkout-confirm">Confirm test payment</button>
</form>
<a href="${siteUrl}/${locale}/requests">Cancel</a>`);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/payment_not_found/.test(message)) return failure('NOT_FOUND', 404);
    if (/forbidden/.test(message)) return failure('FORBIDDEN', 403);
    return failure('UNAVAILABLE', 503);
  }
}
