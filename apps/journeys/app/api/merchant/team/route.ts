import {apiContext,backendFailure,failure,reply} from '../../../../lib/api/server';
import {uuid} from '../../../../lib/api/validation';
export async function GET(request:Request){
 const ctx=await apiContext(request,'merchant');if(ctx.response)return ctx.response;
 const query=new URL(request.url).searchParams,id=query.get('id'),after=query.get('after');
 if(!id||!uuid(id)||(after!==null&&!uuid(after))||[...query.keys()].some(key=>!['id','after'].includes(key)||query.getAll(key).length!==1))return failure('INVALID',400);
 try{const result=await ctx.client.rpc('get_kinnso_merchant_team',{p_merchant_id:id,p_after:after});return result.error?backendFailure(result.error):reply({ok:true,data:result.data});}
 catch{return failure('UNAVAILABLE',503);}
}
