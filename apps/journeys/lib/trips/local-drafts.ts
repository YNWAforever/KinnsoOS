import type {TripSnapshot,TripCommand} from '../contracts/trips';
const database='kinnso_account_cache_v1';
type Draft={ownerId:string;tripId:string;baseRevision:number;requestId:string;command:TripCommand};
function open():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const r=indexedDB.open(database,5);r.onupgradeneeded=()=>{for(const name of ['snapshots','drafts','recoveries','adoptions','creations','identity'])if(!r.result.objectStoreNames.contains(name))r.result.createObjectStore(name,{keyPath:'key'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(new Error('LOCAL_STORAGE_UNAVAILABLE'))})}
const accountEvent='kinnso:account-invalidated',channelName='kinnso-account-lifecycle';
export function invalidateAccountViews(ownerId:string|null){window.dispatchEvent(new CustomEvent(accountEvent,{detail:{ownerId}}));if(typeof BroadcastChannel!=='undefined'){const channel=new BroadcastChannel(channelName);channel.postMessage({ownerId});channel.close()}}
export function subscribeAccountInvalidation(callback:(ownerId:string|null)=>void){const handler=(event:Event)=>callback((event as CustomEvent<{ownerId:string|null}>).detail.ownerId);window.addEventListener(accountEvent,handler);const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel(channelName):null;if(channel)channel.onmessage=event=>{if(event.data?.ownerId===null||typeof event.data?.ownerId==='string')callback(event.data.ownerId)};return()=>{window.removeEventListener(accountEvent,handler);channel?.close()}}
export async function synchronizeAccountCache(ownerId:string){const db=await open();let changed=false;try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['identity','snapshots','drafts','recoveries'],'readwrite'),identity=tx.objectStore('identity'),r=identity.get('actor');r.onsuccess=()=>{if(r.result?.ownerId!==ownerId){changed=!!r.result?.ownerId;tx.objectStore('snapshots').clear();tx.objectStore('drafts').clear();tx.objectStore('recoveries').clear();identity.put({key:'actor',ownerId})}};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}finally{db.close()}if(changed)invalidateAccountViews(ownerId)}
async function write(store:string,value:{key:string;ownerId:string;requestId?:string;[name:string]:unknown},allowReplace=false){const db=await open();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction([store,'identity'],'readwrite');let reason='LOCAL_STORAGE_UNAVAILABLE';const identity=tx.objectStore('identity').get('actor');identity.onsuccess=()=>{if(identity.result?.ownerId!==value.ownerId){reason='CACHE_ACCOUNT_CHANGED';tx.abort();return}const target=tx.objectStore(store);if(store==='drafts'||store==='recoveries'||store==='adoptions'){const old=target.get(value.key);old.onsuccess=()=>{if(old.result&&(store==='drafts'||old.result.requestId)&&old.result.requestId!==value.requestId&&!allowReplace){reason='PENDING_DRAFT';tx.abort();return}if(store==='recoveries'&&old.result?.requestId&&JSON.stringify(old.result.value.pending)!==JSON.stringify((value.value as WorkspaceRecovery).pending)||store==='adoptions'&&old.result&&JSON.stringify(old.result.value)!==JSON.stringify(value.value)){reason='PENDING_DRAFT';tx.abort();return}target.put(value)}}else target.put(value)};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(new Error(reason));tx.onabort=()=>reject(new Error(reason))})}finally{db.close()}}
async function read<T>(store:string,key:string,ownerId:string):Promise<T|null>{const db=await open();try{return await new Promise((resolve,reject)=>{const tx=db.transaction([store,'identity']),identity=tx.objectStore('identity').get('actor');identity.onsuccess=()=>{if(identity.result?.ownerId!==ownerId){resolve(null);return}const r=tx.objectStore(store).get(key);r.onsuccess=()=>resolve(r.result??null);r.onerror=()=>reject(r.error)};identity.onerror=()=>reject(identity.error)})}finally{db.close()}}
export async function saveLocalSnapshot(ownerId:string,snapshot:TripSnapshot){await write('snapshots',{key:ownerId+':'+snapshot.id,ownerId,snapshot})}
export async function readLocalSnapshot(ownerId:string,tripId:string){const value=await read<{ownerId:string;snapshot:TripSnapshot}>('snapshots',ownerId+':'+tripId,ownerId);return value?.ownerId===ownerId?value.snapshot:null}
export async function saveLocalDraft(ownerId:string,tripId:string,baseRevision:number,command:TripCommand,requestId:string,allowReplace=false){await write('drafts',{key:ownerId+':'+tripId,ownerId,tripId,baseRevision,command,requestId},allowReplace)}
export async function readLocalDraft(ownerId:string,tripId:string){const value=await read<Draft>('drafts',ownerId+':'+tripId,ownerId);return value?.ownerId===ownerId?value:null}
export async function clearLocalDraft(ownerId:string,tripId:string,requestId:string){const db=await open();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('drafts','readwrite'),store=tx.objectStore('drafts'),key=ownerId+':'+tripId,r=store.get(key);r.onsuccess=()=>{if(r.result?.requestId===requestId)store.delete(key)};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})}finally{db.close()}}
export async function clearAccountCaches(){const db=await open();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['snapshots','drafts','recoveries','identity'],'readwrite');for(const name of ['snapshots','drafts','recoveries','identity'])tx.objectStore(name).clear();tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})}finally{db.close()}}

export type CreationInput={title:string;timezone:string;startDate:string|null};
export type PendingCreation={requestId:string;guideId:string|null;version:number|null;flowId:string|null;tripId:string|null;inputHash?:string};
const opaqueId=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function creationIntent(value:PendingCreation):PendingCreation{
 if(!value||Object.keys(value).some(key=>!['requestId','guideId','version','flowId','tripId','inputHash'].includes(key))||!opaqueId.test(value.requestId)||[value.guideId,value.flowId,value.tripId].some(id=>id!==null&&(typeof id!=='string'||!opaqueId.test(id)))||(value.guideId!==null?(!Number.isSafeInteger(value.version)||(value.version??0)<1||!value.flowId):value.version!==null)||value.inputHash!==undefined&&(typeof value.inputHash!=='string'||!/^[a-f0-9]{64}$/.test(value.inputHash)))throw Error('INVALID_CREATION');
 return{requestId:value.requestId,guideId:value.guideId,version:value.version,flowId:value.flowId,tripId:value.tripId,...value.inputHash?{inputHash:value.inputHash}:{}};
}
function creationInput(value:CreationInput):CreationInput{
 if(!value||Object.keys(value).length!==3||typeof value.title!=='string'||!value.title.trim()||value.title.length>200||typeof value.timezone!=='string'||!value.timezone||value.timezone.length>100||value.startDate!==null&&(typeof value.startDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value.startDate)))throw Error('INVALID_CREATION');
 try{new Intl.DateTimeFormat('en',{timeZone:value.timezone})}catch{throw Error('INVALID_CREATION')}
 return{title:value.title,timezone:value.timezone,startDate:value.startDate};
}
async function creationInputHash(value:CreationInput){
 const bytes=new TextEncoder().encode(JSON.stringify(creationInput(value)));
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');
}
function creationKey(ownerId:string,guideId:string|null){if(guideId!==null&&!opaqueId.test(guideId))throw Error('INVALID_CREATION');return ownerId+':'+(guideId??'manual')}
async function creationTransaction<T>(ownerId:string,work:(tx:IDBTransaction,done:(value:T)=>void,fail:(reason:string)=>void)=>void):Promise<T>{
 const db=await open();
 try{return await new Promise<T>((resolve,reject)=>{
  const tx=db.transaction(['creations','recoveries','identity'],'readwrite');let result:T,reason='LOCAL_STORAGE_UNAVAILABLE';
  const fail=(message:string)=>{reason=message;tx.abort()},identity=tx.objectStore('identity').get('actor');
  identity.onsuccess=()=>{if(identity.result?.ownerId!==ownerId){fail('CACHE_ACCOUNT_CHANGED');return}try{work(tx,value=>{result=value},fail)}catch{fail('INVALID_CREATION')}};
  tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(Error(reason));tx.onabort=()=>reject(Error(reason));
 })}finally{db.close()}
}
export async function savePendingCreation(ownerId:string,intent:PendingCreation,input:CreationInput){
 const payload=creationInput(input),inputHash=await creationInputHash(payload),checked=creationIntent(intent);
 if(checked.inputHash&&checked.inputHash!==inputHash)throw Error('ORIGINAL_INPUT_MISMATCH');
 const value={...checked,inputHash},key=creationKey(ownerId,value.guideId);
 await creationTransaction<void>(ownerId,(tx,done,fail)=>{
  const store=tx.objectStore('creations'),old=store.get(key);
  old.onsuccess=()=>{
   if(old.result&&JSON.stringify(old.result.value)!==JSON.stringify(value)){fail('PENDING_DRAFT');return}
   const recovery=tx.objectStore('recoveries'),privateKey=ownerId+':trip-create:'+value.requestId,prior=recovery.get(privateKey);
   prior.onsuccess=()=>{
    if(old.result&&!prior.result||prior.result&&JSON.stringify(prior.result.creationInput)!==JSON.stringify(payload)){fail('PENDING_DRAFT');return}
    store.put({key,ownerId,value});recovery.put({key:privateKey,ownerId,creationInput:payload});done();
   };
  };
 });
}
export async function restoreOriginalCreation(ownerId:string,guideId:string|null,requestId:string,input:CreationInput):Promise<CreationInput>{
 const payload=creationInput(input),inputHash=await creationInputHash(payload);
 return creationTransaction(ownerId,(tx,done,fail)=>{
  const row=tx.objectStore('creations').get(creationKey(ownerId,guideId));
  row.onsuccess=()=>{
   if(row.result?.value.requestId!==requestId||row.result.value.tripId){fail('PENDING_DRAFT');return}
   if(creationIntent(row.result.value).inputHash!==inputHash){fail('ORIGINAL_INPUT_MISMATCH');return}
   const store=tx.objectStore('recoveries'),key=ownerId+':trip-create:'+requestId,previous=store.get(key);
   previous.onsuccess=()=>{
    if(previous.result&&JSON.stringify(previous.result.creationInput)!==JSON.stringify(payload)){fail('PENDING_DRAFT');return}
    store.put({key,ownerId,creationInput:payload});done(payload);
   };
  };
 });
}
export async function readPendingCreation(ownerId:string,guideId:string|null):Promise<{intent:PendingCreation;input:CreationInput|null}|null>{
 try{return await creationTransaction(ownerId,(tx,done,fail)=>{
  const row=tx.objectStore('creations').get(creationKey(ownerId,guideId));
  row.onsuccess=()=>{if(!row.result){done(null);return}
   try{const intent=creationIntent(row.result.value),payload=tx.objectStore('recoveries').get(ownerId+':trip-create:'+intent.requestId);
    payload.onsuccess=()=>{try{done({intent,input:payload.result?creationInput(payload.result.creationInput):null})}catch{fail('INVALID_CREATION')}};
   }catch{fail('INVALID_CREATION')}
  };
 })}catch(error){if(error instanceof Error&&error.message==='CACHE_ACCOUNT_CHANGED')return null;throw error}
}
export async function recordCreatedTrip(ownerId:string,guideId:string|null,requestId:string,tripId:string){
 if(!opaqueId.test(tripId))throw Error('INVALID_CREATION');
 await creationTransaction<void>(ownerId,(tx,done,fail)=>{
  const store=tx.objectStore('creations'),key=creationKey(ownerId,guideId),row=store.get(key);
  row.onsuccess=()=>{if(row.result?.value.requestId!==requestId||row.result.value.tripId&&row.result.value.tripId!==tripId){fail('PENDING_DRAFT');return}
   store.put({...row.result,value:{...creationIntent(row.result.value),tripId}});tx.objectStore('recoveries').delete(ownerId+':trip-create:'+requestId);done();
  };
 });
}
// Only the first POST's definite rejection may release an unconfirmed creation.
// Unknown/recovered requests must retain their original payload and requestId.
export async function clearRejectedCreation(ownerId:string,guideId:string|null,requestId:string,input:CreationInput){
 const inputHash=await creationInputHash(input);
 await creationTransaction<void>(ownerId,(tx,done,fail)=>{
  const store=tx.objectStore('creations'),key=creationKey(ownerId,guideId),row=store.get(key);
  row.onsuccess=()=>{
   if(row.result?.value.requestId!==requestId||row.result.value.tripId||creationIntent(row.result.value).inputHash!==inputHash){fail('PENDING_DRAFT');return}
   store.delete(key);tx.objectStore('recoveries').delete(ownerId+':trip-create:'+requestId);done();
  };
 });
}
export async function clearPendingCreation(ownerId:string,guideId:string|null,requestId:string){
 await creationTransaction<void>(ownerId,(tx,done,fail)=>{
  const store=tx.objectStore('creations'),key=creationKey(ownerId,guideId),row=store.get(key);
  row.onsuccess=()=>{if(row.result?.value.requestId===requestId){if(!row.result.value.tripId){fail('PENDING_DRAFT');return}store.delete(key);tx.objectStore('recoveries').delete(ownerId+':trip-create:'+requestId)}done()};
 });
}

// Opaque unresolved receipts survive logout. Private drafts/snapshots still clear as before.
// Reads and writes require the current local account; a receipt never contains authored text or notes.
export type PendingAdoption={guideId:string;tripId:string;version:number;revision:number;requestId:string;flowId:string};
function validatedAdoption(value:PendingAdoption):PendingAdoption{
 const ids=['guideId','tripId','requestId','flowId'] as const;
 if(!value||Object.keys(value).length!==6||ids.some(key=>typeof value[key]!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value[key]))||!Number.isSafeInteger(value.version)||value.version<1||!Number.isSafeInteger(value.revision)||value.revision<1)throw Error('INVALID_ADOPTION');
 return{guideId:value.guideId,tripId:value.tripId,version:value.version,revision:value.revision,requestId:value.requestId,flowId:value.flowId};
}
export async function savePendingAdoption(ownerId:string,intent:PendingAdoption){
 const value=validatedAdoption(intent);
 await write('adoptions',{key:ownerId+':'+value.guideId,ownerId,requestId:value.requestId,value});
}
export async function readPendingAdoption(ownerId:string,guideId:string):Promise<PendingAdoption|null>{
 const row=await read<{ownerId:string;value:PendingAdoption}>('adoptions',ownerId+':'+guideId,ownerId);
 return row?.ownerId===ownerId?validatedAdoption(row.value):null;
}
export async function readPendingAdoptions(ownerId:string):Promise<PendingAdoption[]>{
 const db=await open();
 try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction(['adoptions','identity']),identity=tx.objectStore('identity').get('actor');
  identity.onsuccess=()=>{
   if(identity.result?.ownerId!==ownerId){resolve([]);return;}
   const rows=tx.objectStore('adoptions').getAll();
   rows.onsuccess=()=>{try{resolve(rows.result.filter(row=>row.ownerId===ownerId).map(row=>validatedAdoption(row.value)))}catch{reject(Error('INVALID_ADOPTION'))}};
   rows.onerror=()=>reject(rows.error);
  };
  identity.onerror=()=>reject(identity.error);
 });}finally{db.close();}
}
export async function clearPendingAdoption(ownerId:string,guideId:string,requestId:string){
 const db=await open();
 try{await new Promise<void>((resolve,reject)=>{
  const tx=db.transaction(['adoptions','identity'],'readwrite'),store=tx.objectStore('adoptions'),key=ownerId+':'+guideId;
  let reason='LOCAL_STORAGE_UNAVAILABLE';
  const identity=tx.objectStore('identity').get('actor');
  identity.onsuccess=()=>{if(identity.result?.ownerId!==ownerId){reason='CACHE_ACCOUNT_CHANGED';tx.abort();return;}
   const row=store.get(key);row.onsuccess=()=>{if(row.result?.requestId===requestId)store.delete(key);};
  };
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(Error(reason));tx.onabort=()=>reject(Error(reason));
 });}finally{db.close();}
}

export type WorkspaceRecovery={version:1;draft:unknown;pending:{command:unknown;requestId?:string;id?:string}|null};
// eslint-disable-next-line no-control-regex -- Reject control characters in recovery keys.
function recoveryScope(scope:string){if(typeof scope!=='string'||scope.length>200||!scope.length||/[\u0000-\u001f]/.test(scope))throw Error('INVALID_RECOVERY_SCOPE');return scope;}
function validatedRecovery(value:WorkspaceRecovery){
 const copy=JSON.parse(JSON.stringify(value)) as WorkspaceRecovery;
 if(copy.version!==1||new TextEncoder().encode(JSON.stringify(copy)).byteLength>80000||copy.pending&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(copy.pending.requestId??copy.pending.id??''))throw Error('INVALID_RECOVERY');
 return copy;
}
export async function saveLocalWorkspaceRecovery(ownerId:string,scope:string,value:WorkspaceRecovery){
 const copy=validatedRecovery(value);
 await write('recoveries',{key:ownerId+':'+recoveryScope(scope),ownerId,value:copy,requestId:copy.pending?.requestId??copy.pending?.id});
}
export async function readLocalWorkspaceRecovery(ownerId:string,scope:string):Promise<WorkspaceRecovery|null>{
 const row=await read<{ownerId:string;value:WorkspaceRecovery}>('recoveries',ownerId+':'+recoveryScope(scope),ownerId);
 if(row?.ownerId!==ownerId||row.value?.version!==1)return null;return row.value;
}
export async function clearLocalWorkspaceRecovery(ownerId:string,scope:string,requestId?:string){
 const db=await open();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['recoveries','identity'],'readwrite'),store=tx.objectStore('recoveries'),key=ownerId+':'+recoveryScope(scope),identity=tx.objectStore('identity').get('actor');identity.onsuccess=()=>{if(identity.result?.ownerId!==ownerId){tx.abort();return;}const row=store.get(key);row.onsuccess=()=>{if(row.result&&(!row.result.requestId||row.result.requestId===requestId))store.delete(key);};};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(Error('LOCAL_STORAGE_UNAVAILABLE'));tx.onabort=()=>reject(Error('CACHE_ACCOUNT_CHANGED'));});}finally{db.close();}
}

/** A definite failed command releases its receipt identity without deleting the unsent draft. */
export async function releaseLocalWorkspaceRecovery(ownerId:string,scope:string,requestId:string){
 const db=await open();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['recoveries','identity'],'readwrite'),store=tx.objectStore('recoveries'),key=ownerId+':'+recoveryScope(scope),identity=tx.objectStore('identity').get('actor');identity.onsuccess=()=>{if(identity.result?.ownerId!==ownerId){tx.abort();return;}const row=store.get(key);row.onsuccess=()=>{if(row.result?.requestId===requestId)store.put({...row.result,requestId:undefined,value:{...row.result.value,pending:null}});};};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(Error('LOCAL_STORAGE_UNAVAILABLE'));tx.onabort=()=>reject(Error('CACHE_ACCOUNT_CHANGED'));});}finally{db.close();}
}

/** Commit selective draft completion and receipt release in one actor-bound transaction. */
export async function completeLocalWorkspaceRecovery(ownerId:string,scope:string,requestId:string,draft:unknown){
 const value=validatedRecovery({version:1,draft,pending:null}),key=ownerId+':'+recoveryScope(scope),db=await open();
 try{await new Promise<void>((resolve,reject)=>{
  const tx=db.transaction(['recoveries','identity'],'readwrite'),store=tx.objectStore('recoveries');let reason='LOCAL_STORAGE_UNAVAILABLE';
  const identity=tx.objectStore('identity').get('actor');
  identity.onsuccess=()=>{
   if(identity.result?.ownerId!==ownerId){reason='CACHE_ACCOUNT_CHANGED';tx.abort();return;}
   const row=store.get(key);row.onsuccess=()=>{
    if(row.result?.requestId!==requestId){reason='PENDING_DRAFT';tx.abort();return;}
    store.put({key,ownerId,value});
   };
  };
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(Error(reason));tx.onabort=()=>reject(Error(reason));
 });}finally{db.close();}
}
