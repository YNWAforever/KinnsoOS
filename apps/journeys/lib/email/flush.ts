import { createClient } from '@supabase/supabase-js';
import { emailProvider, emailServiceKey } from './provider';
import { renderBookingEmail, type EmailPayload } from './templates';

/** Retry backoff for a failed send, in seconds. */
const BACKOFF_SECONDS = [60, 300, 900, 3600, 21600];
const MAX_ATTEMPTS = BACKOFF_SECONDS.length;

type OutboxRow = {
  id: string;
  recipient_user_id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  payload: EmailPayload | null;
  attempts: number;
};

export type FlushResult = {
  provider: string;
  configured: boolean;
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  reason?: string;
};

/** Send due outbox rows once. Claims each row before sending so overlapping runs
 *  cannot double-send; failures retry with backoff and stop after MAX_ATTEMPTS. */
export async function flushEmailOutbox(env: Record<string, string | undefined> = process.env, limit = 20): Promise<FlushResult> {
  const provider = emailProvider(env);
  const result: FlushResult = { provider: provider.name, configured: provider.configured, processed: 0, sent: 0, failed: 0, skipped: 0 };
  const origin = env.KINNSO_SUPABASE_URL ?? '';
  const key = emailServiceKey(env);
  if (!provider.configured) return { ...result, reason: 'provider-not-configured' };
  if (!origin || !key) return { ...result, reason: 'service-role-missing' };
  const client = createClient(origin, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const enabled = await client.rpc('kinnso_email_delivery_enabled');
  if (enabled.error || enabled.data !== true) return { ...result, reason: 'outbox-flag-off' };

  const due = await client
    .from('email_outbox')
    .select('id, recipient_user_id, event_type, entity_type, entity_id, payload, attempts')
    .eq('status', 'pending')
    .lte('next_attempt_at', new Date().toISOString())
    .order('next_attempt_at')
    .limit(limit);
  const rows = (due.data ?? []) as OutboxRow[];
  if (due.error) return { ...result, reason: 'outbox-read-failed' };

  for (const row of rows) {
    const claimed = await client
      .from('email_outbox')
      .update({ status: 'sending', updated_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('status', 'pending')
      .select('id');
    if (claimed.error || !claimed.data || claimed.data.length === 0) {
      result.skipped += 1;
      continue;
    }
    result.processed += 1;
    const attempts = row.attempts + 1;
    try {
      const user = await client.auth.admin.getUserById(row.recipient_user_id);
      const to = user.data?.user?.email ?? '';
      if (!to) throw new Error('recipient-email-missing');
      const site = env.KINNSO_SITE_URL ?? '';
      const body = renderBookingEmail(row.event_type, row.payload ?? {}, site);
      const sent = await provider.send({ to, subject: body.subject, text: body.text, idempotencyKey: row.id });
      await client
        .from('email_outbox')
        .update({ status: 'sent', attempts, provider_message_id: sent.id, last_error: null, updated_at: new Date().toISOString() })
        .eq('id', row.id);
      result.sent += 1;
    } catch (error) {
      const message = (error instanceof Error ? error.message : 'send-failed').slice(0, 200);
      if (attempts >= MAX_ATTEMPTS) {
        await client
          .from('email_outbox')
          .update({ status: 'failed', attempts, last_error: message, updated_at: new Date().toISOString() })
          .eq('id', row.id);
        result.failed += 1;
      } else {
        const delay = BACKOFF_SECONDS[Math.min(attempts, MAX_ATTEMPTS - 1)] ?? 60;
        await client
          .from('email_outbox')
          .update({
            status: 'pending',
            attempts,
            last_error: message,
            next_attempt_at: new Date(Date.now() + delay * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id);
        result.failed += 1;
      }
    }
  }
  return result;
}
