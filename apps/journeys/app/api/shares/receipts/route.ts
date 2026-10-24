import {apiContext,backendFailure,failure,reply} from '../../../../lib/api/server';
import {uuid} from '../../../../lib/api/validation';
import {shareReceipt,shareReceiptPage} from '../../../../lib/trips/share-receipt-api';
export async function GET(request:Request){
 const ctx=await apiContext(request,'shareRecovery');if(ctx.response)return ctx.response;
 const q=new URL(request.url).searchParams,tripId=q.get('tripId'),requestId=q.get('requestId'),before=q.get('before'),beforeRequestId=q.get('beforeRequestId');
 if(!uuid(tripId)||[...q.keys()].some(k=>!['tripId','requestId','before','beforeRequestId'].includes(k)||q.getAll(k).length!==1)||
  (requestId!==null&&(!uuid(requestId)||before!==null||beforeRequestId!==null))||
  ((before===null)!==(beforeRequestId===null))||before!==null&&(!Number.isFinite(Date.parse(before))||!uuid(beforeRequestId)))return failure('INVALID',400);
 try{
  if(requestId!==null){const r=await ctx.client.rpc('get_trip_share_receipt',{p_trip_id:tripId,p_request_id:requestId});
   return r.error?backendFailure(r.error):reply({ok:true,data:r.data===null?null:shareReceipt(r.data,ctx.actor.id,tripId,requestId)});}
  const r=await ctx.client.rpc('list_trip_share_receipts',{p_trip_id:tripId,p_before:before,p_before_request:beforeRequestId});
  return r.error?backendFailure(r.error):reply({ok:true,data:shareReceiptPage(r.data)});
 }catch{return failure('UNAVAILABLE',503);}
}
