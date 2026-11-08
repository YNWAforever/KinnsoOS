import { apiContext, boundedBody, failure, reply } from '../../../../lib/api/server';
import { serverClient } from '../../../../lib/supabase/server';
import { contentReadiness } from '../../../../lib/content-honesty/server';

export const dynamic = 'force-dynamic';

type LaunchSignoff = { gate: string; status: 'accepted' | 'waived' | 'rejected'; note: string; actorId: string; signedAt: string; expiresAt: string | null; stale: boolean };
type LaunchState = {
  content: { published: number; synthetic: number; unverified: number; verified: number; ready: boolean };
  signoffs: Record<string, LaunchSignoff>;
};

const GATES = ['rollback', 'backup', 'privacy', 'accessibility', 'devices', 'payments'] as const;
type Gate = (typeof GATES)[number];

/** Human launch gates and how they are satisfied by automation. */
type DeviceSummary = { total: number; passed: number; failed: number; complete: boolean };

function evaluate(state: LaunchState, env: Record<string, string | undefined>, devices: DeviceSummary | null = null) {
  const signoff = (gate: Gate) => state.signoffs[gate]?.status ?? null;
  const satisfied = (gate: Gate) => {
    const latest = state.signoffs[gate];
    if (!latest) return false;
    if (latest.status === 'waived') return !latest.stale;
    return latest.status === 'accepted';
  };
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
    ...GATES.map((gate) => {
      if (gate === 'devices') {
        const waiver = state.signoffs.devices;
        const waiverSatisfied = waiver && waiver.status === 'waived' && !waiver.stale;
        const rejected = waiver?.status === 'rejected';
        if (waiverSatisfied) {
          return { gate, kind: 'signoff', status: 'accepted', detail: waiver.note, signedAt: waiver.signedAt, expiresAt: waiver.expiresAt ?? null };
        }
        if (rejected) {
          return { gate, kind: 'signoff', status: 'rejected', detail: waiver.note, signedAt: waiver.signedAt, expiresAt: waiver.expiresAt ?? null };
        }
        if (waiver?.stale) {
          return { gate, kind: 'signoff', status: 'blocked', detail: 'waiver expired', signedAt: waiver.signedAt, expiresAt: waiver.expiresAt ?? null };
        }
        return {
          gate,
          kind: 'automatic',
          status: devices?.complete ? 'accepted' : 'pending',
          detail: devices
            ? `${devices.passed}/${devices.total} passing device results recorded${devices.failed ? `, ${devices.failed} failing` : ''}`
            : 'device acceptance not readable',
          signedAt: null,
          expiresAt: null,
        };
      }
      return {
        gate,
        kind: 'signoff',
        status: satisfied(gate)
        ? 'accepted'
        : state.signoffs[gate]?.stale
          ? 'blocked'
          : signoff(gate) === 'rejected'
            ? 'rejected'
            : 'pending',
        detail: state.signoffs[gate]?.stale
          ? `waiver expired ${state.signoffs[gate]?.expiresAt ? new Date(state.signoffs[gate].expiresAt).toISOString().slice(0, 10) : 'without a review date'}`
          : state.signoffs[gate]?.note ?? '',
        signedAt: state.signoffs[gate]?.signedAt ?? null,
        expiresAt: state.signoffs[gate]?.expiresAt ?? null,
      };
    }),
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
    const [readiness, response, devicesResponse] = await Promise.all([
      contentReadiness(),
      client.rpc('kinnso_ops_launch_state'),
      client.rpc('kinnso_ops_device_acceptance'),
    ]);
    if (response.error) throw new Error(response.error.message);
    const state = response.data as LaunchState;
    const devices = devicesResponse.error ? null : (devicesResponse.data as DeviceSummary);
    const evaluated = evaluate(state, process.env, devices);
    return reply({
      ok: true,
      data: {
        ...evaluated,
        content: state.content,
        devices,
        readiness: {
          published: readiness.published,
          verified: readiness.verified,
          synthetic: readiness.synthetic,
          unverified: readiness.unverified,
        },
        checkedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/invalid_|expiry_/.test(message)) return failure('INVALID', 400);
    if (/forbidden/.test(message)) return failure('FORBIDDEN', 403);
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
  const body = input as { gate?: unknown; status?: unknown; note?: unknown; expiresAt?: unknown } | null;
  if (!body || typeof body !== 'object') return failure('INVALID', 400);
  if (typeof body.gate !== 'string' || !GATES.includes(body.gate as Gate)) return failure('INVALID', 400);
  if (body.status !== 'accepted' && body.status !== 'waived' && body.status !== 'rejected') return failure('INVALID', 400);
  if (typeof body.note !== 'string' || body.note.trim().length < 20 || body.note.trim().length > 2000) return failure('INVALID', 400);
  if (body.expiresAt !== undefined && body.expiresAt !== null && (typeof body.expiresAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.expiresAt))) return failure('INVALID', 400);

  try {
    const client = await serverClient();
    if (!client) throw new Error('unavailable');
    const response = await client.rpc('kinnso_ops_sign_off', {
      p_gate: body.gate,
      p_status: body.status,
      p_note: body.note.trim(),
      p_expires_at: typeof body.expiresAt === 'string' ? body.expiresAt : null,
    });
    if (response.error) throw new Error(response.error.message);
    return reply({ ok: true, data: response.data as LaunchState }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/invalid_|expiry_/.test(message)) return failure('INVALID', 400);
    if (/forbidden/.test(message)) return failure('FORBIDDEN', 403);
    return failure('UNAVAILABLE', 503);
  }
}
