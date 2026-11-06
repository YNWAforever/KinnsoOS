import {apiContext,backendFailure,boundedBody,failure,reply} from '../../../../lib/api/server';
import {object,uuid} from '../../../../lib/api/validation';
import {parseMemberReason,parseOpsInvite,parseOpsReason,parseRoleChange,projectMember,projectPendingInvite} from '../../../../lib/ops/team';

function managerFailure(message=''){
 if(/forbidden/.test(message))return failure('FORBIDDEN',403);
 if(/self_(?:role_change|suspend)|last_owner/.test(message))return failure('FORBIDDEN',403);
 if(/already_ops_member/.test(message))return failure('CONFLICT',409);
 if(/not_found_or_not_(?:pending|active|suspended)/.test(message))return failure('NOT_FOUND',404);
 if(/bad_role|email_required|reason_required|reason_too_long|invalid/.test(message)||/invite_/.test(message))return failure('INVALID',400);
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
 let body:Record<string,unknown>;
 let started=false;
 try{body=object(await boundedBody(request,32768),['action','email','role','reason','memberId','inviteId']);}catch{return failure('INVALID',400);}
 try{
  if(body.action==='invite'){
   if(Object.keys(body).some(key=>!['action','email','role'].includes(key)))return failure('INVALID',400);
   const input=parseOpsInvite({email:body.email,role:body.role});
   started=true;
   const result=await ctx.client.rpc('admin_invite_ops_member',{p_email:input.email,p_role:input.role});
   if(!result.error)return reply({ok:true,data:{token:result.data}},201);
   if(result.error.code==='23505'||/duplicate|pending_invite/.test(result.error.message??'')){
    const pending=await ctx.client.from('kinnso_ops_invites').select('id,email,role,status,token,created_at,expires_at').eq('status','pending').eq('email',input.email).maybeSingle();
    if(pending.error)return backendFailure(pending.error);
    return pending.data?.token?reply({ok:true,data:{token:pending.data.token}}):failure('CONFLICT',409);
   }
   return managerFailure(result.error.message);
  }
  if(body.action==='revoke'){
   if(Object.keys(body).some(key=>!['action','inviteId'].includes(key))||typeof body.inviteId!=='string'||!uuid(body.inviteId))return failure('INVALID',400);
   started=true;
   const result=await ctx.client.rpc('admin_revoke_ops_invite',{p_invite_id:body.inviteId});
   return result.error?managerFailure(result.error.message):reply({ok:true,data:{id:body.inviteId,status:'revoked'}});
  }
  if(body.action==='setRole'){
   if(Object.keys(body).some(key=>!['action','memberId','role','reason'].includes(key)))return failure('INVALID',400);
   const input=parseRoleChange({memberId:body.memberId,role:body.role,reason:body.reason});
   started=true;
   const result=await ctx.client.rpc('admin_set_ops_member_role',{p_member_id:input.memberId,p_role:input.role,p_reason:input.reason});
   return result.error?managerFailure(result.error.message):reply({ok:true,data:{id:input.memberId,role:input.role}});
  }
  if(body.action==='suspend'||body.action==='reactivate'){
   if(Object.keys(body).some(key=>!['action','memberId','reason'].includes(key)))return failure('INVALID',400);
   const input=parseMemberReason({memberId:body.memberId,reason:body.reason}),fn=body.action==='suspend'?'admin_suspend_ops_member':'admin_reactivate_ops_member';
   started=true;
   const result=await ctx.client.rpc(fn,{p_member_id:input.memberId,p_reason:input.reason});
   return result.error?managerFailure(result.error.message):reply({ok:true,data:{id:input.memberId,status:body.action==='suspend'?'suspended':'active'}});
  }
  return failure('INVALID',400);
 }catch{return failure(started?'UNAVAILABLE':'INVALID',started?503:400);}
}
