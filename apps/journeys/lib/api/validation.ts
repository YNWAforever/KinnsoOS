import type { TripCommand } from '../contracts/trips';
// Existing PostgreSQL UUID identities need not carry RFC version or variant bits.
export const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function object(value: unknown, allowed: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) throw new Error('INVALID');
  return value as Record<string, unknown>;
}
export function sameOrigin(request: Request,approvedOrigin?:string) {
  try {
    const expected=approvedOrigin ? new URL(approvedOrigin) : new URL(request.url);
    if(approvedOrigin && (expected.pathname!=='/'||expected.search||expected.hash||expected.username||expected.password||request.headers.get('host')!==expected.host))return false;
    return request.headers.get('origin') === expected.origin && !['cross-site','none'].includes(request.headers.get('sec-fetch-site') ?? '');
  }catch{return false}
}
export function commandEnvelope(value: unknown) {
  const body = object(value, ['requestId','expectedRevision','command']);
  if (!uuid(body.requestId) || !Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 1) throw new Error('INVALID');
  const command = object(body.command, ['type','patch','id','offset','title','dayId','position','input','mediaId','stopId','code','reason']);
  if (!['patchTrip','addDay','updateDay','removeDay','addStop','updateStop','moveStop','removeStop','attachMedia','detachMedia','overrideWarning'].includes(String(command.type))) throw new Error('INVALID');
  return {requestId:body.requestId,expectedRevision:body.expectedRevision as number,command:command as TripCommand};
}
