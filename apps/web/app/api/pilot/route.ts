import {getClientIp} from '@/lib/http/client-ip'
import {pilotProxyConfigured,pilotProxyHeaders} from '../../../../journeys/lib/telemetry/pilot-proxy'
import {guideAdoptionHref} from '@/lib/guides/adoption'
import {parsePublicPilotEvent} from '../../../../journeys/lib/telemetry/pilot'
import {sameOrigin} from '../../../../journeys/lib/api/validation'
import {boundedBody as readBody} from '../../../../journeys/lib/api/server'
import {uuid} from '../../../../journeys/lib/telemetry/events'
export async function POST(request:Request){
 const reply=(data:unknown,status=202)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}})
 if(!sameOrigin(request,process.env.NEXT_PUBLIC_SITE_URL))return reply({queued:false},403)
 try{
  const event=parsePublicPilotEvent(await readBody(request,2048))
  if(!event)return reply({queued:false},400)
  if(process.env.ANALYTICS_INGEST_MODE!=='production')return reply({queued:false})
  if(process.env.KINNSO_ENVIRONMENT==='local'||process.env.KINNSO_SYNTHETIC_RUN==='true')return reply({queued:false})
  if(request.headers.get('x-kinnso-analytics-consent')!=='accepted'||request.headers.get('x-kinnso-consent-version')!=='v1'||!uuid.test(request.headers.get('x-kinnso-anonymous-session')??''))return reply({queued:false})
  const target=guideAdoptionHref(event.guideId!,'en')
  if(!target)return reply({queued:false},503)
  const origin=new URL(target).origin
  if(!pilotProxyConfigured())return reply({queued:false},503)
  const body=JSON.stringify(event),identity=pilotProxyHeaders(await getClientIp(),origin,body)
  if(!identity)return reply({queued:false},503)
  const response=await fetch(origin+'/api/telemetry/pilot',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,'X-Kinnso-Analytics-Consent':'accepted',Cookie:'kinnso-analytics-consent=v1:accepted',...identity},body,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(3000)})
  return reply(await response.json(),response.status)
 }catch{return reply({queued:false},503)}
}
