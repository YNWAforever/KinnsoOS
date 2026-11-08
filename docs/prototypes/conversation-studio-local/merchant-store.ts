import type {MerchantTaskStore} from '../../../apps/journeys/lib/studio/merchant-tasks';
import type {StudioResponse} from '../../../apps/journeys/lib/studio/contracts';
async function request<T>(url:string,body?:unknown):Promise<StudioResponse<T>>{
 try{const r=await fetch(url,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});const value=await r.json();if(r.ok&&value.ok===true)return value;return {ok:false,code:['INVALID','NOT_FOUND','CONFLICT','FORBIDDEN','RESTRICTED'].includes(value.code)?value.code:'UNAVAILABLE',retryable:r.status>=500};}catch{return {ok:false,code:'UNAVAILABLE',retryable:true};}
}
const scope=(company:string)=>'?company='+encodeURIComponent(company);
export const localMerchantStore:MerchantTaskStore={
 catalogue:(company,task)=>request('/__preview/merchant/catalogue'+scope(company)+'&task='+task),
 list:company=>request('/__preview/merchant/briefs'+scope(company)),get:(id,company)=>request('/__preview/merchant/briefs/'+encodeURIComponent(id)+scope(company)),
 intent:(id,company)=>request('/__preview/merchant/intents/'+encodeURIComponent(id)+scope(company)),stage:brief=>request('/__preview/merchant/intents',brief),save:brief=>request('/__preview/merchant/briefs',brief)
};
