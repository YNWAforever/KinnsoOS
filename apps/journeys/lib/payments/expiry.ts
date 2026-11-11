/** Scheduled sweep for expired payment windows.
 *
 * The database owns the rule (deadline passed -> payment expired, booking
 * payment_expired, one ledger event per payment); this module only calls it with the
 * service role, like the provider webhook. No session, no card data, bounded result.
 */
import { paymentsServiceClient } from './service.ts';

export type SweepResult = { configured: boolean; expired: number; reason?: string };

export async function sweepExpiredPayments(env: Record<string, string | undefined> = process.env): Promise<SweepResult> {
  const client = paymentsServiceClient(env);
  if (!client) return { configured: false, expired: 0, reason: 'service-key-not-configured' };
  const response = await client.rpc('kinnso_payment_sweep_expired');
  if (response.error) throw new Error(response.error.message);
  const expired = Number((response.data as { expired?: unknown } | null)?.expired ?? 0);
  return { configured: true, expired: Number.isFinite(expired) ? expired : 0 };
}
