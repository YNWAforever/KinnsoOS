// next/headers establishes a server-only module boundary in Next's compiler.
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {cookies,headers} from 'next/headers';
import {after} from 'next/server';
import {backendTarget,capabilities} from '../contracts/capabilities';
import {recordEvent,recordPerformance} from './repository';
import {uuid,type EventName} from './events';
type Actor={id:string;roles:string[]};
export function telemetryService(env=process.env){
 const target=backendTarget(env),key=env.KINNSO_SUPABASE_SECRET_KEY;
 if(!target||!key||capabilities(env).telemetry.mode!=='connected')return null;
 if(!key.startsWith('sb_secret_'))try{if(JSON.parse(Buffer.from(key.split('.')[1]??'','base64url').toString()).role!=='service_role')return null;}catch{return null;}
 return createClient(target.origin,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(3000)})}});
}
export async function telemetryContext(actor:Actor|null){
 const accepted=(await cookies()).get('kinnso-analytics-consent')?.value==='v1:accepted'&&(await headers()).get('x-kinnso-analytics-consent')==='accepted';
 return {mode:'connected',context:actor?.roles.includes('ops')?'admin':actor?.roles.includes('creator')?'creator':'traveller',consent:accepted?'accepted':'denied'};
}
/** Production hooks use only server identity and fixed fields. Local/demo traffic never enters field aggregates. */
export function observeRequest(actor:Actor,started:number){
 if(capabilities(process.env).telemetry.mode!=='connected'||process.env.KINNSO_ENVIRONMENT==='local'||process.env.KINNSO_SYNTHETIC_RUN==='true')return;
 try{after(async()=>{try{const service=telemetryService();if(service)await recordPerformance(service,crypto.randomUUID(),{metric:'request',value:Math.max(0,performance.now()-started)},await telemetryContext(actor));}catch{/* Optional measurement never changes the product response. */}});}catch{/* Registration also stays optional. */}
}
export async function successEvent(actor:Actor|null,name:EventName,requestId:string){
 try{
 if(capabilities(process.env).telemetry.mode!=='connected'||process.env.KINNSO_ENVIRONMENT==='local'||process.env.KINNSO_SYNTHETIC_RUN==='true')return;
 const context=await telemetryContext(actor);
 if(context.consent!=='accepted'||context.context==='admin')return;
 const session=(await headers()).get('x-kinnso-anonymous-session');if(!actor&&(!session||!uuid.test(session)))return;
 after(async()=>{try{const service=telemetryService();if(service)await recordEvent(service,actor?.id??null,{name,requestId,...context,...!actor?{anonymousSessionId:session}: {}});}catch{/* Never turn a durable success into a failed response. */}});
 }catch{/* Failure to register optional measurement does not alter a committed command. */}
}
export async function timedRpc(client:SupabaseClient,name:string,args:Record<string,unknown>,actor:Actor){
 const start=performance.now(),result=await client.rpc(name,args),elapsed=Math.max(0,performance.now()-start);
 if(capabilities(process.env).telemetry.mode==='connected'&&process.env.KINNSO_ENVIRONMENT!=='local'&&process.env.KINNSO_SYNTHETIC_RUN!=='true')try{after(async()=>{try{const service=telemetryService();if(service)await recordPerformance(service,crypto.randomUUID(),{metric:'query',value:elapsed},await telemetryContext(actor));}catch{}});}catch{}
 return result;
}
