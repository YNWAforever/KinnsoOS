import {apiContext,backendFailure,boundedBody,failure,reply} from '../../../lib/api/server';
import {object,uuid} from '../../../lib/api/validation';
export async function GET(request:Request){
  const q=new URL(request.url).searchParams;
  try {
    if([...q.keys()].some(k=>!['filter','cursor'].includes(k)))return failure('INVALID',400);
    const filter=object(JSON.parse(q.get('filter')??'{}'),['merchantId','missionId','state','exceptionsOnly']);
    if((filter.merchantId!==undefined&&!uuid(filter.merchantId))||(filter.missionId!==undefined&&!uuid(filter.missionId))||(filter.exceptionsOnly!==undefined&&typeof filter.exceptionsOnly!=='boolean')||(filter.state!==undefined&&!['claimed','redeemed','validated','eligible','settled','paid','recorded'].includes(String(filter.state))))return failure('INVALID',400);
    const cursor=q.has('cursor')?object(JSON.parse(q.get('cursor')!),['key','scope']):null;
    if(cursor&&(typeof cursor.key!=='string'||cursor.key.length>100||typeof cursor.scope!=='string'||cursor.scope.length>128))return failure('INVALID',400);
    const ctx=await apiContext(request,filter.merchantId?'merchant':'ops');if(ctx.response)return ctx.response;
    const result=await ctx.client.rpc('get_kinnso_reconciliation',{p_filter:filter,p_cursor:cursor});
    return result.error?backendFailure(result.error):reply({ok:true,data:result.data});
  }catch{return failure('INVALID',400);}
}
export async function POST(request:Request){
  try {
    const body=object(await boundedBody(request,8192),['requestId','command']);
    const command=object(body.command,['type','sourceKey','id','expectedRevision','status','reason']);
    if(!uuid(body.requestId)||!['open','review'].includes(String(command.type))||typeof command.reason!=='string'||command.reason.trim().length<10||command.reason.length>2000)return failure('INVALID',400);
    if(command.type==='open'&&(typeof command.sourceKey!=='string'||! /^(settlement|receipt):[0-9a-f-]{36}$/i.test(command.sourceKey)))return failure('INVALID',400);
    if(command.type==='review'&&(!uuid(command.id)||!Number.isSafeInteger(command.expectedRevision)||Number(command.expectedRevision)<1||!['open','investigating','waiting_business_rules','closed'].includes(String(command.status))))return failure('INVALID',400);
    // Both capabilities expose this authenticated service; the database determines
    // authority from the real source record, never from this capability flag.
    let ctx=await apiContext(request,'merchant',true);
    if(ctx.response?.status===503)ctx=await apiContext(request,'ops',true);
    if(ctx.response)return ctx.response;
    const result=await ctx.client.rpc('apply_kinnso_reconciliation_review',{p_request_id:body.requestId,p_command:command});
    return result.error?backendFailure(result.error):reply({ok:true,data:result.data});
  }catch{return failure('INVALID',400);}
}
