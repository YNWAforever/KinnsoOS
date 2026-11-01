const STATES=['complete','unknown','restricted','conflict','unavailable','source_changed','disabled'] as const;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
/** An explicit projection, never spread caller diagnostics or log bodies/errors/tokens. */
export function discoveryEvent(input:Record<string,unknown>){
 const result:Record<string,string|number>={status:STATES.includes(input.status as typeof STATES[number])?String(input.status):'unavailable',durationMs:typeof input.durationMs==='number'&&Number.isFinite(input.durationMs)?Math.max(0,Math.round(input.durationMs)):0};
 for(const key of ['requestId','runId','resourceId'])if(typeof input[key]==='string'&&UUID.test(input[key]))result[key]=input[key];
 return result;
}
/** No environment override: rollout needs code review and new native evidence. */
export function nativeReadiness(){return {enabled:false,booking:false,payment:false,blockers:['DB_AUTH_RLS_NOT_RUN','MCP_PROTOCOL_AND_ISSUER_NOT_SELECTED','RIGHTS_NOT_VERIFIED','PUBLIC_READERS_AND_ATOMIC_BINDINGS_DB_NOT_VERIFIED']} as const;}
