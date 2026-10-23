import {test} from 'node:test';
import assert from 'node:assert/strict';
import {workspaceHarness,tick} from './helpers/workspace-harness.mjs';

const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
const cases=[a,b].map((id,i)=>({id,subject:`Case ${i+1}`,status:'open',ownerId:null,revision:1,linkedEventId:null,updatedAt:'2026-10-11T00:00:00Z',messages:[],messagesNextCursor:null}));
const article=(h,id)=>h.elements().find(n=>n.type==='article'&&h.text(n).includes(cases.find(c=>c.id===id).subject));
const field=(h,id,label)=>h.elements(article(h,id)).find(n=>n.type==='label'&&[n.props.children].flat(Infinity).includes(label));
const input=(h,id,label)=>h.elements(field(h,id,label)).find(n=>['textarea','select'].includes(n.type));
const edit=(h,id,label,value)=>{input(h,id,label).props.onChange({target:{value}});h.render();};
const submit=(h,id)=>h.elements(article(h,id)).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
async function settle(h){for(let i=0;i<6;i++){await tick();h.render();}}
const reads=()=>({ok:true,data:{items:cases,nextCursor:null}});

test('a case reply cannot populate another case or the new-case message',async()=>{
 const writes=[];const h=await workspaceHarness('SupportWorkspace',{request:async(url,method,body)=>{if(method==='POST'){writes.push(body);return{ok:true,data:{id:a,revision:2,status:'open'}};}return reads();}});
 edit(h,a,'Reply to this case','Only case A');
 assert.equal(input(h,b,'Reply to this case').props.value,'');
 assert.equal(h.field('Message to support').props.value,'');
 edit(h,b,'Reply to this case','Keep case B');
 h.field('Message to support').props.onChange({target:{value:'Separate new case'}});h.render();
 submit(h,a);await settle(h);
 assert.equal(writes[0].command.id,a);assert.equal(writes[0].command.message,'Only case A');
 assert.equal(input(h,a,'Reply to this case').props.value,'');
 assert.equal(input(h,b,'Reply to this case').props.value,'Keep case B');
 assert.equal(h.field('Message to support').props.value,'Separate new case');
});

test('ops decisions and private reasons belong to the selected case',async()=>{
 const writes=[];const h=await workspaceHarness('SupportWorkspace',{request:async(url,method,body)=>{if(method==='POST'){writes.push(body);return{ok:true,data:{id:a,revision:2,status:'resolved'}};}return reads();}},{opsMode:true});
 assert.ok(field(h,a,'Internal decision reason'),'each case has its own decision form');
 edit(h,a,'Internal decision reason','A verified internal reason');edit(h,a,'Case decision','resolved');edit(h,a,'Response visible to the customer','Case A is resolved');
 assert.equal(input(h,b,'Internal decision reason').props.value,'');assert.equal(input(h,b,'Case decision').props.value,'in_progress');
 edit(h,b,'Internal decision reason','Keep this other private reason');
 submit(h,a);await settle(h);
 assert.equal(writes[0].command.reason,'A verified internal reason');assert.equal(writes[0].command.status,'resolved');assert.equal(writes[0].command.message,'Case A is resolved');
 assert.equal(input(h,b,'Internal decision reason').props.value,'Keep this other private reason');
});

test('an unknown reply reconciles its original command and preserves other drafts on the device',async()=>{
 let stored=null;const events=[];
 const recovery={read:async()=>stored,save:async(actor,scope,value)=>{stored=structuredClone(value);},release:async()=>{stored.pending=null;},complete:async(actor,scope,id,draft)=>{stored={version:1,draft:structuredClone(draft),pending:null};},clear:async()=>{stored=null;}};
 const ports={workspaceRecovery:recovery,request:async(url,method,body)=>{if(method==='POST'){events.push({url,body});return url.endsWith('/receipt')?{ok:true,data:{result:{id:a,revision:2,status:'open'}}}:{ok:false,code:'UNAVAILABLE'};}return reads();}};
 const h=await workspaceHarness('SupportWorkspace',ports);
 edit(h,b,'Reply to this case','Retain across reload');edit(h,a,'Reply to this case','Original uncertain reply');submit(h,a);await settle(h);
 h.find('button','Retry the same request').props.onClick();await settle(h);
 assert.deepEqual(events.map(x=>x.url),['/api/support','/api/support/receipt']);assert.deepEqual(events[0].body,events[1].body);
 assert.equal(input(h,b,'Reply to this case').props.value,'Retain across reload');
 const restored=await workspaceHarness('SupportWorkspace',ports);await settle(restored);
 assert.equal(input(restored,b,'Reply to this case').props.value,'Retain across reload');
 assert.equal(input(restored,a,'Reply to this case').props.value,'');
 restored.invalidate();assert.equal(restored.text().includes('Retain across reload'),false);
});

test('legacy unscoped recovery text is available to copy but is not assigned to any case',async()=>{
 const h=await workspaceHarness('SupportWorkspace',{request:async()=>reads(),workspaceRecovery:{read:async()=>({version:1,draft:{subject:'Old subject',message:'Unscoped old reply',reason:'Old internal reason',status:'resolved'},pending:null}),save:async()=>{},clear:async()=>{}}});
 assert.equal(input(h,a,'Reply to this case').props.value,'');assert.equal(input(h,b,'Reply to this case').props.value,'');
 assert.equal(h.field('Message to support').props.value,'');
 assert.ok(h.elements().some(n=>n.type==='textarea'&&n.props.readOnly&&n.props.value.includes('Unscoped old reply')));
});

const journal=()=>{
 let value=null;
 return {get value(){return value;},read:async()=>value,save:async(actor,scope,next)=>{value=structuredClone(next);},clear:async()=>{value=null;},release:async()=>{value.pending=null;},complete:async(actor,scope,id,draft)=>{value={version:1,draft:structuredClone(draft),pending:null};}};
};

test('successful replies stay locked until durable completion and reject an overlapping submission',async()=>{
 const recovery=journal(),writes=[];let finish;
 const gate=new Promise(resolve=>{finish=resolve;});
 const release=recovery.release,complete=recovery.complete;
 recovery.release=async(...args)=>{await gate;await release(...args);};
 recovery.complete=async(...args)=>{await gate;await complete(...args);};
 const h=await workspaceHarness('SupportWorkspace',{workspaceRecovery:recovery,request:async(url,method,body)=>{if(method==='POST'){writes.push(body);return{ok:true,data:{id:a,revision:2,status:'open'}};}return reads();}});
 edit(h,a,'Reply to this case','Confirmed A');edit(h,b,'Reply to this case','Unsent B');
 const otherSubmit=h.elements(article(h,b)).find(n=>n.type==='form').props.onSubmit;
 submit(h,a);await settle(h);
 assert.equal(input(h,a,'Reply to this case').props.disabled,true,'do not accept text that completion would erase');
 otherSubmit({preventDefault(){}});await settle(h);
 assert.equal(writes.length,1,'a stale submit handler must not replay another case command');
 finish();await settle(h);
 assert.equal(input(h,a,'Reply to this case').props.disabled,false);
 edit(h,a,'Reply to this case','Next follow-up');await settle(h);
 assert.equal(input(h,a,'Reply to this case').props.value,'Next follow-up');
 assert.equal(input(h,b,'Reply to this case').props.value,'Unsent B');
});

test('a failed refresh after acknowledgement cannot restore sent text as a new draft',async()=>{
 const recovery=journal();let readsFail=false;
 const ports={workspaceRecovery:recovery,request:async(url,method)=>{if(method==='POST'){readsFail=true;return{ok:true,data:{id:a,revision:2,status:'open'}};}return readsFail?{ok:false,code:'UNAVAILABLE'}:reads();}};
 const h=await workspaceHarness('SupportWorkspace',ports);
 edit(h,a,'Reply to this case','Already delivered');edit(h,b,'Reply to this case','Still unsent');submit(h,a);await settle(h);
 assert.equal(recovery.value.pending,null);
 assert.equal(recovery.value.draft.cases[a],undefined,'sent text is removed in the same durable operation as its pending identity');
 assert.equal(recovery.value.draft.cases[b].message,'Still unsent');
 readsFail=false;
 const restored=await workspaceHarness('SupportWorkspace',ports);await settle(restored);
 assert.equal(input(restored,a,'Reply to this case').props.value,'');
 assert.equal(input(restored,b,'Reply to this case').props.value,'Still unsent');
});

test('failed completion retains the exact request for receipt reconciliation',async()=>{
 const recovery=journal(),writes=[];let fail=true;
 const complete=recovery.complete;
 recovery.complete=async(...args)=>{if(fail)throw Error('LOCAL_STORAGE_UNAVAILABLE');await complete(...args);};
 const h=await workspaceHarness('SupportWorkspace',{workspaceRecovery:recovery,request:async(url,method,body)=>{if(method==='POST'){writes.push({url,body});return url.endsWith('/receipt')?{ok:true,data:{result:{id:a,revision:2,status:'open'}}}:{ok:true,data:{id:a,revision:2,status:'open'}};}return reads();}});
 edit(h,a,'Reply to this case','Exact delivered message');edit(h,b,'Reply to this case','Keep B');submit(h,a);await settle(h);
 assert.ok(recovery.value.pending,'a failed local acknowledgement cannot discard the server request identity');
 assert.equal(input(h,a,'Reply to this case').props.disabled,true);
 fail=false;h.find('button','Retry the same request').props.onClick();await settle(h);
 assert.deepEqual(writes.map(x=>x.url),['/api/support','/api/support/receipt']);
 assert.deepEqual(writes[0].body,writes[1].body);
 assert.equal(input(h,a,'Reply to this case').props.value,'');assert.equal(input(h,b,'Reply to this case').props.value,'Keep B');
});

const supportLabels=locale=>locale==='en'?{
 subject:'Case subject',message:'Message to support',create:'Create support case',refresh:'Refresh cases',retry:'Retry the same request',reply:'Reply to this case',
}:{
 subject:'案件主題',message:'給客服的訊息',create:'建立客服案件',refresh:'重新載入案件',retry:'重試相同請求',reply:'回覆此案件',
};
const newCaseForm=h=>h.elements().find(n=>n.type==='form'&&!n.props['aria-labelledby']);
const fillNewCase=(h,labels)=>{
 h.field(labels.subject).props.onChange({target:{value:'Private unsent subject'}});h.render();
 h.field(labels.message).props.onChange({target:{value:'Private unsent message'}});h.render();
};

for(const locale of ['en','zh-HK']){
 test(`A12-01 ${locale}: an initial failed read blocks creation while read retry can restore authorized editing`,async()=>{
  const labels=supportLabels(locale),events=[];let unavailable=true;
  const h=await workspaceHarness('SupportWorkspace',{workspaceRecovery:journal(),request:async(url,method,body)=>{
   events.push({url,method,body});
   if(method==='POST')return{ok:true,data:{id:body.command.id,revision:1,status:'open'}};
   return unavailable?{ok:false,code:'UNAVAILABLE'}:reads();
  }},{locale});
  assert.equal(h.find('button',labels.create).props.disabled,true);
  assert.equal(h.find('button',labels.refresh).props.disabled,false);
  newCaseForm(h).props.onSubmit({preventDefault(){}});await settle(h);
  assert.equal(events.filter(e=>e.method==='POST').length,0);
  assert.equal(h.find('button',labels.retry),undefined);
  unavailable=false;h.find('button',labels.refresh).props.onClick();await settle(h);
  assert.equal(h.find('button',labels.create).props.disabled,false);
  fillNewCase(h,labels);newCaseForm(h).props.onSubmit({preventDefault(){}});await settle(h);
  const posts=events.filter(e=>e.method==='POST');assert.equal(posts.length,1);
  assert.equal(posts[0].url,'/api/support');assert.equal(posts[0].body.command.subject,'Private unsent subject');
 });

 test(`A12-01 ${locale}: a failed refresh blocks stale create and reply handlers without losing drafts or read retry`,async()=>{
  const labels=supportLabels(locale),recovery=journal(),events=[];let unavailable=false;
  const h=await workspaceHarness('SupportWorkspace',{workspaceRecovery:recovery,request:async(url,method,body)=>{
   events.push({url,method,body});if(method==='POST')return{ok:true,data:{id:body.command.id,revision:2,status:'open'}};
   return unavailable?{ok:false,code:'UNAVAILABLE'}:reads();
  }},{locale});
  fillNewCase(h,labels);edit(h,b,labels.reply,'Keep the second case');await settle(h);
  const staleCreate=newCaseForm(h).props.onSubmit,staleReply=h.elements(article(h,b)).find(n=>n.type==='form').props.onSubmit;
  unavailable=true;h.find('button',labels.refresh).props.onClick();await settle(h);
  staleCreate({preventDefault(){}});staleReply({preventDefault(){}});await settle(h);
  assert.equal(events.filter(e=>e.method==='POST').length,0,'stale handlers must not allocate or send a new command after a failed read');
  assert.equal(h.find('button',labels.create).props.disabled,true);
  assert.equal(h.find('button',labels.refresh).props.disabled,false);
  assert.equal(h.find('button',labels.retry),undefined);
  assert.equal(h.field(labels.subject).props.value,'Private unsent subject');
  assert.equal(recovery.value.pending,null);
  assert.equal(recovery.value.draft.cases[b].message,'Keep the second case');
  unavailable=false;h.find('button',labels.refresh).props.onClick();await settle(h);
  assert.equal(h.find('button',labels.create).props.disabled,false);
  assert.equal(h.field(labels.message).props.value,'Private unsent message');
  assert.equal(input(h,b,labels.reply).props.value,'Keep the second case');
 });

 test(`A12-01 ${locale}: creation waits for recovery readiness after an authorized read`,async()=>{
  const labels=supportLabels(locale),events=[];let finish;
  const recovery=journal();recovery.read=()=>new Promise(resolve=>{finish=resolve;});
  const h=await workspaceHarness('SupportWorkspace',{workspaceRecovery:recovery,request:async(url,method,body)=>{
   events.push({url,method,body});return reads();
  }},{locale});
  assert.equal(h.find('button',labels.create).props.disabled,true);
  newCaseForm(h).props.onSubmit({preventDefault(){}});await settle(h);
  assert.equal(events.filter(e=>e.method==='POST').length,0);
  finish(null);await settle(h);
  assert.equal(h.find('button',labels.create).props.disabled,false);
 });

 for(const denial of ['FORBIDDEN','AUTH_REQUIRED'])test(`A12-01 ${locale}: fresh ${denial} fences stale submission and a late private read`,async()=>{
  const labels=supportLabels(locale),events=[];let count=0,finish;
  const held=new Promise(resolve=>{finish=resolve;});
  const h=await workspaceHarness('SupportWorkspace',{workspaceRecovery:journal(),request:async(url,method,body)=>{
   events.push({url,method,body});if(method==='POST')return{ok:true,data:{id:body.command.id,revision:1,status:'open'}};
   count++;return count===1?reads():count===2?held:{ok:false,code:denial};
  }},{locale});
  fillNewCase(h,labels);await settle(h);
  const staleCreate=newCaseForm(h).props.onSubmit,refresh=h.find('button',labels.refresh).props.onClick;
  refresh();refresh();await settle(h);
  staleCreate({preventDefault(){}});await settle(h);
  assert.equal(events.filter(e=>e.method==='POST').length,0);
  assert.notEqual(h.field(labels.subject)?.props.value,'Private unsent subject');
  if(denial==='FORBIDDEN'){
   assert.equal(h.find('button',labels.create).props.disabled,true);
   assert.equal(h.find('button',labels.refresh).props.disabled,false);
  }else assert.equal(h.find('button',labels.create),undefined);
  finish({ok:true,data:{items:[{...cases[0],subject:'PRIVATE_LATE_CASE'}],nextCursor:null}});await settle(h);
  assert.equal(h.text().includes('PRIVATE_LATE_CASE'),false);
  assert.equal(events.filter(e=>e.method==='POST').length,0);
 });

 test(`A12-01 ${locale}: a dispatched unknown command keeps its exact identity through failed and empty receipt reads`,async()=>{
  const labels=supportLabels(locale),recovery=journal(),events=[];let commands=0,receipts=0;
  const h=await workspaceHarness('SupportWorkspace',{workspaceRecovery:recovery,request:async(url,method,body)=>{
   if(method!=='POST')return reads();events.push({url,body});
   if(url.endsWith('/receipt'))return ++receipts===1?{ok:false,code:'UNAVAILABLE'}:{ok:true,data:{result:null}};
   return ++commands===1?{ok:false,code:'UNAVAILABLE'}:{ok:true,data:{id:body.command.id,revision:1,status:'open'}};
  }},{locale});
  fillNewCase(h,labels);newCaseForm(h).props.onSubmit({preventDefault(){}});await settle(h);
  assert.equal(events.length,1);const original=JSON.stringify(events[0].body);
  assert.equal(h.find('button',labels.create).props.disabled,true);
  h.find('button',labels.retry).props.onClick();await settle(h);
  assert.equal(commands,1);assert.equal(h.find('button',labels.create).props.disabled,true);
  assert.ok(recovery.value.pending);assert.equal(JSON.stringify(events[1].body),original);
  h.find('button',labels.retry).props.onClick();await settle(h);
  assert.deepEqual(events.map(e=>e.url),['/api/support','/api/support/receipt','/api/support/receipt','/api/support']);
  for(const event of events)assert.equal(JSON.stringify(event.body),original);
  assert.equal(recovery.value?.pending??null,null);assert.equal(h.field(labels.message).props.value,'');
 });
}

for(const locale of ['en','zh-HK'])for(const opsMode of [false,true])for(const nextText of ['Newer unsent reply',''])test('PD12 '+locale+' '+(opsMode?'Ops':'customer')+' '+(nextText?'newer text':'cleared text')+': failed autosave and failed read never restore an older device draft over in-memory edits',async()=>{
 const labels=supportLabels(locale),recovery=journal(),events=[];let failSave=false,unavailable=false;
 const save=recovery.save,clear=recovery.clear;
 recovery.save=async(...args)=>{if(failSave)throw Error('LOCAL_STORAGE_UNAVAILABLE');await save(...args);};
 recovery.clear=async(...args)=>{if(failSave)throw Error('LOCAL_STORAGE_UNAVAILABLE');await clear(...args);};
 const h=await workspaceHarness('SupportWorkspace',{workspaceRecovery:recovery,request:async(url,method,body)=>{events.push({url,method,body});return unavailable?{ok:false,code:'UNAVAILABLE'}:reads();}},{locale,opsMode});
 const reply=opsMode?(locale==='en'?'Response visible to the customer':'客戶可見的回覆'):labels.reply;
 edit(h,a,reply,'Older saved reply');await settle(h);
 assert.equal(recovery.value.draft.cases[a].message,'Older saved reply');
 failSave=true;edit(h,a,reply,nextText);
 if(opsMode)edit(h,b,locale==='en'?'Internal decision reason':'內部決定原因','New private decision reason');
 else {h.field(labels.message).props.onChange({target:{value:'New unsent support message'}});h.render();}
 await settle(h);
 assert.equal(recovery.value.draft.cases[a].message,'Older saved reply');
 unavailable=true;h.find('button',labels.refresh).props.onClick();await settle(h);
 assert.equal(h.find('button',labels.refresh).props.disabled,false);
 unavailable=false;h.find('button',labels.refresh).props.onClick();await settle(h);
 assert.equal(input(h,a,reply).props.value,nextText,'current authored intent must survive storage/read recovery');
 if(opsMode)assert.equal(input(h,b,locale==='en'?'Internal decision reason':'內部決定原因').props.value,'New private decision reason');
 else assert.equal(h.field(labels.message).props.value,'New unsent support message');
 assert.equal(events.filter(e=>e.method==='POST').length,0);
 assert.equal(recovery.value.pending,null);
 h.invalidate();assert.doesNotMatch(h.text(),/Older saved reply|Newer unsent reply|New private decision reason|New unsent support message/);
});
