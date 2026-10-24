import test from'node:test';import assert from'node:assert/strict';import{workspaceHarness,tick}from'./helpers/workspace-harness.mjs';
const actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',id='11111111-1111-4111-8111-111111111111',branch='33333333-3333-4333-8333-333333333333',member={merchantId:id,name:'Authorized initial company',role:'owner',branchIds:[]},data={merchantId:id,role:'owner',branches:[],missions:[],applications:[],outcomes:[],nextCursor:null,applicationsNextCursor:null,outcomesNextCursor:null,moneyCapability:'historical_records_only'};
async function fixture(code='FORBIDDEN'){let initial,latest;let reads=0;const ports={request:(url,method)=>{if(method==='POST')return Promise.resolve({ok:false,code});if(url==='/api/merchant')return Promise.resolve({ok:true,data:[member]});if(url.startsWith('/api/merchant?id=')){reads++;return new Promise(resolve=>{if(reads===1)initial=resolve;else latest=resolve;});}throw Error('Unexpected owned fixture endpoint');}};const h=await workspaceHarness('MerchantWorkspace',ports,{actorId:actor,enabled:true,shallow:true,initialSnapshot:{actorId:actor,memberships:[member],workspace:data}});return{h,initial:value=>initial(value),latest:value=>latest(value)};}

test('terminal refresh denial fences the original successful initial read before or after React commit',async()=>{for(const code of ['FORBIDDEN','AUTH_REQUIRED'])for(const commit of [false,true]){const f=await fixture(code);f.h.find('button','Refresh workspace').props.onClick();f.latest({ok:false,code});await tick();if(commit)f.h.render();f.initial({ok:true,data});await tick();f.h.render();assert.equal(f.h.field('Branch name'),undefined,'denied owner controls cannot return');assert.doesNotMatch(f.h.text(),/Funding and payment/);}});

test('terminal command denial fences the original successful initial read before or after React commit',async()=>{for(const code of ['FORBIDDEN','AUTH_REQUIRED'])for(const commit of [false,true]){const f=await fixture(code);f.h.field('Branch name').props.onChange({target:{value:'Denied original owner command'}});f.h.render();f.h.elements().find(node=>node.type==='form'&&f.h.text(node).includes('Create branch')).props.onSubmit({preventDefault(){}});await tick();if(commit)f.h.render();f.initial({ok:true,data});await tick();f.h.render();assert.equal(f.h.field('Branch name'),undefined);assert.doesNotMatch(f.h.text(),/Funding and payment|Denied original owner command/);}});

test('a newer same-role refresh keeps its fresh branches and authored input after the original GET returns',async()=>{const f=await fixture();f.h.field('Branch name').props.onChange({target:{value:'Retain one authored change'}});f.h.render();f.h.find('button','Refresh workspace').props.onClick();f.latest({ok:true,data:{...data,branches:[{id:branch,name:'Freshly authorized branch'}]}});await tick();f.h.render();assert.equal(f.h.find('select','Redemption branch').props.value,branch);f.initial({ok:true,data});await tick();f.h.render();assert.equal(f.h.find('select','Redemption branch').props.value,branch);assert.equal(f.h.field('Branch name').props.value,'Retain one authored change');});
test('a transient manual refresh cannot unlock or discard a concurrent uncertain original branch request',async()=>{let initial,latest;let reads=0;const commands=[];const ports={request:(url,method,payload)=>{if(method==='POST'){commands.push(JSON.parse(JSON.stringify(payload)));return Promise.resolve({ok:false,code:'UNAVAILABLE'});}if(url==='/api/merchant')return Promise.resolve({ok:true,data:[member]});if(url.startsWith('/api/merchant?id=')){reads++;return new Promise(resolve=>{if(reads===1)initial=resolve;else latest=resolve;});}throw Error('Unexpected endpoint');}};const h=await workspaceHarness('MerchantWorkspace',ports,{actorId:actor,enabled:true,shallow:true,initialSnapshot:{actorId:actor,memberships:[member],workspace:data}});h.find('button','Refresh workspace').props.onClick();h.render();assert.equal(h.field('Branch name').props.disabled,false,'a read alone cannot globally lock authoring');h.field('Branch name').props.onChange({target:{value:'One original uncertain branch'}});h.render();h.elements().find(node=>node.type==='form'&&h.text(node).includes('Create branch')).props.onSubmit({preventDefault(){}});await tick();h.render();const original=JSON.stringify(commands[0]);assert.ok(h.find('button','Retry the same request'));latest({ok:false,code:'UNAVAILABLE'});await tick();h.render();assert.ok(h.find('button','Retry the same request'),'read503 cannot discard the uncertain write');assert.equal(h.field('Branch name').props.value,'One original uncertain branch');assert.equal(h.field('Branch name').props.disabled,true);initial({ok:true,data});await tick();h.render();assert.ok(h.find('button','Retry the same request'));h.find('button','Retry the same request').props.onClick();await tick();h.render();assert.equal(commands.length,2);assert.equal(JSON.stringify(commands[1]),original);});
test('a terminal refresh denial invalidates an owner write begun while that refresh was pending',async()=>{for(const code of ['FORBIDDEN','AUTH_REQUIRED']){let initial,latest,ack;let reads=0;const ports={request:(url,method)=>{if(method==='POST')return new Promise(resolve=>ack=resolve);if(url==='/api/merchant')return Promise.resolve({ok:true,data:[member]});if(url.startsWith('/api/merchant?id=')){reads++;return new Promise(resolve=>{if(reads===1)initial=resolve;else latest=resolve;});}throw Error('Unexpected endpoint');}};const h=await workspaceHarness('MerchantWorkspace',ports,{actorId:actor,enabled:true,shallow:true,initialSnapshot:{actorId:actor,memberships:[member],workspace:data}});h.find('button','Refresh workspace').props.onClick();h.field('Branch name').props.onChange({target:{value:'Earlier owner action'}});h.render();h.elements().find(node=>node.type==='form'&&h.text(node).includes('Create branch')).props.onSubmit({preventDefault(){}});latest({ok:false,code});await tick();h.render();ack({ok:true,data:{}});await tick();h.render();assert.doesNotMatch(h.text(),/Saved on the server/,'old owner ACK cannot clear the learned authorization denial');assert.equal(reads,2,'old owner callback cannot begin another scoped read');initial({ok:true,data});await tick();h.render();assert.equal(h.field('Branch name'),undefined);}});

for(const code of ['AUTH_REQUIRED','FORBIDDEN'])for(const commit of [false,true])test(
 `initial workspace ${code} fences an earlier owner acknowledgement ${commit?'after':'before'} React commits the denial`,
 async()=>{
  let initial,ack,reads=0;
  const ports={request:(url,method)=>{
   if(url==='/api/merchant'&&method==='POST')return new Promise(resolve=>ack=resolve);
   if(url==='/api/merchant')return Promise.resolve({ok:true,data:[member]});
   if(url.startsWith('/api/merchant?id=')){reads++;return new Promise(resolve=>initial=resolve);}
   throw Error('Unexpected owned fixture endpoint');
  }};
  const h=await workspaceHarness('MerchantWorkspace',ports,{actorId:actor,enabled:true,shallow:true,initialSnapshot:{actorId:actor,memberships:[member],workspace:data}});
  h.field('Branch name').props.onChange({target:{value:'Earlier owner action'}});h.render();
  h.elements().find(node=>node.type==='form'&&h.text(node).includes('Create branch')).props.onSubmit({preventDefault(){}});
  initial({ok:false,code});await tick();if(commit)h.render();
  ack({ok:true,data:{}});await tick();h.render();
  assert.doesNotMatch(h.text(),/Saved on the server/,'the old acknowledgement cannot replace the learned authorization denial');
  assert.equal(reads,1,'the old acknowledgement cannot schedule another workspace read');
  assert.equal(h.field('Branch name'),undefined,'denied owner controls remain absent');
  assert.equal(h.find('button','Retry the same request'),undefined,'the denied command is no longer retryable');
 }
);

test('a transient initial workspace failure preserves the original uncertain owner command for an exact retry',async()=>{
 let initial;const commands=[];
 const ports={request:(url,method,payload)=>{
  if(url==='/api/merchant'&&method==='POST'){commands.push(structuredClone(payload));return Promise.resolve({ok:false,code:'UNAVAILABLE'});}
  if(url==='/api/merchant')return Promise.resolve({ok:true,data:[member]});
  if(url.startsWith('/api/merchant?id='))return new Promise(resolve=>initial=resolve);
  throw Error('Unexpected owned fixture endpoint');
 }};
 const h=await workspaceHarness('MerchantWorkspace',ports,{actorId:actor,enabled:true,shallow:true,initialSnapshot:{actorId:actor,memberships:[member],workspace:data}});
 h.field('Branch name').props.onChange({target:{value:'Preserve this uncertain branch'}});h.render();
 h.elements().find(node=>node.type==='form'&&h.text(node).includes('Create branch')).props.onSubmit({preventDefault(){}});
 await tick();h.render();
 assert.equal(commands.length,1);
 initial({ok:false,code:'UNAVAILABLE'});await tick();h.render();
 assert.equal(h.field('Branch name').props.value,'Preserve this uncertain branch');
 assert.equal(h.field('Branch name').props.disabled,true);
 h.find('button','Retry the same request').props.onClick();await tick();h.render();
 assert.equal(commands.length,2);
 assert.deepEqual(commands[1],commands[0],'the original request ID and payload must survive a transient initial read failure');
 assert.ok(h.find('button','Retry the same request'),'a second uncertain outcome keeps the retry available');
});
