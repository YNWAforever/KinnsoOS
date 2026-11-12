/** Scheduled sweep for expired payment windows and the final-24h reminders.
 *
 * The database owns both rules (deadline passed -> expired + notices; inside the last
 * 24 hours -> one reminder per payment). This module only calls them with the service
 * role, like the provider webhook. No session, no card data, bounded results.
 */
import { paymentsServiceClient } from './service.ts';

export type SweepResult = { configured: boolean; expired: number; reason?: string };
export type ReminderResult = { configured: boolean; reminded: number; reason?: string };

async function call(env: Record<string, string | undefined>, name: string): Promise<Record<string, unknown> | null> {
  const client = paymentsServiceClient(env);
  if (!client) return null;
  const response = await client.rpc(name);
  if (response.error) throw new Error(response.error.message);
  return (response.data ?? {}) as Record<string, unknown>;
}

export async function sweepExpiredPayments(env: Record<string, string | undefined> = process.env): Promise<SweepResult> {
  const data = await call(env, 'kinnso_payment_sweep_expired');
  if (!data) return { configured: false, expired: 0, reason: 'service-key-not-configured' };
  const expired = Number(data.expired ?? 0);
  return { configured: true, expired: Number.isFinite(expired) ? expired : 0 };
}

export async function sendPaymentReminders(env: Record<string, string | undefined> = process.env): Promise<ReminderResult> {
  const data = await call(env, 'kinnso_payment_send_reminders');
  if (!data) return { configured: false, reminded: 0, reason: 'service-key-not-configured' };
  const reminded = Number(data.reminded ?? 0);
  return { configured: true, reminded: Number.isFinite(reminded) ? reminded : 0 };
}
