import { apiContext, boundedBody, failure, reply } from '../../../lib/api/server';
import { object, uuid } from '../../../lib/api/validation.ts';
import { parsePilotParticipantCommand } from '../../../lib/contracts/pilot.ts';
import type { PilotMetricAction, PilotParticipantCommand, PilotSelfSnapshot } from '../../../lib/contracts/pilot.ts';
import { emitPilotMetric } from '../../../lib/pilot/telemetry.ts';

function selfView({ run, participant, nextStep, readiness }: PilotSelfSnapshot): PilotSelfSnapshot {
  return {
    run: run && { id: run.id, name: run.name, status: run.status },
    participant: participant && {
      id: participant.id, role: participant.role, status: participant.status, consentVersion: participant.consentVersion,
    },
    nextStep: nextStep && { code: nextStep.code, href: nextStep.href, messageKey: nextStep.messageKey },
    readiness: {
      stage: readiness.stage, readyToBegin: readiness.readyToBegin, executionComplete: readiness.executionComplete,
      blockers: readiness.blockers.map(({ code, category, messageKey }) => ({ code, category, messageKey })),
    },
  };
}

function rpcFailure(message: string | undefined, claim = false): Response {
  switch (message) {
    case 'CONFLICT': return claim ? failure('NOT_FOUND', 404) : failure('CONFLICT', 409);
    case 'REQUEST_ID_REUSED': return failure('CONFLICT', 409);
    case 'NOT_FOUND': return failure('NOT_FOUND', 404);
    case 'INVALID': return failure('INVALID', 400);
    case 'unauthenticated':
    case 'AUTH_REQUIRED': return failure('AUTH_REQUIRED', 401);
    case 'FORBIDDEN': return failure('FORBIDDEN', 403);
    default: return failure('UNAVAILABLE', 503);
  }
}

async function withRequestId(response: Response, requestId: string): Promise<Response> {
  return reply({ ...await response.json(), requestId }, response.status);
}

const metrics: Record<PilotParticipantCommand['type'], PilotMetricAction> = {
  claimInvite: 'pilot.participant.joined',
  acceptConsent: 'pilot.consent.accepted',
  submitContentIntake: 'pilot.content.submitted',
  updateOwnedContentIntake: 'pilot.content.submitted',
  acknowledgeNotification: 'pilot.notification.acknowledged',
  acknowledgeSupportResponse: 'pilot.support.acknowledged',
};

export async function GET(request: Request): Promise<Response> {
  try {
    if (new URL(request.url).search) return failure('INVALID', 400);
    const ctx = await apiContext(request, 'pilot');
    if (ctx.response) return ctx.response;
    const result = await ctx.client.rpc('get_kinnso_pilot_self');
    if (result.error) return rpcFailure(result.error.message);
    return reply({ ok: true, data: selfView(result.data) });
  } catch {
    return failure('UNAVAILABLE', 503);
  }
}

export async function POST(request: Request): Promise<Response> {
  let command: PilotParticipantCommand;
  try {
    if (new URL(request.url).search) return failure('INVALID', 400);
    const body = object(await boundedBody(request), ['requestId', 'command']);
    command = parsePilotParticipantCommand(body.command);
    if (!uuid(body.requestId) || body.requestId !== command.requestId) return failure('INVALID', 400);
  } catch {
    return failure('INVALID', 400);
  }

  const { requestId } = command;
  try {
    const ctx = await apiContext(request, 'pilot', true);
    if (ctx.response) return withRequestId(ctx.response, requestId);
    const result = await ctx.client.rpc('apply_kinnso_pilot_participant_command', {
      p_request_id: requestId, p_command: command,
    });
    if (result.error) return withRequestId(rpcFailure(result.error.message, command.type === 'claimInvite'), requestId);
    const snapshot = selfView(result.data.snapshot);
    const runId = snapshot.run?.id;
    const participantId = snapshot.participant?.id;
    if (!uuid(runId) || !uuid(participantId))
      return withRequestId(failure('UNAVAILABLE', 503), requestId);

    if (result.data._pilotReplay === false) await emitPilotMetric(metrics[command.type], {
      runId, participantId,
      ...(command.type === 'updateOwnedContentIntake' ? { contentIntakeId: command.id } : {}),
    });
    return reply({ ok: true, data: { snapshot } });
  } catch {
    return withRequestId(failure('UNAVAILABLE', 503), requestId);
  }
}
