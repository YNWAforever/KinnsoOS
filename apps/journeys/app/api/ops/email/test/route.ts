import { apiContext, failure, reply } from '../../../../../lib/api/server';
import { emailProvider, emailServiceKey } from '../../../../../lib/email/provider';
import { renderBookingEmail } from '../../../../../lib/email/templates';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Ops-only email self-test (E3).
 *
 * Sends exactly one message to the signed-in operator's own address through the
 * same provider seam the cron uses, and reports classification only — never the
 * address or body. It deliberately does not read the outbox flag: testing the
 * provider before enabling delivery is the point. Without a provider or service
 * key it reports that honestly instead of pretending.
 */
export async function POST(request: Request) {
  const ctx = await apiContext(request, 'ops', true);
  if (ctx.response) return ctx.response;
  if (!ctx.actor.roles.includes('ops')) return failure('FORBIDDEN', 403);
  const provider = emailProvider(process.env);
  if (!provider.configured) return reply({ ok: true, data: { delivered: false, provider: provider.name, reason: 'provider-not-configured' } });
  const key = emailServiceKey(process.env);
  const origin = process.env.KINNSO_SUPABASE_URL ?? '';
  if (!key || !origin) return reply({ ok: true, data: { delivered: false, provider: provider.name, reason: 'service-role-missing' } });
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const client = createClient(origin, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const user = await client.auth.admin.getUserById(ctx.actor.id);
    const to = user.data?.user?.email ?? '';
    if (!to) throw new Error('recipient-email-missing');
    const body = renderBookingEmail('email.test', {}, process.env.KINNSO_SITE_URL ?? '');
    const sent = await provider.send({ to, subject: body.subject, text: body.text, idempotencyKey: `self-test:${ctx.actor.id}:${Date.now()}` });
    return reply({ ok: true, data: { delivered: true, provider: provider.name, messageId: sent.id } });
  } catch (error) {
    return reply({ ok: true, data: { delivered: false, provider: provider.name, reason: (error instanceof Error ? error.message : 'send-failed').slice(0, 120) } });
  }
}
