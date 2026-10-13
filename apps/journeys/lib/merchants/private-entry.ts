import type{Membership,MerchantWorkspaceDTO}from'./repository';
export type PrivateMerchantEntry={actorId:string;memberships:Membership[];workspace:MerchantWorkspaceDTO|null};
type Client={rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{data?:unknown;error?:unknown}>};
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const roles=['owner','marketing','clerk','finance'];
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
/** Per-request user client: existing RPC authorization, no shared cache or service key. */
export async function readPrivateMerchantEntry(client:Client|null,actorId:string|null,requestedCompany:string|null):Promise<PrivateMerchantEntry|null>{
 if(!client||!uuid(actorId))return null;
 try{
  const result=await client.rpc('get_kinnso_merchant_memberships',{});
  if(result.error||!Array.isArray(result.data))return null;
  const seen=new Set<string>();
  for(const value of result.data){if(!object(value)||!uuid(value.merchantId)||typeof value.name!=='string'||!roles.includes(String(value.role))||!Array.isArray(value.branchIds)||!value.branchIds.every(uuid)||seen.has(value.merchantId))return null;seen.add(value.merchantId);}
  const memberships=result.data as Membership[],selected=memberships.find(value=>value.merchantId===requestedCompany)??memberships[0];
  if(!selected)return{actorId,memberships,workspace:null};
  const read=await client.rpc('get_kinnso_merchant_workspace',{p_merchant_id:selected.merchantId,p_after:null,p_application_after:null,p_outcome_after:null});
  const value=read.data;
  if(read.error||!object(value)||value.merchantId!==selected.merchantId||value.role!==selected.role||value.moneyCapability!=='historical_records_only'||!['branches','missions','applications','outcomes'].every(key=>Array.isArray(value[key])))return null;
  return{actorId,memberships,workspace:value as MerchantWorkspaceDTO};
 }catch{return null;}
}