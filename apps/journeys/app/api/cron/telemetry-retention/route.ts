import {failure,reply} from '../../../../lib/api/server';
import {cronAccess} from '../../../../lib/telemetry/cron-auth';
import {telemetryService} from '../../../../lib/telemetry/server';
import {rpc,trackScheduled} from '../../../../lib/telemetry/repository';
export const runtime='nodejs';
export const maxDuration=30;
export async function GET(request:Request){
 const denied=cronAccess(request,process.env);if(denied)return failure(denied,denied==='FORBIDDEN'?403:401);
 const service=telemetryService();if(!service)return failure('UNAVAILABLE',503);
 try{await trackScheduled(service,'telemetry_retention',()=>rpc(service,'prune_kinnso_telemetry'));return reply({ok:true,data:{completed:true}});}catch{return failure('UNAVAILABLE',503);}
}
