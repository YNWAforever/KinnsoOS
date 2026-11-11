/** Email provider adapter (E2b — Resend, owner-approved default).
 *
 * The queue is provider-agnostic. `resend` posts to the Resend API with an
 * idempotency key so a retried send cannot duplicate; `console`/`console-fail`
 * exercise the pipeline without an account; `none` means no provider is configured
 * and the sender cron must not run. Credentials come only from env, and errors are
 * reduced to status + short provider message (never the key).
 */
export type EmailMessage = { to: string; subject: string; text: string; idempotencyKey: string };
export type EmailAdapter = {
  name: string;
  configured: boolean;
  send(message: EmailMessage): Promise<{ id: string }>;
};

const RESEND_DEFAULT_BASE = 'https://api.resend.com';

export function emailProvider(env: Record<string, string | undefined> = process.env): EmailAdapter {
  const kind = env.KINNSO_EMAIL_PROVIDER ?? 'none';
  if (kind === 'resend') {
    const apiKey = env.KINNSO_EMAIL_API_KEY ?? '';
    const from = env.KINNSO_EMAIL_FROM ?? '';
    const base = (env.KINNSO_EMAIL_API_BASE ?? RESEND_DEFAULT_BASE).replace(/\/$/, '');
    return {
      name: 'resend',
      configured: Boolean(apiKey && from),
      async send(message) {
        if (!message.to) throw new Error('recipient-missing');
        if (!apiKey || !from) throw new Error('email-provider-not-configured');
        const response = await fetch(`${base}/emails`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': message.idempotencyKey.slice(0, 256),
          },
          body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text }),
          signal: AbortSignal.timeout(10_000),
        });
        const detail = (await response.text().catch(() => '')).slice(0, 160);
        if (!response.ok) throw new Error(`resend ${response.status}: ${detail || 'send-failed'}`);
        let id = '';
        try {
          id = (JSON.parse(detail) as { id?: string }).id ?? '';
        } catch {
          id = '';
        }
        return { id: id || `resend-unknown:${message.idempotencyKey}` };
      },
    };
  }
  if (kind === 'console') {
    return {
      name: 'console',
      configured: true,
      async send(message) {
        if (!message.to) throw new Error('recipient-missing');
        return { id: `console:${message.idempotencyKey}` };
      },
    };
  }
  if (kind === 'console-fail') {
    return {
      name: 'console-fail',
      configured: true,
      async send() {
        throw new Error('console adapter failure (test mode)');
      },
    };
  }
  return {
    name: kind,
    configured: false,
    async send() {
      throw new Error('email-provider-not-configured');
    },
  };
}

export function emailServiceKey(env: Record<string, string | undefined> = process.env): string {
  return env.KINNSO_SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY ?? env.KINNSO_SUPABASE_SECRET_KEY ?? '';
}
