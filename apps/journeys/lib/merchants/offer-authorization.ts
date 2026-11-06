import {uuid} from '../api/validation';

type Client={rpc:(name:string,args?:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{message?:string}|null}>};
type Actor={id:string;roles:string[];merchantMemberships:string[]};
export async function isActiveMerchantOwner(client:Client,actor:Actor,company:string){
 if(!uuid(company)||!actor.roles.includes('merchant')||!actor.merchantMemberships.some(id=>id.toLowerCase()===company.toLowerCase()))return false;
 const result=await client.rpc('get_kinnso_merchant_memberships');
 if(result.error||!Array.isArray(result.data))return false;
 const matches=result.data.filter(row=>row&&typeof row==='object'&&(row as Record<string,unknown>).merchantId===company);
 return matches.length===1&&(matches[0] as Record<string,unknown>).role==='owner';
}
