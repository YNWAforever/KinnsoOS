import {apiContext,boundedBody,failure,reply} from '../../../../lib/api/server';
import {object,uuid} from '../../../../lib/api/validation';
import {telemetryService,telemetryContext} from '../../../../lib/telemetry/server';
import {recordPerformance} from '../../../../lib/telemetry/repository';
import {parseSample} from '../../../../lib/telemetry/performance';
export async function POST(request:Request){
 const ctx=await apiContext(request,'telemetry',true);if(ctx.response)return ctx.response;
 try{const body=object(await boundedBody(request,1024),['requestId','sample']);const sample=parseSample(body.sample);
 if(!uuid(body.requestId)||!sample||!['LCP','INP','CLS'].includes(sample.metric))return failure('INVALID',400);
 const context=await telemetryContext(ctx.actor);if(context.context==='admin'||context.consent!=='accepted'||process.env.KINNSO_ENVIRONMENT==='local'||process.env.KINNSO_SYNTHETIC_RUN==='true')return reply({ok:true,data:{accepted:false}});
 const service=telemetryService();if(!service)return failure('UNAVAILABLE',503);return reply({ok:true,data:await recordPerformance(service,body.requestId,sample,context)});
 }catch{return failure('UNAVAILABLE',503);}
}
