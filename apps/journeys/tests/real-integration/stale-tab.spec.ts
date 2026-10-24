import {test,expect,type Browser,type BrowserContext,type Page} from '@playwright/test';
import {createHash,randomUUID} from 'node:crypto';
import {openFixture} from './fixture.mjs';
import {expected} from './target.mjs';

let fixture:any;
test.describe.configure({mode:'serial'});
test.beforeAll(async()=>{fixture=await openFixture()});
test.afterAll(async()=>{fixture?.write()});

async function signIn(page:Page,actor:any,locale:string,next:string){
 await page.goto(expected.appOrigin+'/'+locale+'/sign-in?next='+encodeURIComponent(next));
 await page.getByLabel(locale==='en'?'Email':'電郵',{exact:true}).fill(actor.email);
 const binding='credential_'+randomUUID().replaceAll('-','');let available=true;
 await page.exposeBinding(binding,({frame})=>{
  const url=new URL(frame.url());
  if(!available||url.origin!==expected.appOrigin||url.pathname!==`/${locale}/sign-in`)throw Error('CREDENTIAL_BINDING_CLOSED');
  available=false;return actor.credential;
 });
 await page.evaluate(async name=>{
  const input=document.querySelector('input[type="password"]') as HTMLInputElement|null;
  if(!input)throw Error('SIGN_IN_CONTROL_MISSING');
  const read=(window as unknown as Record<string,()=>Promise<string>>)[name];
  input.value=await read();input.dispatchEvent(new Event('input',{bubbles:true}));
 },binding);
 await page.getByRole('button',{name:locale==='en'?'Sign in':'登入',exact:true}).click();
 await page.waitForURL(expected.appOrigin+next);
}
async function contextFor(browser:Browser,viewport:{width:number;height:number}){
 const context=await browser.newContext({baseURL:expected.appOrigin,viewport,serviceWorkers:'block'});
 await context.route('**/*',route=>{
  const origin=new URL(route.request().url()).origin;
  return [expected.appOrigin,expected.apiOrigin].includes(origin)?route.continue():route.abort('blockedbyclient');
 });
 return context;
}
async function storedDraft(page:Page,tripId:string){
 return page.evaluate(id=>new Promise<Record<string,unknown>|null>((resolve,reject)=>{
  const request=indexedDB.open('kinnso_account_cache_v1');
  request.onsuccess=()=>{
   const db=request.result,rows=db.transaction('drafts').objectStore('drafts').getAll();
   rows.onsuccess=()=>{resolve(rows.result.find(row=>row.tripId===id)??null);db.close()};
   rows.onerror=()=>reject(rows.error);
  };
  request.onerror=()=>reject(request.error);
 }),tripId);
}

for(const locale of ['en','zh-HK'])for(const [size,viewport] of Object.entries({
 desktop:{width:1280,height:900},mobile:{width:390,height:844},
})){
 test(`real isolated target STALE_TAB_4 ${locale}/${size}`,async({browser})=>{
  test.setTimeout(90000);
  const text=(en:string,zh:string)=>locale==='en'?en:zh;
  const created=await fixture.create(fixture.actors.A,{
   title:'Synthetic stale-tab '+locale+' '+size,timezone:'UTC',startDate:null,
  });
  const tripId=created.value.id,dayId=randomUUID(),stopId=randomUUID();
  let requestId=randomUUID();fixture.registerRequest('A',requestId,'edit');
  let snapshot=await fixture.rpc(fixture.actors.A,'apply_trip_command',{
   p_trip_id:tripId,p_expected_revision:created.value.revision,p_request_id:requestId,
   p_command:{type:'addDay',id:dayId,offset:0,title:'Synthetic stale day'},
  });
  requestId=randomUUID();fixture.registerRequest('A',requestId,'edit');
  snapshot=await fixture.rpc(fixture.actors.A,'apply_trip_command',{
   p_trip_id:tripId,p_expected_revision:snapshot.revision,p_request_id:requestId,
   p_command:{type:'addStop',id:stopId,dayId,position:0,input:{
    title:'Synthetic stale stop',placeId:null,travellerNote:'',startMinuteOfDay:600,durationMinutes:30,
   }},
  });

  let context:BrowserContext|undefined;
  try{
   context=await contextFor(browser,viewport);
   const current=await context.newPage();
   await signIn(current,fixture.actors.A,locale,`/${locale}/trips/${tripId}`);
   const stale=await context.newPage();
   await stale.goto(`/${locale}/trips/${tripId}`);
   const currentNote=current.getByRole('textbox',{name:text('Private note','私人筆記'),exact:true});
   const staleNote=stale.getByRole('textbox',{name:text('Private note','私人筆記'),exact:true});
   await expect(currentNote).toHaveValue('');
   await expect(staleNote).toHaveValue('');
   await expect(stale.getByText(text('Revision','版本')+' '+snapshot.revision,{exact:false})).toBeVisible();

   const newer='Synthetic newer tab '+fixture.runId;
   const local='Synthetic retained stale input '+fixture.runId;
   await currentNote.fill(newer);
   await current.getByRole('button',{name:text('Save stop','保存站點'),exact:true}).click();
   await expect(current.getByTestId('trip-save-state')).toContainText(text('Saved to your account','已保存至你的帳戶'));
   await staleNote.fill(local);
   const commands:any[]=[];
   stale.on('request',request=>{
    if(request.method()==='POST'&&new URL(request.url()).pathname===`/api/trips/${tripId}/commands`)
     commands.push({body:request.postDataJSON(),actor:request.headers()['x-kinnso-intent-actor']});
   });
   await stale.getByRole('button',{name:text('Save stop','保存站點'),exact:true}).click();
   await expect(stale.getByTestId('trip-save-state')).toContainText(text('Conflict','版本衝突'));
   await expect(staleNote).toHaveValue(local);
   expect(commands).toHaveLength(1);
   expect(commands[0].actor).toBe(fixture.actors.A.id);
   fixture.registerRequest('A',commands[0].body.requestId,'edit');
   const saved=await fixture.snapshot(fixture.actors.A,tripId);
   expect(saved.days[0].stops[0].travellerNote).toBe(newer);
   expect(saved.revision).toBe(snapshot.revision+1);
   const originalDraft=await storedDraft(stale,tripId);
   expect(originalDraft?.requestId).toBe(commands[0].body.requestId);
   expect(originalDraft?.baseRevision).toBe(commands[0].body.expectedRevision);
   expect(originalDraft?.command).toEqual(commands[0].body.command);
   expect(commands[0].body.expectedRevision).toBe(snapshot.revision);
   expect(commands[0].body.command.patch.travellerNote).toBe(local);
   expect(commands[0].body).not.toHaveProperty('allowReplace');
   await fixture.screenshot(stale,'stale-tab-conflict-'+locale.toLowerCase()+'-'+size);

   const loaded=stale.waitForResponse(response=>new URL(response.url()).pathname===`/api/trips/${tripId}`&&
    response.request().method()==='GET'&&response.status()===200);
   await stale.getByRole('button',{name:text('Load current version','載入目前版本'),exact:true}).click();
   await loaded;
   expect(commands).toHaveLength(1);
   await expect(staleNote).toHaveValue(local);
   expect(await storedDraft(stale,tripId)).toEqual(originalDraft);
   expect(await fixture.snapshot(fixture.actors.A,tripId)).toEqual(saved);

   const retryConflict=stale.waitForResponse(response=>new URL(response.url()).pathname===`/api/trips/${tripId}/commands`&&
    response.request().method()==='POST'&&response.status()===409);
   await stale.getByRole('button',{name:text('Retry local draft with revision check','以版本檢查重試本機草稿'),exact:true}).click();
   await retryConflict;
   expect(commands).toHaveLength(2);
   expect(commands[1]).toEqual(commands[0]);
   expect(await storedDraft(stale,tripId)).toEqual(originalDraft);
   expect(await fixture.snapshot(fixture.actors.A,tripId)).toEqual(saved);
   await expect(staleNote).toHaveValue(local);
   await fixture.screenshot(stale,'stale-tab-retry-'+locale.toLowerCase()+'-'+size);

   await expect(stale.getByTestId('conflict-recovery')).toBeVisible();
   const discard=stale.getByRole('button',{name:text('Discard local draft and use current version','捨棄本機草稿並使用目前版本'),exact:true});
   const retained=async()=>{
    expect(commands).toHaveLength(2);
    expect(await storedDraft(stale,tripId)).toEqual(originalDraft);
    await expect(staleNote).toHaveValue(local);
    await expect(discard).toBeEnabled();
   };
   const tripPath=`**/api/trips/${tripId}`;
   await stale.route(tripPath,route=>route.abort('failed'));
   try{
    await stale.getByRole('button',{name:text('Load current version','載入目前版本'),exact:true}).click();
    await expect(stale.getByTestId('trip-save-state')).toContainText(text('Connection failed','連線失敗'));
    await retained();
    await discard.click();
    await expect(stale.getByTestId('trip-save-state')).toContainText(text('The local draft is kept','本機草稿已保留'));
    await retained();
   }finally{await stale.unroute(tripPath)}
   await context.setOffline(true);
   try{
    await discard.click();
    await expect(stale.getByTestId('trip-save-state')).toContainText(text('The local draft is kept','本機草稿已保留'));
    await retained();
   }finally{await context.setOffline(false)}

   // Fail the real IndexedDB clear transaction, without faking an API response.
   await stale.evaluate(()=>{
    const native=IDBDatabase.prototype.transaction;
    (window as any).__restoreStaleTransaction=()=>{IDBDatabase.prototype.transaction=native};
    IDBDatabase.prototype.transaction=function(names:any,mode?:IDBTransactionMode,options?:IDBTransactionOptions){
     if(names==='drafts'&&mode==='readwrite')throw new DOMException('Synthetic storage failure','SecurityError');
     return native.call(this,names,mode,options);
    };
   });
   try{
    await discard.click();
    await expect(stale.getByTestId('trip-save-state')).toContainText(text('The local draft could not be discarded','未能捨棄本機草稿'));
    await retained();
   }finally{await stale.evaluate(()=>{(window as any).__restoreStaleTransaction();delete (window as any).__restoreStaleTransaction})}

   const other=await fixture.create(fixture.actors.A,{title:'Synthetic unrelated draft',timezone:'UTC',startDate:null});
   const otherDraft={...originalDraft,key:fixture.actors.A.id+':'+other.value.id,tripId:other.value.id,requestId:randomUUID()};
   await stale.evaluate(row=>new Promise<void>((resolve,reject)=>{
    const request=indexedDB.open('kinnso_account_cache_v1');
    request.onsuccess=()=>{
     const db=request.result,tx=db.transaction('drafts','readwrite');
     tx.objectStore('drafts').put(row);
     tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(tx.error)};
    };request.onerror=()=>reject(request.error);
   }),otherDraft);
   const deletedKeys=await stale.evaluate(()=>{
    const keys:string[]=[],native=IDBObjectStore.prototype.delete;
    (window as any).__staleDeletedKeys=keys;
    (window as any).__restoreStaleDelete=()=>{IDBObjectStore.prototype.delete=native};
    IDBObjectStore.prototype.delete=function(key:IDBValidKey|IDBKeyRange){
     if(this.name==='drafts')keys.push(String(key));
     return native.call(this,key);
    };
    return keys;
   });
   expect(deletedKeys).toEqual([]);
   await discard.click();
   await expect(stale.getByTestId('trip-save-state')).toContainText(text('Local draft discarded','本機草稿已捨棄'));
   await expect(staleNote).toHaveValue(newer);
   expect(commands).toHaveLength(2);
   expect(await fixture.snapshot(fixture.actors.A,tripId)).toEqual(saved);
   expect(await storedDraft(stale,tripId)).toBeNull();
   expect(await storedDraft(stale,other.value.id)).toEqual(otherDraft);
   expect(await stale.evaluate(()=>(window as any).__staleDeletedKeys)).toEqual([fixture.actors.A.id+':'+tripId]);
   await stale.evaluate(()=>{(window as any).__restoreStaleDelete();delete (window as any).__restoreStaleDelete;delete (window as any).__staleDeletedKeys});
   await fixture.screenshot(stale,'stale-tab-'+locale.toLowerCase()+'-'+size);

   // Verify replay and foreign-account denial through real RPC/RLS on this trip.
   const replay=await fixture.rpc(fixture.actors.A,'create_trip_v2',{p_request_id:created.id,p_payload:created.input});
   expect(replay.id).toBe(tripId);
   const foreignRead=await fixture.actors.B.client.rpc('get_trip_snapshot',{p_trip_id:tripId});
   expect(foreignRead.error).toBeTruthy();
   const foreignRequestId=randomUUID();fixture.registerRequest('B',foreignRequestId,'edit');
   const foreignWrite=await fixture.actors.B.client.rpc('apply_trip_command',{
    p_trip_id:tripId,p_expected_revision:saved.revision,p_request_id:foreignRequestId,
    p_command:commands[0].body.command,
   });
   expect(foreignWrite.error).toBeTruthy();
   expect(await fixture.snapshot(fixture.actors.A,tripId)).toEqual(saved);
   const foreignRows=await fixture.actors.B.client.from('trips').select('id').eq('id',tripId);
   expect(foreignRows.error).toBeNull();expect(foreignRows.data).toEqual([]);
   const foreignContext=await contextFor(browser,viewport);
   let foreignApiReadStatus:number|undefined,foreignApiWriteStatus:number|undefined;
   try{
    const foreignPage=await foreignContext.newPage();
    await signIn(foreignPage,fixture.actors.B,locale,`/${locale}/trips`);
    const read=await foreignPage.request.get(`/api/trips/${tripId}`);
    foreignApiReadStatus=read.status();expect(foreignApiReadStatus).toBe(404);
    const write=await foreignPage.request.post(`/api/trips/${tripId}/commands`,{
     headers:{Origin:expected.appOrigin,'x-kinnso-intent-actor':fixture.actors.B.id},
     data:{...commands[0].body,requestId:foreignRequestId,expectedRevision:saved.revision},
    });
    foreignApiWriteStatus=write.status();expect(foreignApiWriteStatus).toBe(404);
   }finally{await foreignContext.close()}
   expect(await fixture.snapshot(fixture.actors.A,tripId)).toEqual(saved);
   fixture.recordDiagnostic('STALE_TAB_CELL',{
    cell:locale+'/'+size,originalRevision:snapshot.revision,currentRevision:saved.revision,
    requestBodySha256:createHash('sha256').update(JSON.stringify(commands[0].body)).digest('hex'),
    retryBodySha256:createHash('sha256').update(JSON.stringify(commands[1].body)).digest('hex'),
    sameRequestIdentity:true,conflictStatus:409,zeroConflictWrites:true,discardPostCount:0,
    retainedOnReadFailure:true,retainedOffline:true,retainedOnClearFailure:true,
    exactDraftCleared:true,otherDraftRetained:true,creationReplaySameTrip:true,
    foreignReadDenied:true,foreignWriteDenied:true,foreignRlsRows:0,
    foreignApiReadStatus,foreignApiWriteStatus,
   });
  }catch(error){
   throw fixture.safeFailure('STALE_TAB_'+locale.replaceAll('-','_')+'_'+size,error);
  }finally{
   await context?.close();
  }
 });
}
