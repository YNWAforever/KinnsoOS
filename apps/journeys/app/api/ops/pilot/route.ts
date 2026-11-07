import { apiContext, backendFailure, boundedBody, failure, reply } from '../../../../lib/api/server';
import { object, uuid } from '../../../../lib/api/validation.ts';
import { parseOpsPilotCommand } from '../../../../lib/contracts/pilot.ts';
import type {
  OpsPilotCommand, OpsPilotMutationResult, OpsPilotSnapshot, PilotMetricAction, PilotMetricIdentifiers,
} from '../../../../lib/contracts/pilot.ts';
import { pilotBeginReadiness, pilotExecutionReadiness } from '../../../../lib/pilot/readiness.ts';
import type { PilotBeginReadinessInput, PilotExecutionFacts } from '../../../../lib/pilot/readiness.ts';
import { emitPilotMetric } from '../../../../lib/pilot/telemetry.ts';

type RpcSnapshot = OpsPilotSnapshot & {
  facts: PilotExecutionFacts;
  beginFacts?: Omit<PilotBeginReadinessInput, 'run' | 'capabilityConnected'> & { rpcAvailable: boolean };
};

function project<Value extends object, Key extends keyof Value>(value: Value, keys: Key[]): Pick<Value, Key> {
  return Object.fromEntries(keys.map(key => [key, value[key]])) as Pick<Value, Key>;
}

function safeActiveInvite(invite: OpsPilotSnapshot['participants'][number]['activeInvite']) {
  return invite?.status === 'active' && uuid(invite.id) && typeof invite.expiresAt === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(invite.expiresAt) && Number.isFinite(Date.parse(invite.expiresAt))
    ? project(invite, ['id', 'status', 'expiresAt']) : null;
}

function publicSnapshot(input: RpcSnapshot): OpsPilotSnapshot {
  const { run, participants, contentIntakes, collaboration, checks, facts, beginFacts } = input;
  const readiness = run && (run.status === 'draft' || run.status === 'recruiting')
    ? pilotBeginReadiness({
      run, capabilityConnected: beginFacts?.rpcAvailable === true,
      ownersConfigured: beginFacts?.ownersConfigured === true,
      noticesPinned: beginFacts?.noticesPinned === true,
      syntheticRehearsalPassed: beginFacts?.syntheticRehearsalPassed === true,
    })
    : pilotExecutionReadiness({ run, participants, contentIntakes, collaboration, checks, facts });
  function reviewTarget(intake: OpsPilotSnapshot['contentIntakes'][number]) {
    const match = facts?.publications?.find(row => !!run && row.runId === run.id && row.intakeId === intake.id && row.entityId === intake.guideId);
    const revision = match?.currentDraftRevision;
    const digest = match?.currentContentDigest;
    return typeof revision === 'number' && Number.isSafeInteger(revision) && revision > 0 && revision <= 999999999 &&
      typeof digest === 'string' && /^[a-f0-9]{64}$/.test(digest)
      ? { currentDraftRevision: revision, currentContentDigest: digest }
      : { currentDraftRevision: null, currentContentDigest: null };
  }
  function manualCheckIdentity(check: OpsPilotSnapshot['checks'][number]) {
    const id = !check.derived && facts?.checks?.find(row => row.runId === run?.id && row.code === check.code)?.entityId;
    return uuid(id) ? { id } : {};
  }
  return {
    run: run ? project(run, [
      'id', 'name', 'status', 'revision', 'dataClassification', 'candidateReleaseSha', 'environmentOrigin',
      'acceptanceStartedAt', 'minimumPublishedGuides', 'participationNoticeVersion',
      'privacyNoticeVersion', 'contentConsentVersion',
    ]) : null,
    participants: participants.map(participant => ({ ...project(participant, [
      'id', 'role', 'cohortRole', 'displayLabel', 'status', 'userLinked', 'consentAccepted', 'revision',
    ]), activeInvite: safeActiveInvite(participant.activeInvite) })),
    contentIntakes: contentIntakes.map(intake => ({ ...project(intake, [
      'id', 'creatorParticipantId', 'guideId', 'status', 'guideDraftRevision', 'reviewedGuideVersion',
      'contentDigest', 'title', 'destination', 'authoredLocale', 'revision',
    ]), ...reviewTarget(intake) })),
    collaboration: collaboration ? {
      ...project(collaboration, ['id', 'merchantParticipantId', 'creatorParticipantId', 'missionId']),
      steps: collaboration.steps.map(step => project(step, ['code', 'status'])),
    } : null,
    checks: checks.map(check => ({ ...project(check, [
      'code', 'category', 'status', 'evidenceReference', 'observedSummary', 'revision', 'derived',
    ]), ...manualCheckIdentity(check) })),
    readiness,
  };
}

async function withRequestId(response: Response, requestId: string): Promise<Response> {
  return reply({ ...await response.json(), requestId }, response.status);
}

function rpcFailure(error: { message?: string; code?: string } | null): Response {
  switch (error?.message) {
    case 'CONFLICT':
    case 'REQUEST_ID_REUSED': return failure('CONFLICT', 409);
    case 'NOT_FOUND': return failure('NOT_FOUND', 404);
    case 'INVALID': return failure('INVALID', 400);
    case 'AUTH_REQUIRED': return failure('AUTH_REQUIRED', 401);
    case 'FORBIDDEN': return failure('FORBIDDEN', 403);
    default: return backendFailure(error);
  }
}

const metricActions: Record<OpsPilotCommand['type'], PilotMetricAction> = {
  createRun: 'pilot.run.created',
  configureRun: 'pilot.run.configured',
  setRunStatus: 'pilot.run.status_changed',
  addParticipant: 'pilot.participant.status_changed',
  setParticipantStatus: 'pilot.participant.status_changed',
  createInvite: 'pilot.invite.created',
  revokeInvite: 'pilot.participant.status_changed',
  reviewContentIntake: 'pilot.content.reviewed',
  bindGuide: 'pilot.guide.bound',
  bindCollaboration: 'pilot.collaboration.bound',
  addEvidenceReference: 'pilot.evidence.added',
  setManualCheck: 'pilot.check.changed',
};

async function commandMetric(command: OpsPilotCommand, snapshot: OpsPilotSnapshot): Promise<void> {
  if (!snapshot.run) return;
  const ids: PilotMetricIdentifiers = { runId: snapshot.run.id };
  switch (command.type) {
    case 'setRunStatus': ids.status = snapshot.run.status; break;
    case 'addParticipant': ids.participantId = command.id; ids.status = 'invited'; break;
    case 'setParticipantStatus': ids.participantId = command.id; ids.status = command.status; break;
    case 'createInvite':
    case 'revokeInvite': ids.participantId = command.participantId; break;
    case 'reviewContentIntake':
      ids.contentIntakeId = command.id;
      ids.status = command.decision === 'approve' ? 'approved' : 'rejected';
      break;
    case 'bindGuide': ids.contentIntakeId = command.intakeId; break;
    case 'addEvidenceReference':
      ids.checkCode = command.checkCode;
      if (command.participantId) ids.participantId = command.participantId;
      break;
    case 'setManualCheck': ids.status = command.status; break;
  }
  try {
    await emitPilotMetric(metricActions[command.type], ids);
  } catch {}
}

export async function GET(request: Request): Promise<Response> {
  try {
    const params = new URL(request.url).searchParams;
    const runId = params.get('runId');
    if ([...params.keys()].some(key => key !== 'runId') || params.getAll('runId').length > 1 ||
      (runId !== null && !uuid(runId))) return failure('INVALID', 400);
    const ctx = await apiContext(request, 'pilot', false);
    if (ctx.response) return ctx.response;
    const result = await ctx.client.rpc('get_kinnso_ops_pilot', { p_run_id: runId });
    if (result.error) return rpcFailure(result.error);
    return reply({ ok: true, data: publicSnapshot(result.data as RpcSnapshot) });
  } catch {
    return failure('UNAVAILABLE', 503);
  }
}

export async function POST(request: Request): Promise<Response> {
  let requestId: string;
  let command: OpsPilotCommand;
  try {
    if (new URL(request.url).search) throw new Error('INVALID');
    const body = object(await boundedBody(request), ['requestId', 'command']);
    if (!uuid(body.requestId)) throw new Error('INVALID');
    requestId = body.requestId;
    command = parseOpsPilotCommand(body.command);
  } catch {
    return failure('INVALID', 400);
  }
  try {
    const ctx = await apiContext(request, 'pilot', true);
    if (ctx.response) return withRequestId(ctx.response, requestId);
    const result = await ctx.client.rpc('admin_apply_kinnso_pilot_command', {
      p_request_id: requestId, p_command: command,
    });
    if (result.error) return withRequestId(rpcFailure(result.error), requestId);
    const data: OpsPilotMutationResult = { snapshot: publicSnapshot(result.data.snapshot as RpcSnapshot) };
    if (!data.snapshot.run) throw new Error('UNAVAILABLE');
    if (typeof result.data.inviteCode === 'string') data.inviteCode = result.data.inviteCode;
    if (result.data._pilotReplay === false) await commandMetric(command, data.snapshot);
    return reply({ ok: true, data });
  } catch {
    return withRequestId(failure('UNAVAILABLE', 503), requestId);
  }
}
