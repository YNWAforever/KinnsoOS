import {pilotProxyIdentity} from '../../../../lib/telemetry/pilot-proxy';
import {sameOrigin} from '../../../../lib/api/validation';
import {boundedBody,failure,reply} from '../../../../lib/api/server';
import {parsePublicPilotEvent} from '../../../../lib/telemetry/pilot';
import {pilotEvent} from '../../../../lib/telemetry/pilot-server';
import {capabilities} from '../../../../lib/contracts/capabilities';
import {telemetryContext} from '../../../../lib/telemetry/server';
import {serverClient} from '../../../../lib/supabase/server';
export async function POST(request:Request){
 if(!sameOrigin(request,process.env.KINNSO_SITE_URL))return failure('FORBIDDEN',403);
 try{
  const event=parsePublicPilotEvent(await boundedBody(request,2048));
  if(!event)return failure('INVALID',400);
  if(process.env.KINNSO_ENVIRONMENT==='local'||process.env.KINNSO_SYNTHETIC_RUN==='true'||capabilities(process.env).telemetry.mode!=='connected')return reply({ok:true,data:{queued:false}},202);
  if((await telemetryContext(null)).consent!=='accepted')return reply({ok:true,data:{queued:false}},202);
  const identity=pilotProxyIdentity(request,JSON.stringify(event));
  if(identity.kind==='invalid')return failure('FORBIDDEN',403);
  const client=await serverClient();if(!client)return failure('UNAVAILABLE',503);
  const ip=identity.kind==='verified'?identity.ip:(request.headers.get('x-vercel-forwarded-for')??request.headers.get('x-forwarded-for')??'unknown').split(',')[0].trim();
  const throttle=await client.rpc('check_and_increment_traveller_analytics_ip_rate_limit',{p_ip:ip,p_max_requests:600,p_window_seconds:600});
  if(throttle.error||!throttle.data)return reply({ok:true,data:{queued:false}},429);
  const result=await pilotEvent(null,event);
  return reply({ok:true,data:result},202);
 }catch{return failure('INVALID',400)}
}
