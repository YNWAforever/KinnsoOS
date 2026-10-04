import {apiContext,backendFailure,failure,reply} from '../../../../../lib/api/server';
import {object,uuid} from '../../../../../lib/api/validation';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const ctx=await apiContext(request,'notifications');if(ctx.response)return ctx.response;
 try{const{id}=await params;if(!uuid(id))return failure('INVALID',400);const q=new URL(request.url).searchParams,raw=q.get('cursor');let cursor=null;
  if(raw){cursor=object(JSON.parse(raw),['createdAt','id']);if(!uuid(cursor.id)||typeof cursor.createdAt!=='string'||!Number.isFinite(Date.parse(cursor.createdAt)))return failure('INVALID',400);}
  const r=await ctx.client.rpc('get_kinnso_support_messages',{p_case_id:id,p_cursor:cursor,p_ops:q.get('ops')==='true'});return r.error?backendFailure(r.error):reply({ok:true,data:r.data});
 }catch{return failure('INVALID',400);}
}
