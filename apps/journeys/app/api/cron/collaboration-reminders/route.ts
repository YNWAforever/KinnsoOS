import {failure,reply} from '../../../../lib/api/server';
import {cronAccess} from '../../../../lib/telemetry/cron-auth';
import {telemetryService} from '../../../../lib/telemetry/server';
import {rpc,trackScheduled} from '../../../../lib/telemetry/repository';
import {runCollaborationReminders,type ReminderPage} from '../../../../lib/collaboration/reminders';
export const runtime='nodejs';export const maxDuration=30;
export async function GET(request:Request){
 const denied=cronAccess(request,process.env);if(denied)return failure(denied,denied==='FORBIDDEN'?403:401);
 const service=telemetryService();if(!service)return failure('UNAVAILABLE',503);
 try{const now=new Date().toISOString();const result=await trackScheduled(service,'collaboration_reminders',async()=>{
  const result=await runCollaborationReminders(now,{due:query=>rpc<ReminderPage>(service,'due_kinnso_collaboration_reminders',{p_now:query.now,p_after:query.after,p_limit:query.limit}),emit:(candidate,tick)=>rpc<{emitted:boolean}>(service,'emit_kinnso_collaboration_reminder',{p_now:tick,p_candidate:candidate})});
  // A bounded partial scan is retryable work, never a successful full job.
  if(!result.completed)throw Error('INCOMPLETE');return result;
 });return reply({ok:true,data:result});}catch{return failure('UNAVAILABLE',503);}
}
