import { apiContext, boundedBody, failure, reply } from '../../../../lib/api/server';
import { paymentsProvider } from '../../../../lib/payments/provider';
import { serverClient } from '../../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

function mapError(message: string) {
  if (/forbidden/.test(message)) return failure('FORBIDDEN', 403);
  if (/payment_not_found/.test(message)) return failure('NOT_FOUND', 404);
  if (/payment_not_refundable|provider_refund_not_implemented/.test(message)) return failure('CONFLICT', 409);
  if (/invalid_reason/.test(message)) return failure('INVALID', 400);
  return failure('UNAVAILABLE', 503);
}

/** Ops-only payments control: money states, provider ledger, audited refunds and the
 *  enable toggle. Refunds are recorded only for the fake provider until P5. */
export async function GET(request: Request) {
  const ctx = await apiContext(request, 'ops');
  if (ctx.response) return ctx.response;
  if (!ctx.actor.roles.includes('ops')) return failure('FORBIDDEN', 403);
  const paymentId = new URL(request.url).searchParams.get('paymentId');
  if (paymentId !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(paymentId)) {
    return failure('INVALID', 400);
  }
  try {
    const client = await serverClient();
    if (!client) throw new Error('unavailable');
    if (paymentId !== null) {
      const detail = await client.rpc('kinnso_ops_payment_detail', { p_payment_id: paymentId });
      if (detail.error) throw new Error(detail.error.message);
      return reply({ ok: true, data: detail.data });
    }
    const [status, list, events] = await Promise.all([
      client.rpc('kinnso_ops_payments_status'),
      client.rpc('kinnso_ops_payments_list', { p_limit: 100 }),
      client.rpc('kinnso_ops_webhook_events', { p_limit: 50 }),
    ]);
    if (status.error) throw new Error(status.error.message);
    if (list.error) throw new Error(list.error.message);
    if (events.error) throw new Error(events.error.message);
    const provider = paymentsProvider();
    return reply({
      ok: true,
      data: {
        ...(status.data ?? {}),
        provider: provider.name,
        providerConfigured: provider.configured,
        payments: list.data ?? { items: [], hasMore: false },
        webhookEvents: events.data ?? { items: [], counts: {}, total: 0 },
      },
    });
  } catch (error) {
    return mapError(error instanceof Error ? error.message : '');
  }
}

export async function PUT(request: Request) {
  const ctx = await apiContext(request, 'ops', true);
  if (ctx.response) return ctx.response;
  if (!ctx.actor.roles.includes('ops')) return failure('FORBIDDEN', 403);
  let input: unknown;
  try {
    input = await boundedBody(request, 1024);
  } catch {
    return failure('INVALID', 400);
  }
  const body = input as { enabled?: unknown } | null;
  if (!body || typeof body !== 'object' || typeof body.enabled !== 'boolean') return failure('INVALID', 400);
  try {
    const client = await serverClient();
    if (!client) throw new Error('unavailable');
    const response = await client.rpc('kinnso_ops_set_payments_enabled', { p_enabled: body.enabled });
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
  let input: unknown;
  try {
    input = await boundedBody(request, 2048);
  } catch {
    return failure('INVALID', 400);
  }
  const body = input as { paymentId?: unknown; reason?: unknown } | null;
  if (!body || typeof body !== 'object' || typeof body.paymentId !== 'string' || typeof body.reason !== 'string') return failure('INVALID', 400);
  try {
    const client = await serverClient();
    if (!client) throw new Error('unavailable');
    const response = await client.rpc('kinnso_ops_refund_payment', { p_payment_id: body.paymentId, p_reason: body.reason });
    if (response.error) throw new Error(response.error.message);
    return reply({ ok: true, data: response.data });
  } catch (error) {
    return mapError(error instanceof Error ? error.message : '');
  }
}
