import {merchants} from '../merchants/repository';
import {merchantOnboarding} from '../merchants/onboarding';
import {profileInput} from '../merchants/onboarding-validation';
import {merchantCampaigns} from '../merchants/campaign-repository';
import {campaignCommand} from '../merchants/campaigns';
import {support} from '../notifications/repository';
import {merchantProfileInput,merchantCampaignInput,merchantTaskAllowed,type MerchantBrief,type MerchantTaskStore} from './merchant-tasks';
import {sameValue} from './contracts';
export type MerchantOutcome={message:string;destination:string;campaignId?:string};
function required<T>(r:{ok:true;data:T}|{ok:false;code:string}):T{if(!r.ok)throw Object.assign(Error(['FORBIDDEN','RESTRICTED','AUTH_REQUIRED','NOT_FOUND'].includes(r.code)?'公司、個案或來源權限已變更，請重新讀取。':r.code==='CONFLICT'?'來源已有較新版本，請保留此 brief，重新讀取後另開提案。':r.code==='INVALID'?'原流程拒絕這些欄位，請核對資料。':'結果未知。請保留此 brief，核對／重試同一請求。'),{code:r.code});return r.data;}
export async function executeMerchantBrief(brief:MerchantBrief,store:MerchantTaskStore,active:()=>boolean):Promise<MerchantOutcome>{
 const check=()=>{if(!active())throw Error('公司或帳戶已變更。');};
 const stored=required(await store.get(brief.id,brief.companyId));check();if(!sameValue(stored,brief))throw Error('brief 已變更，請重新讀取。');
 const memberships=required(await merchants.memberships());check();if(!merchantTaskAllowed(brief.templateId,memberships.find(m=>m.merchantId===brief.companyId)?.role))throw Object.assign(Error('目前公司的角色不允許此操作。'),{code:'FORBIDDEN'});
 const op=brief.operation,company=encodeURIComponent(brief.companyId);
 if(!op)return{message:'私人素材／檢查／成果報告已保存並讀回；沒有更改原活動。',destination:brief.templateId==='M5'?'merchants/dashboard/insights?company='+company:'merchant/missions?company='+company+(brief.source.kind==='campaign'?'&campaign='+brief.source.value.id:'')};
 if(op.kind==='profile'){
  const input=profileInput(op.input),ack=required(await merchantOnboarding.save(brief.companyId,input,op.expectedUpdatedAt,op.requestId));check();
  const current=required(await merchantOnboarding.profile(brief.companyId));check();
  if(current.id!==brief.companyId||current.updatedAt!==ack.updatedAt||!sameValue(merchantProfileInput(current),input))throw Error('結果未知：未能讀回相同的商戶資料。');
  return{message:'商戶資料已存回示例公司並讀回。',destination:'merchant/profile?company='+company};
 }
 if(op.kind==='reply'){
  const ack=required(await support.command(op.command,op.requestId));check();const receipt=required(await support.receipt(op.command,op.requestId));check();
  const page=required(await support.list());check();const current=page.items.find(c=>c.id===op.command.id);
  const count=(messages:{message:string;mine:boolean}[])=>messages.filter(m=>m.mine&&m.message===op.command.message).length;
  if(receipt.result?.id!==op.command.id||receipt.result.revision!==ack.revision||!current||current.revision<ack.revision||brief.source.kind!=='case'||count(current.messages)<=count(brief.source.value.messages))throw Error('結果未知：未能核對原個案的回覆。');
  return{message:'回覆已存入指定的站內示例個案並讀回；沒有傳送外部訊息。',destination:'support'+(current.context?'?mission='+encodeURIComponent(current.context.id):'')};
 }
 if(brief.source.kind==='materials'&&brief.source.value.documents.some(d=>d.visibility==='private'&&!brief.privateSourceConsent.includes(d.id)))throw Object.assign(Error('私人文件尚未逐項確認供公司使用。'),{code:'RESTRICTED'});
 const command=campaignCommand(op.command),ack=required(await merchantCampaigns.command(brief.companyId,command,op.requestId));check();
 const result=required(await merchantCampaigns.list(brief.companyId,{campaignId:ack.id}));check();const current=result.detail;
 if(!current||current.id!==command.id||current.updatedAt!==ack.updatedAt)throw Error('結果未知：未能讀回相同活動版本。');
 if(command.type==='createDraft'||command.type==='updateDraft'){
  if(current.status!=='draft'||!sameValue(merchantCampaignInput(current),command.input))throw Error('結果未知：活動草稿內容不符。');
  return{message:'活動素材已交回原活動草稿並讀回，尚未發佈。',campaignId:current.id,destination:'merchant/missions?company='+company+'&campaign='+current.id};
 }
 if(command.type!=='publish'||current.status!=='published'||brief.source.kind!=='campaign'||!sameValue(merchantCampaignInput(current),merchantCampaignInput(brief.source.value)))throw Error('結果未知：未能核對發佈內容。');
 return{message:'已確認原活動在本機示例發佈；創作者交付及審核仍走原流程。',campaignId:current.id,destination:'merchant/missions?company='+company+'&campaign='+current.id};
}
