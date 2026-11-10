import { apiContext, boundedBody, failure, reply } from '../../../../../lib/api/server';
import { serverClient } from '../../../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Ops-only email outbox status and flag. Nothing sends yet (E1). */
export async function GET(request: Request) {
  const ctx = await apiContext(request, 'ops');
  if (ctx.response) return ctx.response;
  if (!ctx.actor.roles.includes('ops')) return failure('FORBIDDEN', 403);
  try {
    const client = await serverClient();
    if (!client) throw new Error('unavailable');
    const response = await client.rpc('kinnso_ops_email_outbox_status');
    if (response.error) throw new Error(response.error.message);
    const data = (response.data ?? {}) as { enabled?: boolean; pending?: number; failed?: number; oldestPendingAt?: string | null };
    return reply({
      ok: true,
      data: {
        enabled: data.enabled === true,
        pending: data.pending ?? 0,
        failed: data.failed ?? 0,
        oldestPendingAt: data.oldestPendingAt ?? null,
        provider: process.env.KINNSO_EMAIL_PROVIDER ?? 'none',
        sending: false,
      },
    });
  } catch {
    return failure('UNAVAILABLE', 503);
  }
}

/** Ops-only flag toggle for the outbox (provider still unconfigured, so no send). */
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
    const response = await client.rpc('kinnso_ops_set_email_outbox', { p_enabled: body.enabled });
    if (response.error) throw new Error(response.error.message);
    return reply({ ok: true, data: response.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/forbidden/.test(message)) return failure('FORBIDDEN', 403);
    return failure('UNAVAILABLE', 503);
  }
}
