/** Payment provider adapter seam (P2 — fake locally, Stripe hosted checkout later).
 *
 * The checkout page is always provider-hosted: the fake adapter points at our own
 * test-checkout page (no card data, no charge), and the Stripe adapter creates a
 * hosted Checkout Session server-side with a bounded line item. The browser never
 * supplies the amount, and a missing configuration makes the caller refuse instead
 * of charging anything. Errors are reduced to status + a short provider message so
 * no secret can reach a response or a log.
 */
export type CheckoutInput = {
  paymentId: string;
  amountMinor: number;
  currency: string;
  guideTitle: string;
  locale: string;
};

export type CheckoutSession = { url: string; sessionId: string; mode: 'hosted' | 'test' };

export type RefundInput = {
  paymentId: string;
  paymentIntentId: string;
  amountMinor: number;
  currency: string;
};

export type RefundResult = { id: string; status: 'succeeded' | 'pending' };

export type PaymentAdapter = {
  name: 'fake' | 'stripe' | 'none';
  configured: boolean;
  createCheckout(input: CheckoutInput): Promise<CheckoutSession>;
  refund(input: RefundInput): Promise<RefundResult>;
};

/** Deterministic provider refund id for the fake adapter: no money moves and the id
 *  is stable for a payment, so a retried refund records the same id. */
function fakeRefundId(paymentId: string): string {
  return `re_fake_${paymentId.replace(/[^0-9a-f]/gi, '').slice(0, 40)}`;
}

const STRIPE_DEFAULT_BASE = 'https://api.stripe.com';

function cleanSite(siteUrl: string): string {
  return siteUrl.replace(/\/+$/, '');
}

export function paymentsProvider(env: Record<string, string | undefined> = process.env): PaymentAdapter {
  const kind = env.KINNSO_PAYMENTS_PROVIDER ?? 'none';
  const siteUrl = cleanSite(env.KINNSO_SITE_URL ?? '');
  if (kind === 'fake') {
    return {
      name: 'fake',
      configured: Boolean(siteUrl),
      async createCheckout(input) {
        if (!siteUrl) throw new Error('payments-provider-not-configured');
        const locale = input.locale === 'zh-HK' ? 'zh-HK' : 'en';
        return {
          url: `${siteUrl}/api/payments/fake/checkout/${input.paymentId}?locale=${locale}`,
          sessionId: `fake_${input.paymentId}`,
          mode: 'test',
        };
      },
      async refund(input) {
        if (!siteUrl) throw new Error('payments-provider-not-configured');
        return { id: fakeRefundId(input.paymentId), status: 'succeeded' };
      },
    };
  }
  if (kind === 'stripe') {
    const secretKey = env.STRIPE_SECRET_KEY ?? '';
    const base = (env.KINNSO_PAYMENTS_API_BASE ?? STRIPE_DEFAULT_BASE).replace(/\/+$/, '');
    return {
      name: 'stripe',
      configured: Boolean(secretKey && siteUrl),
      async createCheckout(input) {
        if (!secretKey || !siteUrl) throw new Error('payments-provider-not-configured');
        const locale = input.locale === 'zh-HK' ? 'zh-HK' : 'en';
        const returnUrl = `${siteUrl}/${locale}/requests`;
        const form = new URLSearchParams();
        form.set('mode', 'payment');
        form.set('success_url', `${returnUrl}?paid=1`);
        form.set('cancel_url', `${returnUrl}?pay_cancelled=1`);
        form.set('client_reference_id', input.paymentId);
        form.set('metadata[payment_id]', input.paymentId);
        form.set('line_items[0][quantity]', '1');
        form.set('line_items[0][price_data][currency]', input.currency.toLowerCase());
        form.set('line_items[0][price_data][unit_amount]', String(input.amountMinor));
        form.set('line_items[0][price_data][product_data][name]', input.guideTitle.slice(0, 120));
        const response = await fetch(`${base}/v1/checkout/sessions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${secretKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: form.toString(),
          signal: AbortSignal.timeout(10_000),
        });
        const detail = (await response.text().catch(() => '')).slice(0, 160);
        if (!response.ok) throw new Error(`stripe ${response.status}: ${detail || 'checkout-failed'}`);
        let parsed: { id?: unknown; url?: unknown } = {};
        try {
          parsed = JSON.parse(detail) as { id?: unknown; url?: unknown };
        } catch {
          parsed = {};
        }
        if (typeof parsed.id !== 'string' || !parsed.id || typeof parsed.url !== 'string' || !parsed.url) {
          throw new Error('stripe checkout response missing id/url');
        }
        return { url: parsed.url, sessionId: parsed.id, mode: 'hosted' };
      },
      async refund(input) {
        if (!secretKey) throw new Error('payments-provider-not-configured');
        const form = new URLSearchParams();
        form.set('payment_intent', input.paymentIntentId);
        form.set('amount', String(input.amountMinor));
        form.set('metadata[payment_id]', input.paymentId);
        const response = await fetch(`${base}/v1/refunds`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${secretKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Idempotency-Key': `refund_${input.paymentId}`,
          },
          body: form.toString(),
          signal: AbortSignal.timeout(10_000),
        });
        const detail = (await response.text().catch(() => '')).slice(0, 160);
        if (!response.ok) throw new Error(`stripe ${response.status}: ${detail || 'refund-failed'}`);
        let parsed: { id?: unknown; status?: unknown } = {};
        try {
          parsed = JSON.parse(detail) as { id?: unknown; status?: unknown };
        } catch {
          parsed = {};
        }
        if (typeof parsed.id !== 'string' || !parsed.id) throw new Error('stripe refund response missing id');
        if (parsed.status === 'succeeded') return { id: parsed.id, status: 'succeeded' };
        if (parsed.status === 'pending') return { id: parsed.id, status: 'pending' };
        throw new Error(`stripe refund status ${typeof parsed.status === 'string' ? parsed.status : 'unknown'}`);
      },
    };
  }
  return {
    name: 'none',
    configured: false,
    async createCheckout() {
      throw new Error('payments-provider-not-configured');
    },
    async refund() {
      throw new Error('payments-provider-not-configured');
    },
  };
}
