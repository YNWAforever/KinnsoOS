import {evidenceTimeline} from '../lib/collaboration/evidence-timeline.ts';
import {recoveryHookModule,serviceStateModule,listFilterModule,workspaceHarness} from './helpers/workspace-harness.mjs';
import {test} from 'node:test';
import * as listQueries from '../lib/collaboration/list-query.ts';
import {scheduleDate} from '../lib/merchants/campaign-schedule.ts';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContext,runInContext} from 'node:vm';
import {transform} from 'esbuild';
const id='11111111-1111-4111-8111-111111111111',stamp='2026-10-10T19:00:00.123456+00:00';
const tick=()=>new Promise(r=>setImmediate(r));
const detail=()=>({id,title:'Authored collaboration',summary:'Read the authored brief.',missionType:'coupon_affiliate',missionSource:'merchant',status:'published',visibility:'open',merchantName:'Local merchant',eligible:true,joinAvailable:true,acceptAvailable:false,evidenceAvailable:false,minTier:null,paidFeeAmount:null,paidFeeCurrency:null,creatorRate:'0',startsAt:null,endsAt:null,participant:null,requirements:[],deliverables:[],couponCode:null,couponUrl:null,milestones:[{id,title:'Original route',description:'Write your own route',dueAt:null,repeatable:false}],milestonesTruncated:false,submissions:[],submissionsNextCursor:null,partnerLinks:[],maxReceipts:null});
async function harness(port={},name='CreatorMissionsWorkspace',locale='en'){
 const source=await readFile(new URL('../app/travel/'+name+'.tsx',import.meta.url),'utf8').catch(()=> '');assert.notEqual(source,'','The connected creator workspace must exist');
 const compiled=await transform(source,{loader:'tsx',format:'cjs',jsx:'automatic'}),states=[],refs=[],effects=[];let cursor=0,changed=false,tree,invalidate;
 const props={path:'studio/missions/'+id,actorId:'creator-A',enabled:true};
 const react={useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return[states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;changed=true;}];},useRef(initial){const i=cursor++;return refs[i]??(refs[i]={current:initial});},useEffect(work,deps){const i=cursor++,old=effects[i];if(!old||deps.some((x,j)=>!Object.is(x,old.deps[j])))effects[i]={deps,work,pending:true,cleanup:old?.cleanup};}};
 const jsx=(type,props)=>typeof type==='function'&&type.name==='WorkspaceServiceState'?type(props):({type,props}),module={exports:{}};
 const service=await serviceStateModule(jsx);const filters=await listFilterModule(jsx);let sequence=0;
 const validation=await import('../lib/creators/collaboration-validation.ts');
 const recoveryHook=await recoveryHookModule(react);
 runInContext(compiled.code,createContext({module,exports:module.exports,Date,URL,URLSearchParams,window:{location:{search:'',pathname:'/en/studio/missions'},history:{replaceState(){}},addEventListener(){},removeEventListener(){}},crypto:{randomUUID:()=>`00000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`},require:name=>{
  if(name==='./useWorkspaceRecovery')return recoveryHook;if(name==='./CollaborationListFilters')return filters;if(name.endsWith('/collaboration/list-query'))return listQueries;if(name==='./WorkspaceServiceState')return service;if(name==='react')return react;if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};if(name==='next/link')return{__esModule:true,default:'a'};
  if(name==='./ui')return{useApp:()=>({t:(en,zh)=>locale==='zh-HK'?zh:en,locale,href:path=>'/'+locale+'/'+path})};
  if(name==='../../lib/trips/local-drafts')return{subscribeAccountInvalidation:fn=>{invalidate=fn;return()=>{};}};
  if(name==='../../lib/creators/collaboration-validation')return validation;
  if(name==='../../lib/creators/collaboration')return{creatorMissions:{get:async()=>({ok:true,data:detail()}),list:async()=>({ok:true,data:{items:[],nextCursor:null}}),...port},creatorEarnings:{get:async()=>({ok:true,data:{section:'settled',totals:[],items:[],nextCursor:null}}),...port}};
  if(name.endsWith('/collaboration/evidence-timeline'))return{evidenceTimeline};
  if(name.endsWith('/campaign-schedule'))return{scheduleDate};
  throw Error('Unexpected import '+name);
 }}));
 function render(){for(let n=0;n<12;n++){cursor=0;changed=false;tree=module.exports[name](props);for(const effect of effects)if(effect?.pending){effect.pending=false;effect.cleanup?.();effect.cleanup=effect.work();}if(!changed)break;}return tree;}
 function elements(node){if(arguments.length===0)node=tree;return!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).flatMap(child=>elements(child))];}
 function text(node){if(arguments.length===0)node=tree;return typeof node==='string'||typeof node==='number'?String(node):node&&typeof node==='object'?[node.props?.children].flat(Infinity).map(child=>text(child)).join(' '):'';}
 const find=(type,label)=>elements().find(x=>x.type===type&&(x.props['aria-label']===label||x.props.children===label));
 render();for(let n=0;n<4;n++){await tick();render();}return{render,find,elements,text,invalidate:()=>invalidate?.(null),props};
}

test('creator unknown join retries one immutable command and clears private work on account invalidation',async()=>{
 const calls=[],h=await harness({command:async(...args)=>{calls.push(args);return{ok:false,code:'UNAVAILABLE',retryable:true};}});
 const consent=h.find('input','I have read the collaboration requirements.');assert.ok(consent);consent.props.onChange({target:{checked:true}});h.render();
 await h.find('button','Join collaboration').props.onClick();await tick();h.render();assert.equal(calls.length,1);
 assert.ok(h.find('button','Retry the same request'));assert.equal(h.find('button','Join collaboration').props.disabled,true);
 await h.find('button','Retry the same request').props.onClick();await tick();h.render();assert.equal(calls.length,2);assert.deepEqual(calls[1],calls[0]);
 h.invalidate();h.render();assert.doesNotMatch(h.text(),/Authored collaboration/);assert.ok(h.find('a','Sign in to continue'));
});

test('creator evidence conflict retains authored input and does not silently retry or replace the reviewed version',async()=>{
 const dto=detail();dto.participant={id,status:'active',updatedAt:stamp};dto.joinAvailable=false;dto.evidenceAvailable=true;let writes=0;
 const h=await harness({get:async()=>({ok:true,data:dto}),command:async()=>{writes++;return{ok:false,code:'CONFLICT',retryable:false};}});
 h.find('button','Prepare evidence').props.onClick();h.render();
 h.find('textarea','Evidence links (one HTTPS link per line)').props.onChange({target:{value:'https://example.test/my-work'}});h.render();
 h.find('textarea','Notes for reviewer').props.onChange({target:{value:'My retained authored details'}});h.render();
 await h.elements().find(x=>x.type==='form').props.onSubmit({preventDefault(){}});await tick();h.render();
 assert.equal(writes,1);assert.equal(h.find('textarea','Notes for reviewer').props.value,'My retained authored details');
 assert.match(h.text(),/changed/);assert.equal(h.find('button','Retry the same request'),undefined);await tick();assert.equal(writes,1);
});

test('authored coupon campaigns ask for an application while mature immediate-join offers keep their existing CTA',async()=>{
 const dto=detail();dto.requiresApplication=true;
 const h=await harness({get:async()=>({ok:true,data:dto})});
 assert.ok(h.find('button','Send application'));assert.equal(h.find('button','Join collaboration'),undefined);
});

test('creator sees the merchant application explanation after rejection and approval',async()=>{
 for(const [status,note] of [['rejected','We need a route with accessible transport.'],['active','Your original route fits this brief.']]){
  const dto=detail();dto.participant={id,status,updatedAt:stamp,applicationNote:'My original route proposal.',merchantReviewNote:note};dto.joinAvailable=false;
  const h=await harness({get:async()=>({ok:true,data:dto})});
  assert.match(h.text(),/Application review:/);assert.ok(h.text().includes(note));assert.ok(h.text().includes(dto.participant.applicationNote));
 }
 const dto=detail();dto.participant={id,status:'applied',updatedAt:stamp,merchantReviewNote:null};
 const pending=await harness({get:async()=>({ok:true,data:dto})});assert.doesNotMatch(pending.text(),/Application review:/);
});

test('earnings show exact separate-currency totals and distinguish tracked volume from payout records',async()=>{
 const pages={settled:{section:'settled',totals:[{currency:'HKD',pending:'9999999999.99',paid:'0.10'},{currency:'USD',pending:'1.20',paid:'0.00'}],items:[],nextCursor:null},tracked:{section:'tracked',totals:[],items:[{id,kind:'affiliate',title:'Tracked campaign',amount:'750.00',currency:'USD',status:'processing'}],nextCursor:null}};
 const h=await harness({get:async section=>({ok:true,data:pages[section]})},'CreatorEarningsWorkspace');
 assert.match(h.text(),/HKD 9999999999\.99/);assert.match(h.text(),/USD 1\.20/);
 await h.find('button','Tracked activity').props.onClick();await tick();h.render();assert.match(h.text(),/USD 750\.00/);assert.match(h.text(),/not yet payable/);
 h.invalidate();h.render();assert.doesNotMatch(h.text(),/750\.00/);
});

test('loaded evidence history links each receipt to its actual milestone context',async()=>{
 const dto=detail();const other='22222222-2222-4222-8222-222222222222';
 dto.participant={id,status:'active',updatedAt:stamp};dto.joinAvailable=false;
 dto.milestones.push({id:other,title:'Second actual milestone',description:'Original instructions',dueAt:null,repeatable:true});
 dto.submissions=[{id:'receipt1',milestoneId:id,status:'approved',submittedAt:stamp,notes:'Repeated notes',proofUrls:[],reviews:[]},{id:'receipt2',milestoneId:other,status:'submitted',submittedAt:stamp,notes:'Repeated notes',proofUrls:[],reviews:[]}];
 const h=await harness({get:async()=>({ok:true,data:dto})});
 for(const milestone of dto.milestones){const link=h.elements().find(el=>el.type==='a'&&el.props.href==='#milestone-'+milestone.id);assert.ok(link,'history needs milestone anchor for '+milestone.title);assert.ok(h.text(link).includes(milestone.title));}
});

for(const locale of ['en','zh-HK'])test('Creator '+locale+': a paged nonrepeatable milestone stays unknown until its older revision is loaded',async()=>{
 const other='22222222-2222-4222-8222-222222222222',revision='33333333-3333-4333-8333-333333333333';
 const dto=detail();dto.participant={id,status:'active',updatedAt:stamp};dto.joinAvailable=false;dto.evidenceAvailable=true;
 dto.milestones.push({id:other,title:'Repeatable receipts',description:'Independent receipts',dueAt:null,repeatable:true});
 dto.submissions=Array.from({length:50},(_,index)=>({id:'10000000-0000-4000-8000-'+String(index+1).padStart(12,'0'),milestoneId:other,status:'approved',submittedAt:stamp,updatedAt:stamp,notes:null,proofUrls:[],merchantFeedback:null,reviews:[]}));
 dto.submissionsNextCursor='older-evidence-page';
 const older={id:revision,milestoneId:id,status:'revision_requested',submittedAt:stamp,updatedAt:stamp,notes:'Original revision note',proofUrls:['https://example.test/original-proof'],merchantFeedback:'Clarify source',reviews:[]};
 const reads=[],writes=[];
 const h=await harness({get:async(missionId,after)=>{reads.push([missionId,after]);return{ok:true,data:after?{...dto,submissions:[older],submissionsNextCursor:null}:dto};},command:async(...args)=>{writes.push(args);return{ok:true,data:{id:revision,status:'submitted',updatedAt:stamp}};}},'CreatorMissionsWorkspace',locale);
 assert.equal(h.find('button',locale==='en'?'Prepare evidence':'準備證明'),undefined,'unloaded records cannot prove no existing submission');
 assert.ok(h.find('button',locale==='en'?'Prepare new receipt':'準備新收據'),'repeatable receipts remain available');
 assert.match(h.text(),locale==='en'?/Load earlier evidence to check/:/請載入較早證明/);
 assert.equal(writes.length,0);
 await h.find('button',locale==='en'?'Load earlier evidence':'載入較早證明').props.onClick();await tick();h.render();
 assert.deepEqual(reads.slice(0,2),[[id,undefined],[id,'older-evidence-page']]);
 h.find('button',locale==='en'?'Edit and resubmit evidence':'修改並重新提交證明').props.onClick();h.render();
 assert.equal(h.find('textarea',locale==='en'?'Notes for reviewer':'給審核員的備註').props.value,'Original revision note');
 h.find('textarea',locale==='en'?'Notes for reviewer':'給審核員的備註').props.onChange({target:{value:'Clarified original submission'}});h.render();
 await h.elements().find(el=>el.type==='form').props.onSubmit({preventDefault(){}});await tick();h.render();
 assert.equal(writes.length,1);
 assert.deepEqual(JSON.parse(JSON.stringify(writes[0].slice(0,2))),[id,{type:'submitEvidence',milestoneId:id,submissionId:revision,expectedUpdatedAt:stamp,proofUrls:['https://example.test/original-proof'],notes:'Clarified original submission'}]);
 assert.match(writes[0][2],/^[0-9a-f-]{36}$/);
});
for(const locale of ['en','zh-HK'])test('Creator '+locale+': complete empty submission coverage still allows the first nonrepeatable evidence',async()=>{
 const dto=detail();dto.participant={id,status:'active',updatedAt:stamp};dto.joinAvailable=false;dto.evidenceAvailable=true;
 const h=await harness({get:async()=>({ok:true,data:dto})},'CreatorMissionsWorkspace',locale);
 assert.equal(h.find('button',locale==='en'?'Prepare evidence':'準備證明').props.disabled,false);
 assert.doesNotMatch(h.text(),locale==='en'?/Load earlier evidence to check/:/請載入較早證明/);
});

const recoveredDevice=value=>({read:async()=>value,save:async()=>{},clear:async()=>{},release:async()=>{},complete:async()=>{}});
for(const locale of ['en','zh-HK'])for(const coverage of ['unloaded','existing'])test('PR89 recovery '+locale+' '+coverage+': a restored new nonrepeatable form cannot submit around submission coverage',async()=>{
 const other='22222222-2222-4222-8222-222222222222',revision='33333333-3333-4333-8333-333333333333';
 const dto=detail();Object.assign(dto,{participant:{id,status:'active',updatedAt:stamp},joinAvailable:false,evidenceAvailable:true,submissionsNextCursor:'older-page'});
 dto.milestones.push({id:other,title:'Other receipts',description:'Independent work',dueAt:null,repeatable:true});
 dto.submissions=Array.from({length:50},(_,i)=>({id:'10000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),milestoneId:other,status:'approved',submittedAt:stamp,updatedAt:stamp,notes:null,proofUrls:[],merchantFeedback:null,reviews:[]}));
 if(coverage==='existing')dto.submissions[0]={id:revision,milestoneId:id,status:'revision_requested',submittedAt:stamp,updatedAt:stamp,notes:'Original revision',proofUrls:['https://example.test/old'],merchantFeedback:null,reviews:[]};
 const calls=[],stored={draft:{applicationNote:'',form:{milestoneId:id,submissionId:null,expectedUpdatedAt:null,proofText:'https://example.test/recovered',notes:'Keep recovered authored notes'}},pending:null};
 const h=await workspaceHarness('CreatorMissionsWorkspace',{creatorMissions:{get:async()=>({ok:true,data:dto}),command:async(...args)=>{calls.push(args);return{ok:false,code:'CONFLICT',retryable:false};}},workspaceRecovery:recoveredDevice(stored)},{path:'studio/missions/'+id,locale});
 const notes=locale==='en'?'Notes for reviewer':'給審核員的備註',submit=locale==='en'?'Submit evidence':'提交證明';
 assert.equal(h.field(notes).props.value,'Keep recovered authored notes');
 await h.elements().find(el=>el.type==='form').props.onSubmit({preventDefault(){}});await tick();h.render();
 assert.equal(calls.length,0,'restored null-ID drafts must not send a known-conflicting new submission');
 assert.equal(h.find('button',submit).props.disabled,true);
 assert.equal(h.field(notes).props.value,'Keep recovered authored notes');
});
for(const locale of ['en','zh-HK'])for(const mode of ['complete-empty','repeatable','revision'])test('PR89 recovery '+locale+' '+mode+': valid recovered evidence retains original payload and revision',async()=>{
 const revision='33333333-3333-4333-8333-333333333333',dto=detail();
 Object.assign(dto,{participant:{id,status:'active',updatedAt:stamp},joinAvailable:false,evidenceAvailable:true,submissionsNextCursor:mode==='complete-empty'?null:'older-page'});
 dto.milestones[0].repeatable=mode==='repeatable';
 if(mode==='revision')dto.submissions=[{id:revision,milestoneId:id,status:'revision_requested',submittedAt:stamp,updatedAt:stamp,notes:'Original revision',proofUrls:['https://example.test/old'],merchantFeedback:null,reviews:[]}];
 const form={milestoneId:id,submissionId:mode==='revision'?revision:null,expectedUpdatedAt:mode==='revision'?stamp:null,proofText:'https://example.test/recovered',notes:'Retained original input'},calls=[];
 const h=await workspaceHarness('CreatorMissionsWorkspace',{creatorMissions:{get:async()=>({ok:true,data:dto}),command:async(...args)=>{calls.push(args);return{ok:true,data:{id:revision,status:'submitted',updatedAt:stamp}};}},workspaceRecovery:recoveredDevice({draft:{applicationNote:'',form},pending:null})},{path:'studio/missions/'+id,locale});
 assert.equal(h.find('button',locale==='en'?'Submit evidence':'提交證明').props.disabled,false);
 await h.elements().find(el=>el.type==='form').props.onSubmit({preventDefault(){}});await tick();h.render();
 assert.equal(calls.length,1);
 assert.deepEqual(JSON.parse(JSON.stringify(calls[0].slice(0,2))),[id,{type:'submitEvidence',milestoneId:id,submissionId:mode==='revision'?revision:null,expectedUpdatedAt:mode==='revision'?stamp:null,proofUrls:['https://example.test/recovered'],notes:'Retained original input'}]);
});
for(const locale of ['en','zh-HK'])test('PR89 recovery '+locale+': unresolved stored null-ID intent keeps its immutable request across failed reads',async()=>{
 const dto=detail();Object.assign(dto,{participant:{id,status:'active',updatedAt:stamp},joinAvailable:false,evidenceAvailable:true,submissionsNextCursor:'older-page'});
 const requestId='99999999-9999-4999-8999-999999999999',command={type:'submitEvidence',milestoneId:id,submissionId:null,expectedUpdatedAt:null,proofUrls:['https://example.test/original-pending'],notes:'Original immutable intent'};
 const calls=[];let failRead=false;
 const stored={draft:{form:{milestoneId:id,submissionId:null,expectedUpdatedAt:null,proofText:'https://example.test/different-draft',notes:'Different authored draft'}},pending:{command,requestId}};
 const h=await workspaceHarness('CreatorMissionsWorkspace',{creatorMissions:{get:async()=>failRead?{ok:false,code:'UNAVAILABLE',retryable:true}:{ok:true,data:dto},command:async(...args)=>{calls.push(args);return{ok:false,code:'UNAVAILABLE',retryable:true};}},workspaceRecovery:recoveredDevice(stored)},{path:'studio/missions/'+id,locale});
 const retry=()=>h.find('button',locale==='en'?'Retry the same request':'重試相同請求');
 failRead=true;await retry().props.onClick();await tick();h.render();assert.equal(calls.length,0);
 failRead=false;await retry().props.onClick();await tick();h.render();
 await retry().props.onClick();await tick();h.render();
 assert.equal(calls.length,2);assert.deepEqual(JSON.parse(JSON.stringify(calls)),[[id,command,requestId],[id,command,requestId]]);
});
