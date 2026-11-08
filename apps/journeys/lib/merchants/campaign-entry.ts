type Result={data?:unknown;error?:unknown};
export type CampaignEntryClient={
 rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<Result>;
};
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
/** Fresh user client only. Native RPC recognizes active owners and marketing members for closed campaigns. */
export async function resolveMerchantCampaignEntry(client:CampaignEntryClient|null,actorId:string|null,campaignId:string):Promise<{merchantId:string;campaignId:string}|null>{
 if(!client||!uuid(actorId)||!uuid(campaignId))return null;
 try{
  const actor=await client.rpc('kinnso_actor',{});
  if(actor.error||!object(actor.data)||actor.data.id!==actorId)return null;
  const memberships=await client.rpc('get_kinnso_merchant_memberships',{});
  if(memberships.error||!Array.isArray(memberships.data)||!memberships.data.length||memberships.data.some(m=>!object(m)||!uuid(m.merchantId)))return null;
  if(new Set(memberships.data.map(m=>m.merchantId)).size!==memberships.data.length)return null;
  for(const member of memberships.data){
   if(!['owner','marketing'].includes(member.role))continue;
   const read=await client.rpc('get_kinnso_merchant_campaigns',{p_merchant_id:member.merchantId,p_after:null,p_campaign_id:campaignId,p_participant_after:null,p_submission_after:null,p_branch_after:null});
   if(read.error){if(object(read.error)&&read.error.message==='forbidden')continue;return null;}
   if(!object(read.data)||read.data.merchantId!==member.merchantId||!object(read.data.detail)||!uuid(read.data.detail.id)||read.data.detail.id.toLowerCase()!==campaignId.toLowerCase())return null;
   return{merchantId:member.merchantId,campaignId:read.data.detail.id};
  }
  return null;
 }catch{return null;}
}
