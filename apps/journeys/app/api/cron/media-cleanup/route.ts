import {failure,reply} from '../../../../lib/api/server';
import {cleanupMedia,unifiedMediaEnvironment} from '../../../../lib/media/service';
import {cronAccess} from '../../../../lib/telemetry/cron-auth';
import {telemetryService} from '../../../../lib/telemetry/server';
import {trackScheduled} from '../../../../lib/telemetry/repository';

export const runtime='nodejs';
export const maxDuration=30;

export async function GET(request:Request) {
 const denied=cronAccess(request,process.env);if(denied)return failure(denied,denied==='FORBIDDEN'?403:401);
 try {
  const service=telemetryService(),work=()=>cleanupMedia(unifiedMediaEnvironment(process.env));
  return reply({ok:true,data:service?await trackScheduled(service,'media_cleanup',work):await work()});
 }catch{return failure('UNAVAILABLE',503)}
}
