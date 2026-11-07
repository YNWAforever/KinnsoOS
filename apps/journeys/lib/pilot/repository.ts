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

export const pilot = {
  get: (): Promise<ApiResult<PilotSelfSnapshot>> => request<PilotSelfSnapshot>('/api/pilot'),
  command: commandRepository<PilotParticipantCommand, PilotParticipantMutationResult>(
    '/api/pilot', parsePilotParticipantCommand,
    ({ requestId: _requestId, ...command }) => command,
    (command, requestId) => ({ requestId, command: { ...command, requestId } }),
    command => command.requestId,
  ),
};
