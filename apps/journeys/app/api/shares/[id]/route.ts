import {apiContext,backendFailure,failure,reply} from '../../../../lib/api/server';import {uuid} from '../../../../lib/api/validation';
export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}) {
 const ctx=await apiContext(request,'sharing',true);if(ctx.response)return ctx.response;
 const {id}=await params;if(!uuid(id))return failure('NOT_FOUND',404);
 const result=await ctx.client.rpc('revoke_trip_share',{p_share_id:id});return result.error?backendFailure(result.error):reply({ok:true,data:result.data});
}
