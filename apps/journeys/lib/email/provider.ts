/** Email provider adapter (E2).
 *
 * The queue is provider-agnostic. `console` marks a message sent with a deterministic
 * id so the whole path can be exercised without an account or network; `console-fail`
 * always throws so retry/backoff can be tested; `none` means no provider is chosen and
 * the sender cron must not run. A real provider (Resend/Postmark/SES) becomes another
 * case here once the owner picks one and supplies its credential.
 */
export type EmailMessage = { to: string; subject: string; text: string; idempotencyKey: string };
export type EmailAdapter = {
  name: string;
  configured: boolean;
  send(message: EmailMessage): Promise<{ id: string }>;
};

export function emailProvider(env: Record<string, string | undefined> = process.env): EmailAdapter {
  const kind = env.KINNSO_EMAIL_PROVIDER ?? 'none';
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
