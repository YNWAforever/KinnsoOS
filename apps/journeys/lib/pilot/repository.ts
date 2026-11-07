import type { ApiResult } from '../contracts/capabilities';
import type {
  OpsPilotCommand, OpsPilotMutationResult, OpsPilotSnapshot,
  PilotParticipantCommand, PilotParticipantMutationResult, PilotSelfSnapshot,
} from '../contracts/pilot.ts';
import { parseOpsPilotCommand, parsePilotParticipantCommand } from '../contracts/pilot.ts';
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
  return async (command: Command): Promise<ApiResult<Result>> => {
    let parsed: Command;
    try {
      parsed = parse(command);
    } catch {
      return { ok: false, code: 'INVALID', retryable: false, requestId: crypto.randomUUID() };
    }
    const payload = JSON.stringify(payloadOf(parsed));
    const intent = pending.get(payload) ?? { requestId: initialId(parsed), active: 0 };
    intent.active += 1;
    pending.set(payload, intent);
    const { requestId } = intent;
    const result = await request<Result>(url, 'POST', envelopeOf(parsed, requestId));
    intent.active -= 1;
    const authorizationInterrupted = !result.ok && (result.code === 'AUTH_REQUIRED' || result.code === 'FORBIDDEN');
    if (intent.active === 0 && (result.ok || !result.retryable && !authorizationInterrupted)) pending.delete(payload);
    return result.ok ? result : { ...result, requestId };
  };
}

export const opsPilot = {
  get: (runId?: string): Promise<ApiResult<OpsPilotSnapshot>> =>
    request<OpsPilotSnapshot>('/api/ops/pilot' + (runId === undefined ? '' : '?runId=' + encodeURIComponent(runId))),
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
