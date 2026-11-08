// Original component recovery contracts, stored only in this preview session.
import {createHash} from 'node:crypto';
export function memoryCache(actor){
 const snapshots=new Map(),drafts=new Map(),creations=new Map(),adoptions=new Map(),workspaces=new Map();
 const clone=v=>structuredClone(v),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const hash=input=>createHash('sha256').update(JSON.stringify({title:input.title,timezone:input.timezone,startDate:input.startDate})).digest('hex');
 return function handle(body){
  const [owner,a,b,c,d,e]=body?.args??[],op=body?.operation;
  const fail=code=>({status:409,body:{ok:false,code}}),ok=data=>({status:200,body:{ok:true,data:clone(data??null)}});
  if(op!=='clear'&&owner!==actor)return fail('CACHE_ACCOUNT_CHANGED');
  switch(op){
   case 'synchronize':return ok(null);
   case 'saveSnapshot':snapshots.set(a.id,clone(a));return ok(null);
   case 'readSnapshot':return ok(snapshots.get(a));
   case 'saveDraft':{const old=drafts.get(a);if(old&&old.requestId!==d&&!e)return fail('PENDING_DRAFT');drafts.set(a,{ownerId:owner,tripId:a,baseRevision:b,command:clone(c),requestId:d});return ok(null);}
   case 'readDraft':return ok(drafts.get(a));
   case 'clearDraft':if(drafts.get(a)?.requestId===b)drafts.delete(a);return ok(null);
   case 'clear':for(const m of [snapshots,drafts,creations,adoptions,workspaces])m.clear();return ok(null);
   case 'saveCreation':{const intent={...clone(a),inputHash:hash(b)},key=a.guideId??'manual',old=creations.get(key);if(a.inputHash&&a.inputHash!==intent.inputHash)return fail('ORIGINAL_INPUT_MISMATCH');if(old&&(!same(old.intent,intent)||!same(old.input,b)))return fail('PENDING_DRAFT');creations.set(key,{intent,input:clone(b)});return ok(null);}
   case 'readCreation':return ok(creations.get(a??'manual'));
   case 'recordCreation':{const row=creations.get(a??'manual');if(!row||row.intent.requestId!==b||row.intent.tripId&&row.intent.tripId!==c)return fail('PENDING_DRAFT');row.intent.tripId=c;row.input=null;return ok(null);}
   case 'clearCreation':{const row=creations.get(a??'manual');if(row?.intent.requestId===b){if(!row.intent.tripId)return fail('PENDING_DRAFT');creations.delete(a??'manual');}return ok(null);}
   case 'rejectCreation':{const row=creations.get(a??'manual');if(!row||row.intent.requestId!==b||row.intent.tripId||row.intent.inputHash!==hash(c))return fail('PENDING_DRAFT');creations.delete(a??'manual');return ok(null);}
   case 'restoreCreation':{const row=creations.get(a??'manual');if(!row||row.intent.requestId!==b||row.intent.tripId)return fail('PENDING_DRAFT');if(row.intent.inputHash!==hash(c))return fail('ORIGINAL_INPUT_MISMATCH');row.input=clone(c);return ok(c);}
   case 'saveAdoption':{const old=adoptions.get(a.guideId);if(old&&!same(old,a))return fail('PENDING_DRAFT');adoptions.set(a.guideId,clone(a));return ok(null);}
   case 'readAdoption':return ok(adoptions.get(a));
   case 'readAdoptions':return ok([...adoptions.values()]);
   case 'clearAdoption':if(adoptions.get(a)?.requestId===b)adoptions.delete(a);return ok(null);
   case 'saveWorkspace':{const old=workspaces.get(a);if(old?.pending&&!same(old.pending,b.pending))return fail('PENDING_DRAFT');workspaces.set(a,clone(b));return ok(null);}
   case 'readWorkspace':return ok(workspaces.get(a));
   case 'clearWorkspace':{const old=workspaces.get(a),id=old?.pending?.requestId??old?.pending?.id;if(!id||id===b)workspaces.delete(a);return ok(null);}
   case 'releaseWorkspace':{const old=workspaces.get(a),id=old?.pending?.requestId??old?.pending?.id;if(id===b)old.pending=null;return ok(null);}
   case 'completeWorkspace':{const old=workspaces.get(a),id=old?.pending?.requestId??old?.pending?.id;if(id!==b)return fail('PENDING_DRAFT');workspaces.set(a,{version:1,draft:clone(c),pending:null});return ok(null);}
   default:return fail('INVALID');
  }
 };
}
