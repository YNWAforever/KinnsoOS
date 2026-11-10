/** Alert delivery shared by the scheduler and the operator self-test.
 *
 * The destination is whatever `KINNSO_ALERT_WEBHOOK_URL` points at. When
 * `KINNSO_ALERT_INBOX_TOKEN` is set the delivery also carries it as a header, so
 * the in-product inbox example can authenticate; ordinary destinations (Slack,
 * PagerDuty-style endpoints) simply ignore the extra header.
 */
export type AlertPayload = {
  text: string;
  state: 'ok' | 'unavailable' | 'cost-exhausted' | 'booking-queue-stale' | 'email-delivery-failing' | 'content-not-ready' | 'waivers-expiring' | 'test';
  site?: string;
  checkedAt: string;
  snapshot?: unknown;
  limit?: number;
};

export function alertDestination(env: Record<string, string | undefined>) {
  return {
    url: env.KINNSO_ALERT_WEBHOOK_URL ?? '',
    token: env.KINNSO_ALERT_INBOX_TOKEN ?? '',
    configured: Boolean(env.KINNSO_ALERT_WEBHOOK_URL),
  };
}

export async function deliverAlert(payload: AlertPayload, env: Record<string, string | undefined> = process.env) {
  const destination = alertDestination(env);
  if (!destination.url) return { delivered: false as const, reason: 'webhook-not-configured' as const, status: null };
  const response = await fetch(destination.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(destination.token ? { 'x-kinnso-alert-token': destination.token } : {}),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return { delivered: false as const, reason: 'delivery-failed' as const, status: response.status };
  return { delivered: true as const, reason: null, status: response.status };
}
