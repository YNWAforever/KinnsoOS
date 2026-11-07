import type { ApiResult } from '../contracts/capabilities';
import type { OpsPilotCommand, OpsPilotMutationResult, OpsPilotSnapshot } from '../contracts/pilot.ts';
import { parseOpsPilotCommand } from '../contracts/pilot.ts';
import { request } from '../trips/repository';

type PendingIntent = {
  requestId: string;
  active: number;
  unresolved: boolean;
};

const pending = new Map<string, PendingIntent>();

export const opsPilot = {
  get: (runId?: string): Promise<ApiResult<OpsPilotSnapshot>> =>
    request<OpsPilotSnapshot>('/api/ops/pilot' + (runId === undefined ? '' : '?runId=' + encodeURIComponent(runId))),
  async command(command: OpsPilotCommand): Promise<ApiResult<OpsPilotMutationResult>> {
    let parsed: OpsPilotCommand;
    try {
      parsed = parseOpsPilotCommand(command);
    } catch {
      return { ok: false, code: 'INVALID', retryable: false, requestId: crypto.randomUUID() };
    }
    const payload = JSON.stringify(parsed);
    const intent = pending.get(payload) ?? {
      requestId: crypto.randomUUID(), active: 0, unresolved: false,
    };
    intent.active += 1;
    pending.set(payload, intent);
    const { requestId } = intent;
    const result = await request<OpsPilotMutationResult>('/api/ops/pilot', 'POST', { requestId, command: parsed });
    intent.active -= 1;
    if (!result.ok && result.retryable) intent.unresolved = true;
    const authorizationInterrupted = !result.ok && (result.code === 'AUTH_REQUIRED' || result.code === 'FORBIDDEN');
    if (intent.active === 0 && (result.ok || !result.retryable && !authorizationInterrupted)) pending.delete(payload);
    return result.ok ? result : { ...result, requestId };
  },
};
