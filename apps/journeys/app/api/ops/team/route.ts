import {apiContext,backendFailure,boundedBody,failure,reply} from '../../../../lib/api/server';
import {object,uuid} from '../../../../lib/api/validation';
import {parseMemberReason,parseOpsInvite,parseRoleChange,projectMember,projectPendingInvite} from '../../../../lib/ops/team';

function managerFailure(message=''){
 if(/forbidden/.test(message))return failure('FORBIDDEN',403);
 if(/self_(?:role_change|suspend)|last_owner/.test(message))return failure('FORBIDDEN',403);
 if(/already_ops_member|pending_invite_conflict|REQUEST_ID_REUSED|INVITE_RECEIPT_UNAVAILABLE/.test(message))return failure('CONFLICT',409);
 if(/not_found|not_found_or_not_(?:pending|active|suspended)/.test(message))return failure('NOT_FOUND',404);
 if(/bad_role|email_(?:required|too_long)|reason_(?:required|too_long)|invalid/.test(message)||/invite_/.test(message))return failure('INVALID',400);
 return failure('UNAVAILABLE',503);
}
async function owner(client:any){const result=await client.rpc('is_active_ops_role',{p_min:'owner'});return!result.error&&result.data===true;}

export async function GET(request:Request){
 const ctx=await apiContext(request,'ops');if(ctx.response)return ctx.response;
 if(!ctx.actor.roles.includes('ops'))return failure('FORBIDDEN',403);
 if(new URL(request.url).search)return failure('INVALID',400);
 try{
  const[membersResult,canManage,pendingResult]=await Promise.all([
   ctx.client.rpc('admin_list_ops_members'),owner(ctx.client),
   ctx.client.from('kinnso_ops_invites').select('id,email,role,status,created_at,expires_at').eq('status','pending').order('created_at',{ascending:false}).limit(25),
  ]);
  if(membersResult.error||pendingResult.error)return backendFailure(membersResult.error??pendingResult.error);
  const members=((membersResult.data??[]) as Record<string,unknown>[]).map(projectMember);
  const pendingInvites=((pendingResult.data??[]) as Record<string,unknown>[]).map(projectPendingInvite);
  return reply({ok:true,data:{members,pendingInvites,canManage}});
 }catch{return failure('UNAVAILABLE',503);}
}

export async function POST(request:Request){
 const ctx=await apiContext(request,'ops',true);if(ctx.response)return ctx.response;
 if(!ctx.actor.roles.includes('ops'))return failure('FORBIDDEN',403);
 if(!await owner(ctx.client))return failure('FORBIDDEN',403);
 let args: {p_request_id:string;p_action:string;p_target?:string;p_email?:string;p_role?:string;p_reason?:string};
 try{
  const body=object(await boundedBody(request,32768),['requestId','action','email','role','reason','memberId','inviteId']);
  if(!uuid(body.requestId)||typeof body.action!=='string')return failure('INVALID',400);
  const {requestId,action,...input}=body;
  args={p_request_id:requestId,p_action:action};
  switch(action){
   case 'invite': {
    const {email,role}=parseOpsInvite(input);
    Object.assign(args,{p_email:email,p_role:role});break;
   }
   case 'revoke':
    if(Object.keys(input).length!==1||!uuid(input.inviteId))return failure('INVALID',400);
    args.p_target=input.inviteId;break;
   case 'setRole': {
    const {memberId,role,reason}=parseRoleChange(input);
    Object.assign(args,{p_target:memberId,p_role:role,p_reason:reason});break;
   }
   case 'suspend':
   case 'reactivate': {
    const {memberId,reason}=parseMemberReason(input);
    Object.assign(args,{p_target:memberId,p_reason:reason});break;
   }
   default:return failure('INVALID',400);
  }
 }catch{return failure('INVALID',400);}
 try{
  const result=await ctx.client.rpc('mutate_kinnso_ops_team',args);
  return result.error?managerFailure(result.error.message):reply({ok:true,data:result.data},args.p_action==='invite'?201:200);
 }catch{return failure('UNAVAILABLE',503);}
}
