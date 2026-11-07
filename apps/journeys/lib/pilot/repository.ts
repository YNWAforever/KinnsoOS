import type { ApiResult } from '../contracts/capabilities';
import type {
  OpsPilotCommand, OpsPilotMutationResult, OpsPilotSnapshot,
  PilotParticipantCommand, PilotParticipantMutationResult, PilotSelfSnapshot,
} from '../contracts/pilot.ts';
import { parseOpsPilotCommand, parsePilotParticipantCommand } from '../contracts/pilot.ts';
import { subscribeAccountInvalidation } from '../trips/local-drafts';
import { request } from '../trips/repository';

type PendingIntent = { requestId: string; active: number };

function commandRepository<Command, Result>(
  url: string,
  parse: (value: unknown) => Command,
  payloadOf: (command: Command) => Omit<Command, 'requestId'>,
  envelopeOf: (command: Command, requestId: string) => { requestId: string; command: Command },
  initialId: (command: Command) => string = () => crypto.randomUUID(),
) {
  const pending = new Map<string, PendingIntent>();
  return async (command: Command, actorId?: string): Promise<ApiResult<Result>> => {
    let parsed: Command;
    try {
      parsed = parse(command);
    } catch {
      return { ok: false, code: 'INVALID', retryable: false, requestId: crypto.randomUUID() };
    }
    const payload = JSON.stringify([actorId ?? null, payloadOf(parsed)]);
    const intent = pending.get(payload) ?? { requestId: initialId(parsed), active: 0 };
    intent.active += 1;
    pending.set(payload, intent);
    const { requestId } = intent;
    const result = await request<Result>(url, 'POST', envelopeOf(parsed, requestId), undefined, actorId);
    intent.active -= 1;
    const authorizationInterrupted = !result.ok && (result.code === 'AUTH_REQUIRED' || result.code === 'FORBIDDEN');
    if (intent.active === 0 && (result.ok || !result.retryable && !authorizationInterrupted)) pending.delete(payload);
    return result.ok ? result : { ...result, requestId };
  };
}

type RecoverableIntent = {
  actorId: string;
  requestId: string;
  command: OpsPilotCommand;
  attempt?: Promise<ApiResult<OpsPilotMutationResult>>;
};

// Memory only: no storage of reasons, codes, responses or account data on disk.
let unresolved: RecoverableIntent | null = null;
let unsubscribe: (() => void) | undefined;
function clearRecovery() {
  unresolved = null;
  unsubscribe?.();
  unsubscribe = undefined;
}
function selectActor(actorId: string | null) {
  if (unresolved && unresolved.actorId !== actorId) clearRecovery();
}
function recoverableCommand(actorId: string, command?: OpsPilotCommand): Promise<ApiResult<OpsPilotMutationResult>> {
  selectActor(actorId);
  if (!unresolved && command) {
    unresolved = { actorId, requestId: crypto.randomUUID(), command: Object.freeze(parseOpsPilotCommand(command)) };
    if (typeof window !== 'undefined') unsubscribe = subscribeAccountInvalidation(selectActor);
  }
  const intent = unresolved;
  if (!intent || command && JSON.stringify(intent.command) !== JSON.stringify(command))
    return Promise.resolve({ok:false, code:'CONFLICT', retryable:false, requestId: intent?.requestId ?? crypto.randomUUID()});
  if (intent.attempt) return intent.attempt;
  intent.attempt = request<OpsPilotMutationResult>('/api/ops/pilot', 'POST', {
    requestId: intent.requestId, command: intent.command,
  }, undefined, actorId).then(result => {
    delete intent.attempt;
    if (unresolved === intent && (result.ok || !result.retryable && result.code !== 'AUTH_REQUIRED' && result.code !== 'FORBIDDEN'))
      clearRecovery();
    return result;
  });
  return intent.attempt;
}

export const opsPilot = {
  selectActor,
  pending: (actorId: string | null) => actorId && unresolved?.actorId === actorId ? unresolved.command : null,
  recoverableCommand,
  get: (runId?: string, actorId?: string): Promise<ApiResult<OpsPilotSnapshot>> =>
    request<OpsPilotSnapshot>('/api/ops/pilot' + (runId === undefined ? '' : '?runId=' + encodeURIComponent(runId)), 'GET', undefined, undefined, actorId),
  command: commandRepository<OpsPilotCommand, OpsPilotMutationResult>(
    '/api/ops/pilot', parseOpsPilotCommand, command => command, (command, requestId) => ({ requestId, command }),
  ),
};

type ParticipantIntent = {
  actorId: string;
  command: PilotParticipantCommand | null;
  controller: AbortController;
  outcomeUnknown: boolean;
  attempt?: Promise<ApiResult<PilotParticipantMutationResult>>;
};

let participantIntent: ParticipantIntent | null = null;
const participantReads = new Map<AbortController, string>();
let unsubscribeParticipant: (() => void) | undefined;

function invalidateParticipant() {
  clearParticipantIntent();
  for (const controller of participantReads.keys()) controller.abort();
  participantReads.clear();
  releaseParticipantListener();
}

function clearParticipantIntent() {
  const intent = participantIntent;
  participantIntent = null;
  if (intent) {
    intent.command = null;
    intent.controller.abort();
  }
  releaseParticipantListener();
}

function releaseParticipantListener() {
  if (participantIntent || participantReads.size) return;
  unsubscribeParticipant?.();
  unsubscribeParticipant = undefined;
}

function selectParticipant(actorId: string | null) {
  if (participantIntent && participantIntent.actorId !== actorId ||
      [...participantReads.values()].some(owner => owner !== actorId)) invalidateParticipant();
}

function participantCommand(actorId: string, command?: PilotParticipantCommand): Promise<ApiResult<PilotParticipantMutationResult>> {
  selectParticipant(actorId);
  const fail = (code: 'AUTH_REQUIRED' | 'INVALID' | 'CONFLICT', requestId: string = crypto.randomUUID()) =>
    Promise.resolve({ok:false as const, code, retryable:false, requestId});
  if (!actorId) return fail('AUTH_REQUIRED');
  let parsed: PilotParticipantCommand | undefined;
  try {
    if (command) parsed = parsePilotParticipantCommand(command);
  } catch {
    return fail('INVALID');
  }
  if (!participantIntent && parsed) {
    participantIntent = {actorId, command: parsed, controller: new AbortController(), outcomeUnknown: false};
    listenForParticipantInvalidation();
  }
  const intent = participantIntent;
  if (!intent?.command) return fail('CONFLICT');
  const {requestId} = intent.command;
  if (parsed && JSON.stringify({...parsed, requestId}) !== JSON.stringify(intent.command))
    return fail('CONFLICT', requestId);
  if (intent.attempt) return intent.attempt;
  intent.attempt = request<PilotParticipantMutationResult>('/api/pilot', 'POST', {
    requestId, command: intent.command,
  }, intent.controller.signal, actorId).then(result => {
    delete intent.attempt;
    if (participantIntent !== intent) return fail('AUTH_REQUIRED', requestId);
    // A session failure on this attempt cannot resolve an earlier unknown write.
    const authInterrupted = !result.ok && (result.code === 'AUTH_REQUIRED' || result.code === 'FORBIDDEN');
    if (result.ok || !result.retryable && !(intent.outcomeUnknown && authInterrupted)) clearParticipantIntent();
    else if (result.retryable) intent.outcomeUnknown = true;
    return result.ok ? result : {...result, requestId};
  });
  return intent.attempt;
}

function listenForParticipantInvalidation() {
  if (typeof window !== 'undefined') unsubscribeParticipant ??= subscribeAccountInvalidation(selectParticipant);
}

async function getParticipant(actorId: string, signal?: AbortSignal): Promise<ApiResult<PilotSelfSnapshot>> {
  selectParticipant(actorId);
  const authRequired = () => ({ok:false as const, code:'AUTH_REQUIRED' as const, retryable:false, requestId:crypto.randomUUID()});
  if (!actorId) return authRequired();
  const controller = new AbortController();
  participantReads.set(controller, actorId);
  listenForParticipantInvalidation();
  try {
    const result = await request<PilotSelfSnapshot>('/api/pilot', 'GET', undefined,
      signal ? AbortSignal.any([signal, controller.signal]) : controller.signal, actorId);
    return controller.signal.aborted ? authRequired() : result;
  } finally {
    participantReads.delete(controller);
    releaseParticipantListener();
  }
}

export const pilot = {
  invalidate: invalidateParticipant,
  selectActor: selectParticipant,
  subscribeInvalidation: subscribeAccountInvalidation,
  get: getParticipant,
  command: (command: PilotParticipantCommand, actorId: string) => participantCommand(actorId, command),
  retry: (actorId: string) => participantCommand(actorId),
};
