import { apiContext, boundedBody, failure, reply } from '../../../lib/api/server';
import { object, uuid } from '../../../lib/api/validation.ts';
import { parsePilotParticipantCommand } from '../../../lib/contracts/pilot.ts';
import type { PilotMetricAction, PilotParticipantCommand, PilotSelfSnapshot, PilotSelfIntake } from '../../../lib/contracts/pilot.ts';
import { emitPilotMetric } from '../../../lib/pilot/telemetry.ts';

function digest(value: unknown): string | null {
  return typeof value === 'string' && value.length === 64 && /^[0-9a-f]{64}$/.test(value) ? value : null;
}

function canonicalLink(value: unknown, prefix: string, suffix = ''): string | null {
  return typeof value === 'string' && value.startsWith(prefix) && value.endsWith(suffix)
    && uuid(value.slice(prefix.length, suffix.length ? -suffix.length : undefined)) ? value : null;
}

function intakeView(i: PilotSelfIntake | null | undefined): PilotSelfIntake | null {
  if (!i || !uuid(i.id) || !Number.isSafeInteger(i.revision) || i.revision < 1
    || !['draft','submitted','approved','rejected','published','withdrawn'].includes(i.status)
    || !['original','licence','permission'].includes(i.rightsBasis)
    || ![i.title,i.destination,i.authoredLocale,i.sourceSummary,i.rightsEvidenceReference].every(v => typeof v === 'string')
    || !Array.isArray(i.sourceUrls) || i.sourceUrls.length > 20 || !i.sourceUrls.every(v => typeof v === 'string')) return null;
  const guideId = uuid(i.guideId) ? i.guideId : null;
  return {
    id:i.id, status:i.status, revision:i.revision, title:i.title, destination:i.destination,
    authoredLocale:i.authoredLocale, sourceSummary:i.sourceSummary, sourceUrls:i.sourceUrls,
    rightsBasis:i.rightsBasis, rightsEvidenceReference:i.rightsEvidenceReference,
    coverRightsConfirmed:typeof i.coverRightsConfirmed === 'boolean' ? i.coverRightsConfirmed : null,
    coverRightsEvidenceReference:typeof i.coverRightsEvidenceReference === 'string' ? i.coverRightsEvidenceReference : null,
    reviewReason:typeof i.reviewReason === 'string' ? i.reviewReason : null, guideId,
    currentDraftRevision:guideId && Number.isSafeInteger(i.currentDraftRevision) && i.currentDraftRevision! > 0 ? i.currentDraftRevision : null,
    editorHref:guideId && i.editorHref === '/en/studio/guides/' + guideId + '/edit' ? i.editorHref : null,
  };
}

function selfView({ run, participant, nextStep, readiness, contentConsent, intake, workflowLinks }: PilotSelfSnapshot): PilotSelfSnapshot {
  const active = participant?.status === 'active';
  const creator = active && participant.role === 'creator';
  const contentDigest = creator && digest(contentConsent?.digest);

  return {
    run: run && { id: run.id, name: run.name, status: run.status,
      participationNoticeVersion: typeof run.participationNoticeVersion === 'string' ? run.participationNoticeVersion : undefined,
      participationNoticeDigest: run.participationNoticeDigest === undefined ? undefined : digest(run.participationNoticeDigest),
      privacyNoticeVersion: typeof run.privacyNoticeVersion === 'string' ? run.privacyNoticeVersion : undefined,
      privacyNoticeDigest: run.privacyNoticeDigest === undefined ? undefined : digest(run.privacyNoticeDigest),
    },
    participant: participant && {
      id: participant.id, role: participant.role, status: participant.status, consentVersion: participant.consentVersion,
      consentDigest: participant.consentDigest === undefined ? undefined : digest(participant.consentDigest),
    },
    contentConsent: contentConsent === undefined ? undefined :
      contentDigest && typeof contentConsent?.version === 'string' ? {version:contentConsent.version,digest:contentDigest} : null,
    intake: intake === undefined ? undefined : creator ? intakeView(intake) : null,
    workflowLinks: workflowLinks === undefined ? undefined : active && workflowLinks ? {
      merchant: participant.role === 'merchant' ? canonicalLink(workflowLinks.merchant, '/en/merchant/campaigns/') : null,
      trip: participant.role === 'traveller' ? canonicalLink(workflowLinks.trip, '/en/trips/') : null,
      supportCaseId: uuid(workflowLinks.supportCaseId) ? workflowLinks.supportCaseId : null,
    } : null,
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
  let command: PilotParticipantCommand | null = null;
  let requestId: string;
  try {
    if (new URL(request.url).search) return failure('INVALID', 400);
    const body = object(await boundedBody(request), ['requestId', 'command']);
    if (!uuid(body.requestId)) return failure('INVALID', 400);
    requestId = body.requestId;
    const candidate = body.command as Partial<PilotParticipantCommand> | null;
    if (candidate?.type === 'acceptConsent' && candidate.requestId === requestId &&
      (candidate.noticeDigest == null || candidate.privacyNoticeDigest == null)) {
      object(candidate, ['type','requestId','noticeVersion','noticeDigest','privacyNoticeVersion','privacyNoticeDigest']);
    } else {
      command = parsePilotParticipantCommand(candidate);
      if (requestId !== command.requestId) return failure('INVALID', 400);
    }
  } catch {
    return failure('INVALID', 400);
  }

  try {
    const ctx = await apiContext(request, 'pilot', true);
    if (ctx.response) return withRequestId(ctx.response, requestId);
    if (!command) return withRequestId(failure('CONFLICT', 409), requestId);
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
