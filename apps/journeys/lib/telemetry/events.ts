export const eventNames = ['guide_viewed','bookmark_saved','trip_created','trip_imported','return_visit','record_saved','guide_published','verified_outcome'] as const;
export type EventName = typeof eventNames[number];
export type TelemetryEvent = {name:EventName;mode:'connected';context:'traveller'|'creator';consent:'accepted';requestId:string;anonymousSessionId?:string;actorPseudonym?:string};
export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Reject unknown properties instead of silently transporting personal payloads. */
export function parseEvent(value:unknown):TelemetryEvent|null {
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const v=value as Record<string,unknown>;
 if(Object.keys(v).some(k=>!['name','mode','context','consent','requestId','anonymousSessionId','actorPseudonym'].includes(k))||
 !eventNames.includes(v.name as EventName)||v.mode!=='connected'||!['traveller','creator'].includes(String(v.context))||v.consent!=='accepted'||
 typeof v.requestId!=='string'||!uuid.test(v.requestId)||
 (v.anonymousSessionId!==undefined&&(typeof v.anonymousSessionId!=='string'||!uuid.test(v.anonymousSessionId)))||
 (v.actorPseudonym!==undefined&&(typeof v.actorPseudonym!=='string'||! /^[0-9a-f]{64}$/.test(v.actorPseudonym))))return null;
 return {...v} as TelemetryEvent;
}

/** Same versioned storage contract as the mature web analytics client. Expired sessions require renewal there. */
export function readConsent(storage:Pick<Storage,'getItem'>|null,now=Date.now()):{consent:'accepted';anonymousSessionId:string}|{consent:'denied'} {
 try {
  const id=storage?.getItem('kinnso.analytics.journey.v1'),version=storage?.getItem('kinnso.analytics.consent-version.v1');
  const [v,expiry]=version?.split(':')??[];
  if(storage?.getItem('kinnso.analytics.consent.v1')==='accepted'&&id&&uuid.test(id)&&v==='v1'&&expiry&&Number.isFinite(Number(expiry))&&Number(expiry)>now)return{consent:'accepted',anonymousSessionId:id};
 }catch{/* Storage denial means no tracking. */}
 return{consent:'denied'};
}
