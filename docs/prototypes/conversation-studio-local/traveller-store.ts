import type {TravellerStore} from '../../../apps/journeys/lib/studio/traveller-tasks';
import type {StudioResponse} from '../../../apps/journeys/lib/studio/contracts';
async function request<T>(url:string,body?:unknown,anonymous=false):Promise<StudioResponse<T>> {
 try{const r=await fetch(url,{method:body?'POST':'GET',credentials:anonymous?'omit':'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});const value=await r.json();if(r.ok&&value.ok===true)return value;return{ok:false,code:['INVALID','NOT_FOUND','CONFLICT','FORBIDDEN','RESTRICTED'].includes(value.code)?value.code:'UNAVAILABLE',retryable:r.status>=500};}catch{return{ok:false,code:'UNAVAILABLE',retryable:true};}
}
export const localTravellerStore:TravellerStore={
 list:()=>request('/__preview/traveller/briefs'),get:id=>request('/__preview/traveller/briefs/'+encodeURIComponent(id)),save:brief=>request('/__preview/traveller/briefs',brief),
 stage:brief=>request('/__preview/traveller/intents',brief),intent:id=>request('/__preview/traveller/intents/'+encodeURIComponent(id)),
 samplePhoto:async()=>{const r=await fetch('/__preview/sample-photo');if(!r.ok)throw Error('未能讀取示例圖。');return r.blob();},
 publicRead:async url=>{const parsed=new URL(url);if(parsed.origin!==location.origin||!/^\/zh-HK\/s\/[a-f\d-]+$/.test(parsed.pathname))return{ok:false,code:'INVALID',retryable:false};return request('/__preview/public/'+parsed.pathname.split('/').at(-1),undefined,true);}
};
