import {trips} from '../trips/repository';
import {bookmarks} from '../bookmarks/repository';
import {sharing} from '../trips/sharing';
import {uploadPhoto} from '../media/uploads';
import {travellerCommandPresent,type TravellerBrief,type TravellerOutcome,type TravellerStore} from './traveller-tasks';

const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function required<T>(result:{ok:true;data:T}|{ok:false;code:string}):T {
 if(!result.ok)throw Error(['CONFLICT','INVALID','FORBIDDEN','NOT_FOUND','RESTRICTED'].includes(result.code)?'來源或行程已有變更／無權使用，請重新讀取並另開 brief。':'結果未知。請保留這份 brief，核對／重試同一請求。');
 return result.data;
}
/** Replay the persisted immutable intent through the existing domain clients. */
export async function executeTravellerBrief(brief:TravellerBrief,store:TravellerStore,active:()=>boolean,signal?:AbortSignal):Promise<TravellerOutcome> {
 const stored=required(await store.get(brief.id));if(!equal(stored,brief))throw Error('brief 已變更，請重新讀取。');
 let target=brief.tripId??'',outcome:TravellerOutcome={message:'私人整理建議已保存並讀回。'};
 const check=()=>{if(!active())throw Error('帳戶或畫面已變更，請重新登入核對。');};
 for(const op of brief.operations){
  check();
  if(op.kind==='create'){
   const ack=required(await trips.create(op.input,op.requestId,brief.ownerId));check();
   const receipt=required(await trips.creation(op.requestId,brief.ownerId));check();
   if(receipt.tripId!==ack.id)throw Error('結果未知：未能讀回建立記錄。');
   const current=required(await trips.get(ack.id,brief.ownerId));check();
   if(!Object.entries(op.input).every(([k,v])=>current[k as keyof typeof current]===v))throw Error('結果未知：行程內容未能核對。');
   target=ack.id;outcome.tripId=target;
  }else if(op.kind==='command'){
   const id=op.tripId==='created'?target:op.tripId;
   const ack=required(await trips.apply(id,op.revision,op.requestId,op.command,brief.ownerId));check();
   const current=required(await trips.get(id,brief.ownerId));check();
   if(current.revision<ack.revision||!travellerCommandPresent(current,op.command))throw Error('結果未知：未能讀回相同的行程內容。');
   outcome.tripId=id;
  }else if(op.kind==='adopt'){
   const ack=required(await trips.adopt(op.guideId,op.version,op.tripId,op.revision,op.requestId,undefined,brief.ownerId));check();
   const current=required(await trips.get(op.tripId,brief.ownerId));check();
   const added=current.days.flatMap(d=>d.stops).filter(s=>s.source?.guideId===op.guideId&&s.source.guideVersion===op.version);
   if(current.revision<ack.revision||!op.guide.days.flatMap(d=>d.stops).every(s=>added.some(a=>a.title===s.title&&a.sourceDescription===s.description&&a.source?.creatorId===op.guide.creator.id)))throw Error('結果未知：未能核對來源版本及作者。');
   outcome.tripId=op.tripId;
  }else if(op.kind==='bookmark'){
   required(await bookmarks.toggle(op.guideId,op.desiredState,op.requestId,brief.ownerId));check();
   const current=required(await bookmarks.list(brief.ownerId,undefined,op.guideId));check();
   if(current.items.some(b=>b.guide_id===op.guideId)!==op.desiredState)throw Error('結果未知：未能讀回收藏。');
  }else if(op.kind==='photo'){
   const photo=await store.samplePhoto();check();
   const media=required(await uploadPhoto(op.tripId,photo,op.requestId,signal));check();
   if(media.state!=='ready'||media.ownerId!==brief.ownerId||media.visibility!=='private')throw Error('圖片未完成核實，尚未附加。');
   const command={type:'attachMedia' as const,mediaId:media.id,stopId:op.stopId};
   const ack=required(await trips.apply(op.tripId,op.revision,op.attachRequestId,command,brief.ownerId));check();
   const current=required(await trips.get(op.tripId,brief.ownerId));check();
   if(current.revision<ack.revision||!travellerCommandPresent(current,command))throw Error('結果未知：圖片尚未確認附加。');
   outcome.tripId=op.tripId;
  }else{
   required(await sharing.create(op.intent));check();
   const receipt=required(await sharing.receipt(op.intent.tripId,op.requestId));check();
   if(!receipt||!equal(receipt.intent,op.intent)||!equal(receipt.projection,op.projection))throw Error('結果未知：分享記錄不符。');
   if(receipt.state==='revoked'){outcome={message:'此分享已撤回；不會建立另一條連結。',share:receipt};continue;}
   if(!receipt.url||receipt.state!=='active')throw Error('分享已到期或無法讀取。');
   const publicCopy=required(await store.publicRead(receipt.url));check();
   if(!equal(publicCopy,op.projection))throw Error('結果未知：公開內容未能核對。');
   outcome={message:'示例分享已建立，已核對記錄與公開頁。',share:receipt};
  }
 }
 if(outcome.tripId)outcome.message='成果已存回示例行程並讀回。';
 if(brief.operations.some(o=>o.kind==='bookmark'))outcome.message='收藏變更已讀回；整理建議保留在私人 brief。';
 return outcome;
}
export async function revokeTravellerShare(receipt:NonNullable<TravellerOutcome['share']>,store:TravellerStore,active:()=>boolean) {
 const oldUrl=receipt.url;
 required(await sharing.revoke(receipt.id));if(!active())throw Error('帳戶已變更。');
 const current=required(await sharing.receipt(receipt.intent.tripId,receipt.requestId));
 if(!active())throw Error('帳戶已變更。');
 if(!current||current.state!=='revoked'||current.url!==null)throw Error('撤回結果未知，請重試撤回同一連結。');
 if(oldUrl){const publicRead=await store.publicRead(oldUrl);if(!active())throw Error('帳戶已變更。');if(publicRead.ok||publicRead.code!=='NOT_FOUND')throw Error('撤回結果未知，未能確認連結失效。');}
 return current;
}
