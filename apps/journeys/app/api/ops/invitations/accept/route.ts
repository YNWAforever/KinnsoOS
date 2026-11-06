import {apiContext,boundedBody,failure,reply} from '../../../../../lib/api/server';
import {object} from '../../../../../lib/api/validation';
import {parseOpsToken} from '../../../../../lib/ops/team';

function acceptFailure(message=''){
 if(/email_mismatch/.test(message))return failure('FORBIDDEN',403);
 if(/invite_(?:expired|accepted|revoked)/.test(message))return failure('CONFLICT',409);
 if(/not_found/.test(message))return failure('NOT_FOUND',404);
 if(/unauthenticated/.test(message))return failure('AUTH_REQUIRED',401);
 return failure('UNAVAILABLE',503);
}
export async function POST(request:Request){
 const ctx=await apiContext(request,'ops',true);if(ctx.response)return ctx.response;
 let token:string;
 try{const body=object(await boundedBody(request,8192),['token']);token=parseOpsToken(body.token);}catch{return failure('INVALID',400);}
 try{const result=await ctx.client.rpc('admin_accept_ops_invite',{p_token:token});return result.error?acceptFailure(result.error.message):reply({ok:true,data:{accepted:true}});}catch{return failure('UNAVAILABLE',503);}
}
