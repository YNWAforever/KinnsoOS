import {test} from 'node:test';
import assert from 'node:assert/strict';
import {workspaceHarness,tick} from './helpers/workspace-harness.mjs';

const company='11111111-1111-4111-8111-111111111111',campaign='22222222-2222-4222-8222-222222222222';
const a='33333333-3333-4333-8333-333333333333',b='44444444-4444-4444-8444-444444444444',branch='55555555-5555-4555-8555-555555555555';
const sa='66666666-6666-4666-8666-666666666666',sb='77777777-7777-4777-8777-777777777777';
const reviewId=(kind,other=false)=>kind==='reviewApplication'?(other?b:a):(other?sb:sa);
const stamp='2026-10-23T01:00:00.123456Z';
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
function directory(){
 const summary={id:campaign,title:'Owned collaboration',summary:'Authored original brief',status:'published',missionType:'coupon_affiliate',updatedAt:stamp};
 return {merchantId:company,role:'owner',items:[summary],nextCursor:null,summary:{draft:0,published:1,closed:0,applications:2,activeCreators:0,submitted:2,approved:0},branches:[{id:branch,name:'Original branch',active:true}],branchesNextCursor:null,
  detail:{...summary,couponCode:'OWNED',couponUrl:'https://example.test/offer',affiliateRate:0,kinnsoRate:0,creatorRate:0,requirements:['Original route'],deliverables:['Authored work'],milestones:[],applicationOpensAt:null,applicationClosesAt:null,scheduleTimeZone:'UTC',requiresApplication:true,canEdit:false,canClose:true,canReviewSubmissions:true,
   participants:[a,b].map((id,index)=>({id,creatorId:'creator-'+index,creatorName:'Creator '+(index?'B':'A'),creatorHandle:null,status:'applied',note:'Original application '+index,reviewNote:null,updatedAt:stamp})),participantsNextCursor:null,
   submissions:[sa,sb].map((id,index)=>({id,participantId:index?b:a,creatorId:'creator-'+index,creatorName:'Creator '+(index?'B':'A'),milestoneTitle:'Work '+(index?'B':'A'),status:'submitted',notes:'Authored evidence '+index,proofUrls:['https://example.test/evidence-'+index],feedback:null,submittedAt:stamp,reviewedAt:null,updatedAt:stamp})),submissionsNextCursor:null}};
}
function deviceJournal({failCompletionOnce=false}={}){
 let stored=null,fail=failCompletionOnce;
 const check=(actor,scope)=>{assert.equal(actor,'actor-A');assert.equal(scope,'merchant-campaign:'+company);};
 const finish=()=>{if(fail){fail=false;throw Error('LOCAL_STORAGE_UNAVAILABLE');}};
 return {ports:{read:async(actor,scope)=>{check(actor,scope);return clone(stored);},save:async(actor,scope,value)=>{check(actor,scope);stored=clone(value);},clear:async(actor,scope,requestId)=>{check(actor,scope);if(requestId)finish();stored=null;},release:async()=>{},complete:async(actor,scope,requestId,draft)=>{check(actor,scope);finish();assert.equal(stored?.pending?.requestId,requestId);stored={version:1,draft:clone(draft),pending:null};}},read:()=>clone(stored)};
}
function card(h,label){return h.elements().find(node=>node.type==='article'&&h.elements(node).some(child=>child.type==='h4'&&h.text(child).replace(/\s+/g,' ').trim()===label));}
function fieldIn(h,node,type){return h.elements(node).find(child=>child.type===type);}
async function settle(h){for(let i=0;i<8;i++){await tick();h.render();}}
function authorOtherWork(h,locale,kind){
 const t=(en,zh)=>locale==='zh-HK'?zh:en;
 const other=card(h,kind==='reviewApplication'?'Creator B':'Creator B · Work B');
 fieldIn(h,other,'textarea').props.onChange({target:{value:'B unsent review survives A'}});h.render();
 h.field(t('Brief title','簡報標題')).props.onChange({target:{value:'Another unsent brief'}});h.render();
 h.field(t('Updated branch name','更新分店名稱')).props.onChange({target:{value:'Unsent branch rename'}});h.render();
 h.field(t('Branch change reason','分店變更原因')).props.onChange({target:{value:'Unsent branch reason'}});h.render();
 const chosen=card(h,kind==='reviewApplication'?'Creator A':'Creator A · Work A');
 fieldIn(h,chosen,'textarea').props.onChange({target:{value:'A explicit approved review'}});h.render();
 return ()=>{const latest=card(h,kind==='reviewApplication'?'Creator A':'Creator A · Work A');return h.elements(latest).find(el=>el.type==='button'&&h.text(el)===t(kind==='reviewApplication'?'Approve application':'Approve deliverable',kind==='reviewApplication'?'批准申請':'批准作品'));};
}
function assertOtherWork(h,locale,kind){
 const t=(en,zh)=>locale==='zh-HK'?zh:en;
 assert.equal(fieldIn(h,card(h,kind==='reviewApplication'?'Creator B':'Creator B · Work B'),'textarea').props.value,'B unsent review survives A');
 assert.equal(h.field(t('Brief title','簡報標題')).props.value,'Another unsent brief');
 assert.equal(h.field(t('Updated branch name','更新分店名稱')).props.value,'Unsent branch rename');
 assert.equal(h.field(t('Branch change reason','分店變更原因')).props.value,'Unsent branch reason');
}
for(const locale of ['en','zh-HK'])for(const kind of ['reviewApplication','reviewSubmission'])test(`${kind} ${locale}: A receipt preserves B review, another brief and branch draft, including device restore`,async()=>{
 const data=directory(),journal=deviceJournal(),writes=[];
 const ports={workspaceRecovery:journal.ports,merchantCampaigns:{list:async()=>({ok:true,data:clone(data)}),command:async(...args)=>{writes.push(clone(args));const record=(kind==='reviewApplication'?data.detail.participants:data.detail.submissions).find(row=>row.id===reviewId(kind));record.status=kind==='reviewApplication'?'active':'approved';return{ok:true,data:{id:record.id,status:record.status}};}}};
 const h=await workspaceHarness('MerchantCampaigns',ports,{locale});const approve=authorOtherWork(h,locale,kind);approve().props.onClick();await settle(h);
 assert.equal(writes.length,1);assert.equal(writes[0][1].id,reviewId(kind));assertOtherWork(h,locale,kind);
 const saved=journal.read();assert.equal(saved.pending,null);assert.equal(saved.draft.feedback[reviewId(kind)],undefined);assert.equal(saved.draft.feedback[reviewId(kind,true)],'B unsent review survives A');
 const restored=await workspaceHarness('MerchantCampaigns',ports,{locale});await settle(restored);assertOtherWork(restored,locale,kind);assert.equal(writes.length,1,'restoring unsent work cannot submit it');
});

test('committed review with an uncertain device completion retries the same receipt without dropping another case',async()=>{
 const data=directory(),journal=deviceJournal({failCompletionOnce:true}),writes=[];
 const ports={workspaceRecovery:journal.ports,merchantCampaigns:{list:async()=>({ok:true,data:clone(data)}),command:async(...args)=>{writes.push(clone(args));data.detail.participants[0].status='active';return{ok:true,data:{id:a,status:'active'}};}}};
 const h=await workspaceHarness('MerchantCampaigns',ports);const approve=authorOtherWork(h,'en','reviewApplication');approve().props.onClick();await settle(h);
 assert.ok(h.find('button','Retry promotion request'));assertOtherWork(h,'en','reviewApplication');assert.equal(writes.length,1);
 h.find('button','Retry promotion request').props.onClick();await settle(h);
 assert.deepEqual(writes[1],writes[0]);assertOtherWork(h,'en','reviewApplication');assert.equal(journal.read().pending,null);
});


test('paging applications and returning to the first page keeps unsubmitted reviews and other authored forms',async()=>{
 const first=directory(),later=directory(),journal=deviceJournal();first.detail.participantsNextCursor='owned-next-page';later.detail.participants=[{...first.detail.participants[0],id:'88888888-8888-4888-8888-888888888888',creatorName:'Creator C'}];
 const queries=[],ports={workspaceRecovery:journal.ports,merchantCampaigns:{list:async(_company,query)=>{queries.push(clone(query));return{ok:true,data:clone(query.participantsAfter?later:first)};},command:async()=>{throw Error('Paging cannot write');}}};
 const h=await workspaceHarness('MerchantCampaigns',ports);authorOtherWork(h,'en','reviewApplication');
 h.find('button','Next applications').props.onClick();await settle(h);assert.match(h.text(),/Creator C/);
 h.find('button','Reload promotion').props.onClick();await settle(h);assert.ok(queries.some(query=>query.participantsAfter==='owned-next-page'));
 assertOtherWork(h,'en','reviewApplication');
});

const heldResult=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
for(const locale of ['en','zh-HK'])for(const kind of ['reviewApplication','reviewSubmission'])test(`review completion ${locale} ${kind}: all authoring stays locked until the durable completion ACK`,async()=>{
 const data=directory(),journal=deviceJournal(),hold=heldResult(),writes=[];let completing=false;
 const complete=journal.ports.complete;journal.ports.complete=async(...args)=>{completing=true;await hold.promise;return complete(...args);};
 const ports={workspaceRecovery:journal.ports,merchantCampaigns:{list:async()=>({ok:true,data:clone(data)}),command:async(...args)=>{writes.push(clone(args));return{ok:true,data:{id:reviewId(kind),status:'approved'}};}}};
 const h=await workspaceHarness('MerchantCampaigns',ports,{locale});authorOtherWork(h,locale,kind)().props.onClick();await settle(h);assert.equal(completing,true);
 const other=()=>fieldIn(h,card(h,kind==='reviewApplication'?'Creator B':'Creator B · Work B'),'textarea');
 const wasLocked=other().props.disabled;
 // Simulate only input the rendered UI actually permits. Baseline admits it and then loses it.
 if(!wasLocked){other().props.onChange({target:{value:'Newer B text while device ACK is held'}});h.render();}
 hold.resolve();await settle(h);
 assert.equal(other().props.value,wasLocked?'B unsent review survives A':'Newer B text while device ACK is held','completion cannot overwrite feedback the unlocked UI admitted');
 assert.equal(wasLocked,true,'authoring must stay locked through durable completion');
 assert.equal(other().props.disabled,false);assert.equal(writes.length,1);assert.equal(journal.read().pending,null);
});
for(const locale of ['en','zh-HK'])for(const outcome of ['resolve','reject'])test(`review completion ${locale}: old company ${outcome} cannot lock or overwrite the replacement company`,async()=>{
 const nextCompany='99999999-9999-4999-8999-999999999999',hold=heldResult(),journals=new Map(),writes=[];let completing=false;
 const data=directory(),nextData={...directory(),merchantId:nextCompany};
 const ports={workspaceRecovery:{read:async(_actor,scope)=>clone(journals.get(scope)??null),save:async(_actor,scope,value)=>{journals.set(scope,clone(value));},clear:async(_actor,scope)=>{journals.delete(scope);},release:async()=>{},complete:async(_actor,scope,requestId,draft)=>{completing=true;await hold.promise;assert.equal(journals.get(scope)?.pending?.requestId,requestId);journals.set(scope,{version:1,draft:clone(draft),pending:null});}},merchantCampaigns:{list:async(id)=>({ok:true,data:clone(id===nextCompany?nextData:data)}),command:async(...args)=>{writes.push(clone(args));return{ok:true,data:{id:a,status:'active'}};}}};
 const h=await workspaceHarness('MerchantCampaigns',ports,{locale});authorOtherWork(h,locale,'reviewApplication')().props.onClick();await settle(h);assert.equal(completing,true);
 h.props.merchantId=nextCompany;h.render();await settle(h);
 const label=locale==='en'?'Brief title':'簡報標題';h.field(label).props.onChange({target:{value:'Company B unsent brief'}});h.render();await settle(h);
 if(outcome==='resolve')hold.resolve();else hold.reject(Error('Owned A journal failed'));
 await settle(h);
 assert.equal(h.field(label).props.disabled,false,'old completion cannot create unknown-without-pending in B');
 assert.equal(h.field(label).props.value,'Company B unsent brief');
 assert.equal(h.find('button',locale==='en'?'Retry promotion request':'重試推廣請求'),undefined);
 assert.equal(journals.get('merchant-campaign:'+nextCompany)?.pending??null,null);
 assert.equal(writes.length,1);
});
