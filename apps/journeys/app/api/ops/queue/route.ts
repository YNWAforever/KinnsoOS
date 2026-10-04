import { apiContext, backendFailure, failure, reply } from '../../../../lib/api/server';
import { object, uuid } from '../../../../lib/api/validation';
export async function GET(request: Request) {
 const ctx=await apiContext(request,'ops');if(ctx.response)return ctx.response;
 try {
  const q=new URL(request.url).searchParams,missionId=q.get('missionId'),status=q.get('status');
  if(missionId&&!uuid(missionId))return failure('INVALID',400);
  const filter={...(missionId?{missionId}:{}),...(status?{status}:{})};
  const cursor=q.get('cursor')?object(JSON.parse(q.get('cursor')!),['bucket','deadline','id','scope']):null;
  const r=await ctx.client.rpc('get_kinnso_review_queue',{p_filter:filter,p_cursor:cursor,p_limit:50});
  return r.error?backendFailure(r.error):reply({ok:true,data:r.data});
 }catch{return failure('INVALID',400);}
}
