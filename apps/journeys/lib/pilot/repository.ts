import type { ApiResult } from '../contracts/capabilities';
import type { OpsPilotCommand, OpsPilotMutationResult, OpsPilotSnapshot } from '../contracts/pilot.ts';
import { parseOpsPilotCommand } from '../contracts/pilot.ts';
import { request } from '../trips/repository';

const pending = new Map<string, { requestId: string; active: number; retryable: boolean }>();

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
    const intent = pending.get(payload) ?? { requestId: crypto.randomUUID(), active: 0, retryable: false };
    if (intent.active === 0) intent.retryable = false;
    intent.active += 1;
    pending.set(payload, intent);
    const { requestId } = intent;
    const result = await request<OpsPilotMutationResult>('/api/ops/pilot', 'POST', { requestId, command: parsed });
    intent.active -= 1;
    if (!result.ok && result.retryable) intent.retryable = true;
    if (intent.active === 0 && !intent.retryable) pending.delete(payload);
    return result.ok ? result : { ...result, requestId };
  },
};
