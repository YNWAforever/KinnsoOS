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

/** Ops-only payments control: status, the enable toggle, and audited refunds.
 *  Refunds are recorded only for the fake provider in P1; live provider refunds are P4. */
export async function GET(request: Request) {
  const ctx = await apiContext(request, 'ops');
  if (ctx.response) return ctx.response;
  if (!ctx.actor.roles.includes('ops')) return failure('FORBIDDEN', 403);
  try {
    const client = await serverClient();
    if (!client) throw new Error('unavailable');
    const response = await client.rpc('kinnso_ops_payments_status');
    if (response.error) throw new Error(response.error.message);
    const provider = paymentsProvider();
    return reply({ ok: true, data: { ...(response.data ?? {}), provider: provider.name, providerConfigured: provider.configured } });
  } catch {
    return failure('UNAVAILABLE', 503);
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
