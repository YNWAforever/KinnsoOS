export const OPS_ROLES=['owner','admin','moderator','analyst'] as const;
export type OpsRole=(typeof OPS_ROLES)[number];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const token=/^[a-f0-9]{64}$/;
const invalid=():never=>{throw Error('INVALID_OPS_TEAM')};
const record=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);

export function parseOpsInvite(value:unknown){
 if(!record(value)||Object.keys(value).some(key=>!['email','role'].includes(key)))return invalid();
 const email=typeof value.email==='string'?value.email.trim().toLowerCase():'';
 if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!OPS_ROLES.includes(value.role as OpsRole))return invalid();
 return{email,role:value.role as OpsRole};
}
export function parseOpsReason(value:unknown){
 if(typeof value!=='string')return invalid();const reason=value.trim();if(!reason||reason.length>500)return invalid();return reason;
}
export function parseOpsToken(value:unknown){
 if(typeof value!=='string'||!token.test(value))return invalid();return value;
}
export function parseRoleChange(value:unknown){
 if(!record(value)||Object.keys(value).some(key=>!['memberId','role','reason'].includes(key))||typeof value.memberId!=='string'||!uuid.test(value.memberId)||!OPS_ROLES.includes(value.role as OpsRole))return invalid();
 return{memberId:value.memberId,role:value.role as OpsRole,reason:parseOpsReason(value.reason)};
}
export function parseMemberReason(value:unknown){
 if(!record(value)||Object.keys(value).some(key=>!['memberId','reason'].includes(key))||typeof value.memberId!=='string'||!uuid.test(value.memberId))return invalid();
 return{memberId:value.memberId,reason:parseOpsReason(value.reason)};
}
export function projectPendingInvite(row:Record<string,unknown>){
 if(typeof row.id!=='string'||!uuid.test(row.id)||typeof row.email!=='string'||!OPS_ROLES.includes(row.role as OpsRole)||row.status!=='pending'||typeof row.created_at!=='string'||typeof row.expires_at!=='string')return invalid();
 return{id:row.id,email:row.email,role:row.role,status:row.status,createdAt:row.created_at,expiresAt:row.expires_at};
}
export function projectMember(row:Record<string,unknown>){
 if(typeof row.id!=='string'||!uuid.test(row.id)||typeof row.display_name!=='string'||typeof row.user_id!=='string'||!uuid.test(row.user_id)||!OPS_ROLES.includes(row.role as OpsRole)||!['active','paused','suspended'].includes(String(row.status))||typeof row.joined_at!=='string')return invalid();
 return{id:row.id,displayName:row.display_name,userId:row.user_id,role:row.role,status:row.status,joinedAt:row.joined_at};
}
