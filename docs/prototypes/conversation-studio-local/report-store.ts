// Imported only by the standalone local preview, never by a product route.
import type {CreatorReport,CreatorReportStore} from '../../../apps/journeys/lib/studio/creator-reports';
import type {StudioResponse} from '../../../apps/journeys/lib/studio/contracts';
async function request<T>(path:string,body?:unknown):Promise<StudioResponse<T>> {
 try{const result=await fetch(path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});const value=await result.json();if(result.ok&&value.ok===true)return value;return{ok:false,code:['CONFLICT','INVALID','NOT_FOUND','FORBIDDEN','AUTH_REQUIRED','RESTRICTED'].includes(value.code)?value.code:'UNAVAILABLE',retryable:value.code==='UNAVAILABLE'||result.status>=500};}catch{return{ok:false,code:'UNAVAILABLE',retryable:true};}
}
export const localCreatorReportStore:CreatorReportStore={label:'本機示例・記憶體保存',list:()=>request<{items:CreatorReport[]}>('/__preview/reports'),get:id=>request('/__preview/reports/'+encodeURIComponent(id)),stage:intent=>request('/__preview/report-intents',intent),intent:id=>request('/__preview/report-intents/'+encodeURIComponent(id)),save:intent=>request('/__preview/reports',intent),receipt:id=>request('/__preview/report-requests/'+encodeURIComponent(id))};
