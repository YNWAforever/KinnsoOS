import {telemetryService} from '../../../../lib/telemetry/server';
import {secretEqual} from '../../../../lib/security/secrets';

export async function GET(request:Request){
 const authorization=request.headers.get('authorization');
 if(!secretEqual(authorization,process.env.CRON_SECRET?`Bearer ${process.env.CRON_SECRET}`:undefined))return Response.json({ok:false,error:'unauthorized'},{status:401});
 const service=telemetryService();
 if(!service)return Response.json({ok:false,error:'unavailable'},{status:503});
 try{
  const result=await service.rpc('purge_traveller_analytics_events');
  return result.error?Response.json({ok:false,error:'retention failed'},{status:500}):Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({ok:false,error:'retention failed'},{status:500});}
}
