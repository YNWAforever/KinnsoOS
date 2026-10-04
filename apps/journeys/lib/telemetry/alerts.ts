export type ScheduledRun={job:'media_cleanup'|'telemetry_retention'|'notifications';owner:string;runbook:string;lastSuccessAt:string|null;lastAttemptAt:string|null;lastStatus:'succeeded'|'failed'|null};
export function scheduledHealth(run:ScheduledRun,now=Date.now(),maxAgeMs=86400000) {
 const success=run.lastSuccessAt===null?null:Date.parse(run.lastSuccessAt);
 const state=run.lastStatus==='failed'?'failed':success===null||!Number.isFinite(success)?'unknown':now-success>maxAgeMs?'stale':'healthy';
 return{...run,state,alert:state==='failed'||state==='stale'};
}
