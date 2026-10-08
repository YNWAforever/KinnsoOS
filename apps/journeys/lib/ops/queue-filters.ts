export type QueueFilter = {missionId?: string; status?: 'submitted' | 'revision_requested'; assignment?: 'mine' | 'unassigned'; order?: 'deadline'};
// Match the existing database UUID contract, including historical version/variant bits.
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reusable criteria only. Results, selections and cursors never enter a filter link. */
export function readQueueFilter(params: URLSearchParams): QueueFilter | null {
  if (['missionId','status','assignment','order'].some(key=>params.getAll(key).length>1)) return null;
  const missionId = params.get('missionId'), status = params.get('status'), assignment=params.get('assignment'), order=params.get('order');
  if (missionId && !uuidPattern.test(missionId)) return null;
  if (status && status !== 'submitted' && status !== 'revision_requested') return null;
  if (assignment && assignment!=='mine' && assignment!=='unassigned') return null;
  if (order && order!=='deadline' && order!=='signal') return null;
  const filter: QueueFilter = {};
  if (missionId) filter.missionId = missionId;
  if (status === 'submitted' || status === 'revision_requested') filter.status = status;
  if (assignment==='mine'||assignment==='unassigned')filter.assignment=assignment;
  if(order==='deadline')filter.order=order;
  return filter;
}

export function queueFilterParams(filter: QueueFilter): URLSearchParams {
  return new URLSearchParams({...filter.missionId ? {missionId: filter.missionId} : {}, ...filter.status ? {status: filter.status} : {},...filter.assignment?{assignment:filter.assignment}:{},...filter.order?{order:filter.order}:{}});
}

export function presetFilter(value: unknown): QueueFilter {
  if(!value || typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['missionId','status','assignment','order'].includes(key))||Object.values(value).some(v=>typeof v!=='string'||!v))throw Error('INVALID');
  const filter=readQueueFilter(new URLSearchParams(value as Record<string,string>));if(!filter)throw Error('INVALID');return filter;
}

export function queueFilterPath(locale: string, filter: QueueFilter): string {
  const query = queueFilterParams(filter).toString();
  return `/${locale === 'zh-HK' ? 'zh-HK' : 'en'}/ops${query ? '?' + query : ''}`;
}

export function deadlineState(deadline: string | null, now = Date.now()): 'overdue' | 'upcoming' | 'unknown' {
  const value = deadline ? Date.parse(deadline) : NaN;
  return Number.isFinite(value) ? value < now ? 'overdue' : 'upcoming' : 'unknown';
}
