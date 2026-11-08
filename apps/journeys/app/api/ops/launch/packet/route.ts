import { apiContext, failure, reply } from '../../../../../lib/api/server';
import { serverClient } from '../../../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Machine-readable launch packet: the verdict, every gate and its evidence note,
 * plus deployment identity. This is the artifact a launch decision is recorded
 * against; it contains no user data. */
export async function GET(request: Request) {
  const ctx = await apiContext(request, 'ops');
  if (ctx.response) return ctx.response;
  if (!ctx.actor.roles.includes('ops')) return failure('FORBIDDEN', 403);
  try {
    const client = await serverClient();
    if (!client) throw new Error('unavailable');
    const response = await client.rpc('kinnso_ops_launch_state');
    if (response.error) throw new Error(response.error.message);
    const state = response.data as {
      content: { published: number; synthetic: number; unverified: number; verified: number; ready: boolean };
      signoffs: Record<string, { status: string; note: string; signedAt: string }>;
    };
    const signoff = (gate: string) => state.signoffs[gate] ?? null;
    const automatic = [
      { gate: 'content', status: state.content.ready ? 'accepted' : 'blocked', detail: state.content, signedAt: null },
      {
        gate: 'alerting',
        status: process.env.KINNSO_ALERT_WEBHOOK_URL && process.env.CRON_SECRET ? 'accepted' : 'blocked',
        detail: { webhookConfigured: Boolean(process.env.KINNSO_ALERT_WEBHOOK_URL), schedulerSecretConfigured: Boolean(process.env.CRON_SECRET) },
        signedAt: null,
      },
    ];
    const human = ['rollback', 'backup', 'privacy', 'accessibility', 'devices', 'payments'].map((gate) => {
      const row = signoff(gate);
      return {
        gate,
        status: row ? (row.status === 'rejected' ? 'rejected' : 'accepted') : 'pending',
        decision: row?.status ?? null,
        note: row?.note ?? '',
        signedAt: row?.signedAt ?? null,
      };
    });
    const gates = [...automatic, ...human];
    const required = gates.filter((gate) => gate.gate !== 'payments');
    const blockers = required.filter((gate) => gate.status !== 'accepted').map((gate) => gate.gate);
    return reply({
      ok: true,
      data: {
        packetVersion: 1,
        generatedAt: new Date().toISOString(),
        verdict: blockers.length === 0 ? 'launch-ready' : 'hold',
        blockers,
        gates,
        deployment: {
          commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
          url: process.env.KINNSO_SITE_URL ?? null,
          environment: process.env.VERCEL_ENV ?? process.env.KINNSO_ENVIRONMENT ?? 'unknown',
        },
      },
    });
  } catch {
    return failure('UNAVAILABLE', 503);
  }
}
