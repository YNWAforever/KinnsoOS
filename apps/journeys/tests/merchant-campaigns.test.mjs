import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContext,runInContext} from 'node:vm';
import {transform} from 'esbuild';
const helpers=await import('../lib/merchants/campaigns.ts').catch(()=>({}));
const id='11111111-1111-4111-8111-111111111111';
const updatedAt='2026-10-10T12:30:00.123456+00:00';
const input={title:'Authored campaign',summary:'Visit the city and publish an original guide.',couponCode:'CITY',couponUrl:'https://merchant.test/city',affiliateRate:70,kinnsoRate:30,creatorRate:70,requirements:['Original photographs'],deliverables:['One published guide'],milestones:[{id,title:'Published guide',description:'Provide the public guide URL.',dueAt:null}]};

test('campaign drafts retain incomplete commercial inputs while publication requires complete authored work',()=>{
 assert.equal(typeof helpers.campaignCommand,'function');
 const draft={type:'createDraft',id,input:{...input,couponCode:'',couponUrl:'',affiliateRate:null,milestones:[]},publish:false,reason:'Save draft'};
 assert.deepEqual(helpers.campaignCommand(draft),draft);
 assert.deepEqual(helpers.campaignCommand({...draft,input:{...draft.input,milestones:[{id,title:'',description:'',dueAt:null}]}}).input.milestones,[{id,title:'',description:'',dueAt:null}]);
 assert.throws(()=>helpers.campaignCommand({...draft,publish:true}),/INVALID/);
 assert.deepEqual(helpers.campaignCommand({type:'createDraft',id,input,publish:true,reason:'Publish confirmed details'}).input,input);
});

test('campaign command rejects financial expansion, invalid milestones, unsafe links and stale-state omissions',()=>{
 assert.equal(typeof helpers.campaignCommand,'function');
 const command={type:'updateDraft',id,expectedUpdatedAt:updatedAt,input,reason:'Correct wording'};
 assert.deepEqual(helpers.campaignCommand(command),command);
 for(const patch of [{paidFee:100},{creatorRate:0.001},{couponUrl:'javascript:alert(1)'},{milestones:[input.milestones[0],input.milestones[0]]},{requirements:Array(21).fill('oversized')},{milestones:[{...input.milestones[0],dueAt:'not-a-date'}]}])assert.throws(()=>helpers.campaignCommand({...command,input:{...input,...patch}}),/INVALID/);
 assert.throws(()=>helpers.campaignCommand({...command,expectedUpdatedAt:undefined}),/INVALID/);
 assert.throws(()=>helpers.campaignCommand({...command,reason:' '}),/INVALID/);
 assert.throws(()=>helpers.campaignCommand({...command,type:'fundCampaign'}),/INVALID/);
});

test('review and branch commands carry explicit authored feedback and exact observed state',()=>{
 assert.equal(typeof helpers.campaignCommand,'function');
 const application={type:'reviewApplication',id,expectedUpdatedAt:updatedAt,action:'reject',note:'The campaign needs original city photographs.',reason:'The portfolio does not meet the brief'};
 assert.deepEqual(helpers.campaignCommand(application),application);
 assert.throws(()=>helpers.campaignCommand({...application,note:' '}),/INVALID/);
 const submission={type:'reviewSubmission',id,expectedUpdatedAt:updatedAt,action:'request_revision',feedback:'Please supply the published URL.',reason:'Proof is incomplete'};
 assert.deepEqual(helpers.campaignCommand(submission),submission);
 assert.throws(()=>helpers.campaignCommand({...submission,action:'pay'}),/INVALID/);
 const branch={type:'setBranch',id,expectedActive:true,expectedName:'Central',name:'Central shop',active:false,reason:'Shop closed'};
 assert.deepEqual(helpers.campaignCommand(branch),branch);
 assert.throws(()=>helpers.campaignCommand({...branch,expectedActive:undefined}),/INVALID/);
});

test('campaign BFF rejects duplicated scope and unsafe writes before RPC, preserving authoritative errors',async()=>{
 const source=await readFile(new URL('../app/api/merchant/campaigns/route.ts',import.meta.url),'utf8');
 const compiled=await transform(source,{loader:'ts',format:'cjs'}),module={exports:{}},calls=[];let fail=false,throws=false;
 const validation=await import('../lib/api/validation.ts');
 runInContext(compiled.code,createContext({module,exports:module.exports,URL,require:name=>{
  if(name.endsWith('/validation'))return validation;if(name.endsWith('/campaigns'))return helpers;
  if(name.endsWith('/server'))return{apiContext:async()=>({client:{rpc:async(...args)=>{calls.push(args);if(throws)throw Error('Connection failed after commit');return fail?{error:{message:'forbidden'}}:{data:{items:[]}};}}}),boundedBody:request=>request.json(),failure:(code,status)=>Response.json({ok:false,code},{status}),reply:body=>Response.json(body),backendFailure:()=>Response.json({ok:false,code:'FORBIDDEN'},{status:403})};throw Error(name);
 }}));
 for(const query of ['id='+id+'&id='+id,'id='+id+'&userId='+id,'id='+id+'&participantsAfter='+id,'id='+id+'&after='])assert.equal((await module.exports.GET(new Request('https://local.test/api/merchant/campaigns?'+query))).status,400);
 assert.equal(calls.length,0);assert.equal((await module.exports.GET(new Request('https://local.test/api/merchant/campaigns?id='+id))).status,200);
 fail=true;const response=await module.exports.POST(new Request('https://local.test/api/merchant/campaigns',{method:'POST',body:JSON.stringify({merchantId:id,requestId:id,command:{type:'close',id,expectedUpdatedAt:updatedAt,reason:'Campaign finished'}})}));assert.equal(response.status,403);
 assert.equal(calls[1][0],'apply_kinnso_merchant_campaign_command');
 throws=true;
 const uncertain=await module.exports.POST(new Request('https://local.test/api/merchant/campaigns',{method:'POST',body:JSON.stringify({merchantId:id,requestId:id,command:{type:'close',id,expectedUpdatedAt:updatedAt,reason:'Campaign finished'}})}));assert.equal(uncertain.status,503);assert.equal((await uncertain.json()).code,'UNAVAILABLE');
 assert.equal((await module.exports.GET(new Request('https://local.test/api/merchant/campaigns?id='+id))).status,503);
});

const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function uiHarness(port){
 const source=await readFile(new URL('../app/travel/MerchantCampaigns.tsx',import.meta.url),'utf8').catch(()=>null);assert.ok(source,'MerchantCampaigns implements the connected workflow');
 const compiled=await transform(source,{loader:'tsx',format:'cjs',jsx:'automatic',target:'es2022'}),module={exports:{}};
 const states=[],refs=[],effects=[];let cursor=0,changed=false,tree,invalidator,unload;
 const props={actorId:'actor-A',merchantId:id,refreshKey:0,locked:false,onLockChange:()=>{},onChanged:async()=>{},onDenied:port.denied??(()=>{})};
 const react={useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return[states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;changed=true;}];},useRef(initial){const i=cursor++;return refs[i]??(refs[i]={current:initial});},useEffect(work,deps){const i=cursor++,old=effects[i];if(!old||deps.some((value,j)=>!Object.is(value,old.deps[j])))effects[i]={deps,work,pending:true,cleanup:old?.cleanup};}};
 const jsx=(type,props)=>({type,props});let uuidIndex=1;
 runInContext(compiled.code,createContext({module,exports:module.exports,URL,Date,window:{addEventListener:(name,callback)=>{if(name==='beforeunload')unload=callback;},removeEventListener:()=>{}},crypto:{randomUUID:()=>`11111111-1111-4111-8111-${String(uuidIndex++).padStart(12,'0')}`},require:name=>{
  if(name==='react')return react;if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};if(name==='./ui')return{useApp:()=>({t:en=>en,locale:'en'})};if(name.endsWith('/local-drafts'))return{subscribeAccountInvalidation:fn=>{invalidator=fn;return()=>{};}};if(name.endsWith('/campaign-repository'))return{merchantCampaigns:port};if(name.endsWith('/campaigns'))return helpers;if(name.endsWith('/access'))return{parseCommissionPercent:value=>value===''?null:Number(value)};throw Error(name);
 }}));
 function render(){for(let n=0;n<10;n++){cursor=0;changed=false;tree=module.exports.MerchantCampaigns(props);for(const effect of effects)if(effect?.pending){effect.pending=false;effect.cleanup?.();effect.cleanup=effect.work();}if(!changed)break;}return tree;}
 function elements(node){if(arguments.length===0)node=tree;return!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).flatMap(child=>elements(child))];}
 function field(label){const row=elements().find(x=>x.type==='label'&&[x.props.children].flat(Infinity).includes(label));return row&&elements(row).find(x=>['input','textarea','select'].includes(x.type));}
 render();return{render,elements,field,invalidate:()=>invalidator?.(null),beforeUnload:()=>{let prevented=false;unload?.({preventDefault(){prevented=true;}});return prevented;},find:(type,label)=>elements().find(x=>x.type===type&&(x.props['aria-label']===label||x.props.children===label))};
}
const emptyDirectory={merchantId:id,role:'owner',items:[],nextCursor:null,detail:null,branches:[],summary:{draft:0,published:0,closed:0,applications:0,activeCreators:0,submitted:0,approved:0}};
test('actual campaign editor saves a draft and retries an unknown response with the same immutable command',async()=>{
 const calls=[];const h=await uiHarness({list:async()=>({ok:true,data:emptyDirectory}),command:async(...args)=>{calls.push(args);return calls.length===1?{ok:false,code:'UNAVAILABLE'}:{ok:true,data:{id:args[1].id,status:'draft'}};}});
 await tick();h.render();assert.equal(h.beforeUnload(),false);h.field('Brief title').props.onChange({target:{value:'My authored draft'}});h.render();assert.equal(h.beforeUnload(),true);
 h.elements().find(x=>x.type==='form').props.onSubmit({preventDefault(){},nativeEvent:{submitter:{getAttribute:()=> 'draft'}}});await tick();h.render();
 assert.equal(calls.length,1);assert.equal(calls[0][1].type,'createDraft');assert.equal(calls[0][1].publish,false);assert.equal(calls[0][1].input.title,'My authored draft');assert.equal(calls[0][1].input.affiliateRate,null);
 h.find('button','Retry promotion request').props.onClick();await tick();h.render();assert.equal(calls.length,2);assert.deepEqual(calls[1],calls[0]);
});
test('actual campaign editor discards a late private response after account invalidation',async()=>{
 let resolve;const h=await uiHarness({list:()=>new Promise(done=>{resolve=done;}),command:async()=>({ok:true,data:{}})});h.invalidate();h.render();resolve({ok:true,data:{...emptyDirectory,items:[{id,title:'Private campaign',summary:'Private business notes',status:'draft',missionType:'coupon_affiliate',updatedAt}]}});await tick();h.render();assert.equal(JSON.stringify(h.elements()).includes('Private business notes'),false);
});
