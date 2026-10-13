import{readFileSync}from'node:fs';
import path from'node:path';
import{pathToFileURL}from'node:url';
import{createHash}from'node:crypto';
export const firstUsableTasks=['merchantInvitation','merchantBrief','merchantReview'];
const revision=value=>typeof value==='string'&&/^[0-9a-f]{40}$/.test(value);
const hash=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
const median=values=>{const sorted=[...values].sort((a,b)=>a-b),i=Math.floor(sorted.length/2);return sorted.length%2?sorted[i]:(sorted[i-1]+sorted[i])/2;};
export function summarizeFirstUsable(samples,context={}){
 const blockers=[],rows=Array.isArray(samples)?samples:[];
 if(!revision(context.sourceSha)||!revision(context.sourceTree)||!hash(context.conditionsHash))blockers.push('SOURCE_OR_CONDITIONS_UNBOUND');
 if(context.cleanup!=='PASS_OWNED_SYNTHETIC_ACTORS_REMOVED')blockers.push('OWNED_CLEANUP_NOT_PASS');
 if(rows.length!==18)blockers.push('EIGHTEEN_INPUT_SLOTS_REQUIRED');
 const seen=new Set();
 for(const row of rows){
  if(!row||!firstUsableTasks.includes(row.task)||!['cold','warm'].includes(row.cache)||![1,2,3].includes(row.run)){blockers.push('UNKNOWN_INPUT_SLOT');continue;}
  const key=[row.task,row.cache,row.run].join(':');if(seen.has(key))blockers.push('DUPLICATE_INPUT_SLOT');seen.add(key);
  if(row.status!=='PASS'||row.authorized!==true||row.retained!==true||typeof row.acceptedInputMs!=='number'||!Number.isFinite(row.acceptedInputMs)||row.acceptedInputMs<0)blockers.push('UNVERIFIED_ACCEPTED_INPUT');
 }
 const groups=firstUsableTasks.flatMap(task=>['cold','warm'].map(cache=>{const group=rows.filter(x=>x?.task===task&&x.cache===cache),values=group.filter(x=>typeof x.acceptedInputMs==='number'&&Number.isFinite(x.acceptedInputMs)&&x.acceptedInputMs>=0).map(x=>x.acceptedInputMs);return{task,cache,samples:group.length,medianAcceptedInputMs:values.length===3?median(values):null};}));
 if(groups.some(x=>x.samples!==3))blockers.push('INCOMPLETE_TASK_CACHE_GROUPS');
 return{schemaVersion:1,sourceSha:context.sourceSha??null,sourceTree:context.sourceTree??null,conditionsHash:context.conditionsHash??null,cleanup:context.cleanup??null,samples:rows,groups,status:blockers.length?'INCOMPLETE':'PASS',blockers:[...new Set(blockers)]};
}

/** Browser-only diagnostic; no product state, requests or command submission. */
export function installFirstUsableObserver({task,companyId,token,label,text}){
 globalThis.__kinnsoFirstUsable?.dispose();
 let authorized=false,invalid=false,stopped=false,field=null,expectedValue=null,acceptedInputMs=null,inputEvents=0,retainedSnapshot=null;
 const pathname=location.pathname;
 const scope=()=>{const q=new URL(location.href).searchParams;return location.pathname===pathname&&q.getAll('company').length===1&&q.get('company')===companyId;};
 const find=()=>{const all=[...document.querySelectorAll('input,textarea')].filter(el=>(el.getAttribute('aria-label')??[...(el.labels??[])].map(l=>l.textContent.trim()).join(' '))===label);return all.length===1?all[0]:null;};
 const enabled=el=>el?.isConnected&&!el.matches(':disabled')&&!el.readOnly;
 const live=()=>{if(!scope())invalid=true;return !stopped&&!invalid&&authorized&&scope();};
 const input=event=>{if(stopped||event.target!==field)return;inputEvents++;if(inputEvents===1&&event.isTrusted&&event.inputType==='insertText'&&event.data===text&&live()&&enabled(field)){acceptedInputMs=performance.now()-(performance.getEntriesByType('navigation')[0]?.startTime??0);expectedValue=field.value;}};
 const leave=()=>{invalid=true;authorized=false;};
 document.addEventListener('input',input,true);addEventListener('pagehide',leave);
 const stop=()=>{if(retainedSnapshot)return retainedSnapshot;const authority=live(),retained=authority&&enabled(field)&&document.activeElement===field&&field.value===expectedValue&&inputEvents===1&&Number.isFinite(acceptedInputMs)&&acceptedInputMs!==null;stopped=true;document.removeEventListener('input',input,true);removeEventListener('pagehide',leave);retainedSnapshot=Object.freeze({task,acceptedInputMs,retained,authorized:authority,inputEvents,status:retained?'PASS':'FAIL'});return retainedSnapshot;};
 globalThis.__kinnsoFirstUsable={token,documentTimeOrigin:performance.timeOrigin,authorize:own=>{if(own===token&&!invalid&&!stopped&&scope())authorized=true;else if(own===token&&!scope())leave();},invalidate:own=>{if(own===token)leave();},candidateEnabled:()=>live()&&enabled(find()),begin:()=>{const candidate=find();if(!live()||!enabled(candidate))return false;field=candidate;expectedValue=field.value+text;field.focus();return document.activeElement===field;},stop,dispose:stop};
}

/** One independent page, one keyboard insertion, no submit/retry/backfill. */
export async function measureFirstUsable(page,{task,cache,run,origin,route,companyId,actorId,campaignId}){
 const labels={merchantInvitation:'Recipient email',merchantBrief:'Brief title',merchantReview:'Deliverable review feedback'};
 const local=new URL(origin);if(local.protocol!=='http:'||local.hostname!=='127.0.0.1'||!local.port||!firstUsableTasks.includes(task))throw Error('Owned loopback task required');
 const token=globalThis.crypto.randomUUID(),text=task==='merchantInvitation'?'synthetic-first-usable@example.test':'Synthetic first usable input';
 let actor=false,membership=false,workspace=false,failed=false,ended=false;const related=new Set(),required=['/api/merchant/profile','/api/merchant/invitations','/api/merchant/campaigns'];
 const publish=async()=>{if(ended)return;await page.evaluate(({token,allowed,complete,failed})=>{const o=globalThis.__kinnsoFirstUsable;if(o?.token!==token)return;if(failed)o.invalidate(token);else if(allowed)o.authorize(token);o.relatedReadsComplete||=complete;o.readFailure||=failed;},{token,allowed:actor&&membership&&workspace,complete:required.every(x=>related.has(x)),failed});};
 const response=async r=>{try{const u=new URL(r.url());if(ended||u.origin!==origin||r.request().method()!=='GET'||!['/api/merchant',...required].includes(u.pathname))return;
  if(u.pathname!=='/api/merchant'||u.searchParams.has('id')){if(u.searchParams.getAll('id').length!==1||u.searchParams.get('id')!==companyId)return;}
  const body=await r.json();if(ended)return;if(r.status()!==200||body.ok!==true){failed=true;await publish();return;}
  if(u.pathname==='/api/merchant'){if(u.searchParams.has('id')){workspace=body.data?.merchantId===companyId&&body.data?.role==='owner';if(!workspace)failed=true;}else{membership=Array.isArray(body.data)&&body.data.some(x=>x.merchantId===companyId&&x.role==='owner');if(!membership)failed=true;}}
  else{if(task==='merchantReview'&&u.pathname==='/api/merchant/campaigns'&&(body.data?.detail?.id!==campaignId||body.data?.detail?.submissions?.length!==1))failed=true;related.add(u.pathname);}
  await publish();
 }catch{if(!ended){failed=true;await publish().catch(()=>{});}}};
 await page.evaluateOnNewDocument(installFirstUsableObserver,{task,companyId,token,label:labels[task],text});page.on('response',response);
 const fallback={task,cache,run,acceptedInputMs:null,retained:false,authorized:false,inputEvents:0,status:'FAIL'};
 try{
  await page.goto(origin+route,{waitUntil:'domcontentloaded'});
  const session=await page.evaluate(async()=>{const r=await fetch('/api/session',{cache:'no-store'});const body=await r.json();return{status:r.status,id:body.data?.id,ok:body.ok};});
  actor=session.status===200&&session.ok===true&&session.id===actorId;if(!actor)failed=true;await publish();
  await page.waitForFunction(()=>globalThis.__kinnsoFirstUsable?.readFailure||globalThis.__kinnsoFirstUsable?.candidateEnabled());
  if(failed)return{...fallback,reason:'FRESH_AUTHORIZATION_OR_READ_REJECTED'};
  const focused=await page.evaluate(()=>globalThis.__kinnsoFirstUsable.begin());
  if(!focused)return{...fallback,reason:'FIELD_DISABLED_OR_SCOPE_CHANGED_BEFORE_INPUT'};
  await page.keyboard.insertText(text);
  await page.waitForFunction(()=>globalThis.__kinnsoFirstUsable?.readFailure||globalThis.__kinnsoFirstUsable?.relatedReadsComplete);
  const result=await page.evaluate(()=>globalThis.__kinnsoFirstUsable.stop());return{...result,task,cache,run,...failed?{status:'FAIL',reason:'RELATED_READ_REJECTED'}:{}};
 }catch{return{...fallback,reason:'FIRST_USABLE_COLLECTION_FAILED'};}
 finally{ended=true;page.off('response',response);await page.evaluate(()=>globalThis.__kinnsoFirstUsable?.dispose()).catch(()=>{});}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const[reportPath,expectedSource]=process.argv.slice(2);if(!reportPath||!/^[0-9a-f]{40}$/.test(expectedSource??''))throw Error('Explicit report and source required');
  const report=JSON.parse(readFileSync(reportPath,'utf8')),sidecar=JSON.parse(readFileSync(path.join(path.dirname(reportPath),'first-usable.json'),'utf8'));
  const conditionsHash=createHash('sha256').update(JSON.stringify(report.conditions)).digest('hex');
  if(report.kind!=='operations'||sidecar.schemaVersion!==1||report.sourceSha!==expectedSource||sidecar.sourceSha!==expectedSource||sidecar.sourceTree!==report.sourceTree||sidecar.conditionsHash!==conditionsHash||sidecar.cleanup!==report.cleanup)throw Error('Sidecar/source/conditions/cleanup binding rejected');
  const checked=summarizeFirstUsable(sidecar.samples,sidecar);if(checked.status!=='PASS')throw Error('Eighteen authorized retained inputs and owned cleanup required');
  console.log(JSON.stringify({status:'PASS',sourceSha:expectedSource,sourceTree:sidecar.sourceTree,samples:18,groups:checked.groups,scope:'Independent owned local input measurement; not hosted or field INP'}));
 }catch{console.error('First-usable gate rejected: incomplete or unbound evidence');process.exitCode=1;}
}
