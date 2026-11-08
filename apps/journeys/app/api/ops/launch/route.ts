import { apiContext, boundedBody, failure, reply } from '../../../../lib/api/server';
import { serverClient } from '../../../../lib/supabase/server';
import { contentReadiness } from '../../../../lib/content-honesty/server';

export const dynamic = 'force-dynamic';

type LaunchSignoff = { gate: string; status: 'accepted' | 'waived' | 'rejected'; note: string; actorId: string; signedAt: string };
type LaunchState = {
  content: { published: number; synthetic: number; unverified: number; verified: number; ready: boolean };
  signoffs: Record<string, LaunchSignoff>;
};

const GATES = ['rollback', 'backup', 'privacy', 'accessibility', 'devices', 'payments'] as const;
type Gate = (typeof GATES)[number];

/** Human launch gates and how they are satisfied by automation. */
function evaluate(state: LaunchState, env: Record<string, string | undefined>) {
  const signoff = (gate: Gate) => state.signoffs[gate]?.status ?? null;
  const satisfied = (gate: Gate) => signoff(gate) === 'accepted' || signoff(gate) === 'waived';
  const alertsBound = Boolean(env.KINNSO_ALERT_WEBHOOK_URL && env.CRON_SECRET);
  const gates = [
    {
      gate: 'content',
      kind: 'automatic',
      status: state.content.ready ? 'accepted' : 'blocked',
      detail: `${state.content.verified} verified · ${state.content.unverified} unverified · ${state.content.synthetic} synthetic · ${state.content.published} published`,
      signedAt: null,
    },
    {
      gate: 'alerting',
      kind: 'automatic',
      status: alertsBound ? 'accepted' : 'blocked',
      detail: alertsBound ? 'webhook and scheduler secret configured' : 'KINNSO_ALERT_WEBHOOK_URL / CRON_SECRET not configured',
      signedAt: null,
    },
    ...GATES.map((gate) => ({
      gate,
      kind: 'signoff',
      status: satisfied(gate) ? 'accepted' : signoff(gate) === 'rejected' ? 'rejected' : 'pending',
      detail: state.signoffs[gate]?.note ?? '',
      signedAt: state.signoffs[gate]?.signedAt ?? null,
    })),
  ];
  // Payments is out of scope for the free launch: it must be explicitly accepted or
  // waived to count, never silently assumed as done.
  const required = gates.filter((gate) => gate.gate !== 'payments');
  const blockers = required.filter((gate) => gate.status !== 'accepted').map((gate) => gate.gate);
  return { verdict: blockers.length === 0 ? 'launch-ready' : 'hold', blockers, gates };
}

export async function GET(request: Request) {
  const ctx = await apiContext(request, 'ops');
  if (ctx.response) return ctx.response;
  if (!ctx.actor.roles.includes('ops')) return failure('FORBIDDEN', 403);

  try {
    const client = await serverClient();
    if (!client) throw new Error('unavailable');
    const [readiness, response] = await Promise.all([
      contentReadiness(),
      client.rpc('kinnso_ops_launch_state'),
    ]);
    if (response.error) throw new Error(response.error.message);
    const state = response.data as LaunchState;
    const evaluated = evaluate(state, process.env);
    return reply({
      ok: true,
      data: {
        ...evaluated,
        content: state.content,
        readiness: {
          published: readiness.published,
          verified: readiness.verified,
          synthetic: readiness.synthetic,
          unverified: readiness.unverified,
        },
        checkedAt: new Date().toISOString(),
      },
    });
  } catch {
    return failure('UNAVAILABLE', 503);
  }
}

export async function POST(request: Request) {
  const ctx = await apiContext(request, 'ops', true);
  if (ctx.response) return ctx.response;
  if (!ctx.actor.roles.includes('ops')) return failure('FORBIDDEN', 403);

  let input: unknown;
  try {
    input = await boundedBody(request, 8192);
  } catch {
    return failure('INVALID', 400);
  }
  const body = input as { gate?: unknown; status?: unknown; note?: unknown } | null;
  if (!body || typeof body !== 'object') return failure('INVALID', 400);
  if (typeof body.gate !== 'string' || !GATES.includes(body.gate as Gate)) return failure('INVALID', 400);
  if (body.status !== 'accepted' && body.status !== 'waived' && body.status !== 'rejected') return failure('INVALID', 400);
  if (typeof body.note !== 'string' || body.note.trim().length < 20 || body.note.trim().length > 2000) return failure('INVALID', 400);

  try {
    const client = await serverClient();
    if (!client) throw new Error('unavailable');
    const response = await client.rpc('kinnso_ops_sign_off', {
      p_gate: body.gate,
      p_status: body.status,
      p_note: body.note.trim(),
    });
    if (response.error) throw new Error(response.error.message);
    return reply({ ok: true, data: response.data as LaunchState }, 201);
  } catch {
    return failure('UNAVAILABLE', 503);
  }
}
