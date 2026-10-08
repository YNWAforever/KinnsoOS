export type QueueFilter = {missionId?: string; status?: 'submitted' | 'revision_requested'};
// Match the existing database UUID contract, including historical version/variant bits.
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reusable criteria only. Results, selections and cursors never enter a filter link. */
export function readQueueFilter(params: URLSearchParams): QueueFilter | null {
  if (params.getAll('missionId').length > 1 || params.getAll('status').length > 1) return null;
  const missionId = params.get('missionId'), status = params.get('status');
  if (missionId && !uuidPattern.test(missionId)) return null;
  if (status && status !== 'submitted' && status !== 'revision_requested') return null;
  const filter: QueueFilter = {};
  if (missionId) filter.missionId = missionId;
  if (status === 'submitted' || status === 'revision_requested') filter.status = status;
  return filter;
}

export function queueFilterParams(filter: QueueFilter): URLSearchParams {
  return new URLSearchParams({...filter.missionId ? {missionId: filter.missionId} : {}, ...filter.status ? {status: filter.status} : {}});
}

export function queueFilterPath(locale: string, filter: QueueFilter): string {
  const query = queueFilterParams(filter).toString();
  return `/${locale === 'zh-HK' ? 'zh-HK' : 'en'}/ops${query ? '?' + query : ''}`;
}

export function deadlineState(deadline: string | null, now = Date.now()): 'overdue' | 'upcoming' | 'unknown' {
  const value = deadline ? Date.parse(deadline) : NaN;
  return Number.isFinite(value) ? value < now ? 'overdue' : 'upcoming' : 'unknown';
}
