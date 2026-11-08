import {isAuthSessionMissingError} from '@supabase/supabase-js';
import {sameOrigin} from '../../../lib/api/validation';
import {parseLegacyAnalyticsRequest,LegacyAnalyticsError} from '../../../lib/analytics/legacy-events';
import {serverClient} from '../../../lib/supabase/server';
import {telemetryService} from '../../../lib/telemetry/server';

function unavailable(){return Response.json({accepted:false,error:'unavailable'},{status:503});}
function clientIp(request:Request){
 const value=request.headers.get('x-vercel-forwarded-for')??request.headers.get('x-forwarded-for')??request.headers.get('x-real-ip')??'unknown';
 return value.split(',')[0].trim().slice(0,128)||'unknown';
}

export async function POST(request:Request){
 if(!sameOrigin(request,process.env.KINNSO_SITE_URL))return Response.json({accepted:false,error:'forbidden'},{status:403});
 let payload;
 try{payload=await parseLegacyAnalyticsRequest(request);}catch(error){
  if(error instanceof LegacyAnalyticsError)return Response.json({accepted:false,error:error.code},{status:error.status});
  return unavailable();
 }
 if(process.env.ANALYTICS_INGEST_MODE!=='production')return Response.json({accepted:true},{status:202});
 try{
  const client=await serverClient();if(!client)return unavailable();
  const ipThrottle=await client.rpc('check_and_increment_traveller_analytics_ip_rate_limit',{p_ip:clientIp(request),p_max_requests:600,p_window_seconds:600});
  if(ipThrottle.error)return unavailable();
  if(!ipThrottle.data)return Response.json({accepted:false,error:'rate_limited'},{status:429});
  const journeyThrottle=await client.rpc('check_and_increment_traveller_analytics_rate_limit',{p_journey_id:payload.journeyId,p_max_requests:120,p_window_seconds:600});
  if(journeyThrottle.error)return unavailable();
  if(!journeyThrottle.data)return Response.json({accepted:false,error:'rate_limited'},{status:429});
  const {data:{user},error:authError}=await client.auth.getUser();
  if(authError&&!isAuthSessionMissingError(authError))return unavailable();
  const service=telemetryService();if(!service)return unavailable();
  const result=await service.from('traveller_analytics_events').upsert({
   client_event_id:payload.clientEventId,journey_id:payload.journeyId,consent_version:payload.consentVersion,event_name:payload.event,occurred_at:payload.occurredAt,locale:payload.locale,route_key:payload.routeKey,entity_type:payload.entityType??null,entity_id:payload.entityId??null,booking_state:payload.bookingState??'off',authenticated:user!==null,outcome:payload.outcome??null,error_category:payload.errorCategory??null,account_id:user?.id??null,
  },{onConflict:'journey_id,client_event_id',ignoreDuplicates:true}).select('id');
  return result.error?unavailable():Response.json({accepted:true},{status:202});
 }catch{return unavailable();}
}
