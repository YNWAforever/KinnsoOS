import {test} from 'node:test';
import assert from 'node:assert/strict';
import {serviceStateModule,workspaceHarness,tick} from './helpers/workspace-harness.mjs';

const uuid='11111111-1111-4111-8111-111111111111';
const jsx=(type,props)=>({type,props});
const service=await serviceStateModule(jsx);
const nodes=node=>!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).flatMap(nodes)];
const text=node=>typeof node==='string'?node:node&&typeof node==='object'?[node.props.children].flat(Infinity).map(text).join(' '):'';
function render(props){assert.equal(typeof service.WorkspaceServiceState,'function');return service.WorkspaceServiceState({locale:'en',...props});}
const unavailable={ok:false,code:'UNAVAILABLE',retryable:true,requestId:uuid};
const empty={merchantId:uuid,role:'owner',items:[],nextCursor:null,detail:null,branches:[],summary:{draft:0,published:0,closed:0,applications:0,activeCreators:0,submitted:0,approved:0}};
const mission={id:uuid,title:'Private collaboration',summary:'Private brief',missionType:'coupon_affiliate',missionSource:'merchant',status:'published',visibility:'open',merchantName:'Local merchant',eligible:true,joinAvailable:true,acceptAvailable:false,evidenceAvailable:false,minTier:null,paidFeeAmount:null,paidFeeCurrency:null,creatorRate:'0',startsAt:null,endsAt:null,participant:null,requirements:[],deliverables:[],couponCode:null,couponUrl:null,milestones:[],milestonesTruncated:false,submissions:[],submissionsNextCursor:null,partnerLinks:[],maxReceipts:null};

test('service states distinguish outage, permission, conflict and an immutable uncertain result in both languages',()=>{
 for(const locale of ['en','zh-HK']) {
  let retries=0;const report=render({locale,code:'UNAVAILABLE',requestId:uuid,retryState:'read',onRetry:()=>retries++});
  assert.equal(report.props.role,'alert');assert.ok(report.props['aria-label']);assert.ok(text(report).includes(uuid));
  assert.match(text(report),locale==='en'?/temporarily unavailable/i:/暫時未能使用/);
  nodes(report).find(n=>n.type==='button').props.onClick();assert.equal(retries,1);
  const forbidden=render({locale,code:'FORBIDDEN',retryState:'read',onRetry:()=>retries++});
  assert.equal(nodes(forbidden).some(n=>n.type==='button'),false);
  const conflict=render({locale,code:'CONFLICT',retryState:'read',onRetry:()=>retries++});
  assert.match(text(conflict),locale==='en'?/input.*kept|draft.*kept/i:/輸入.*保留|草稿.*保留/);
  const unknown=render({locale,code:'UNAVAILABLE',retryState:'immutable-command',onRetry:()=>retries++});
  assert.match(text(unknown),locale==='en'?/original request/i:/原本請求/);
  assert.equal(nodes(render({locale,code:'UNAVAILABLE',retryState:'blocked',onRetry:()=>retries++})).some(n=>n.type==='button'),false);
 }
});
test('401 login returns safely to the task, and unrecognized codes never expose operator details',()=>{
 for(const [locale,returnPath,want] of [['en','/en/studio/missions','/en/studio/missions'],['zh-HK','//evil.example/private','/zh-HK/trips'],['en','/en/auth/callback','/en/trips']]) {
  const report=render({locale,code:'AUTH_REQUIRED',returnPath,retryState:'read'});
  const href=nodes(report).find(n=>n.type==='a').props.href;
  assert.equal(href,`/${locale}/sign-in?next=${encodeURIComponent(want)}`);
 }
 const report=render({code:'SQL_FAKE_SECRET https://private.example',requestId:'sb_secret_FAKE_SECRET',retryState:'blocked'});
 assert.doesNotMatch(text(report),/SQL_|FAKE_SECRET|https:|KINNSO_/);
});
test('503 is a service state rather than an empty creator list or earnings category',async()=>{
 for(const locale of ['en','zh-HK'])for(const name of ['CreatorMissionsWorkspace','CreatorEarningsWorkspace']) {
  const h=await workspaceHarness(name,{creatorMissions:{list:async()=>unavailable},creatorEarnings:{get:async()=>unavailable}},{locale});
  assert.match(h.text(),locale==='en'?/temporarily unavailable/i:/暫時未能使用/);
  assert.doesNotMatch(h.text(),/No open collaborations|No records in this category|暫未有開放|此分類暫未/);
  assert.ok(h.elements().some(n=>n.props?.role==='alert'&&n.props['aria-label']));
 }
});

test('disabled creator services report unavailability before inviting a signed-out actor to log in',async()=>{
 for(const locale of ['en','zh-HK'])for(const name of ['CreatorMissionsWorkspace','CreatorEarningsWorkspace']){
  let reads=0;const read=async()=>{reads++;return unavailable;};
  const h=await workspaceHarness(name,{creatorMissions:{list:read},creatorEarnings:{get:read}},{locale,actorId:null,enabled:false});
  assert.match(h.text(),locale==='en'?/temporarily unavailable/i:/暫時未能使用/);
  assert.equal(h.elements().some(n=>n.type==='a'&&n.props.href?.includes('/sign-in')),false);
  assert.equal(reads,0);
 }
});
test('merchant onboarding and moderator error panels remain visible for unavailable and revoked sessions',async()=>{
 for(const code of ['UNAVAILABLE','AUTH_REQUIRED','FORBIDDEN'])for(const name of ['MerchantOnboarding','MerchantApplicationReview']) {
  const result={ok:false,code,retryable:code==='UNAVAILABLE',requestId:uuid};
  const h=await workspaceHarness(name,{merchantOnboarding:{get:async()=>result},request:async()=>result},{path:'ops/merchant-applications'});
  assert.ok(h.elements().some(n=>n.props?.role==='alert'&&n.props['aria-label']),`${name} ${code}`);
  if(code==='AUTH_REQUIRED')assert.ok(h.find('a','Sign in to continue'));
  if(code==='FORBIDDEN')assert.equal(h.find('button','Retry loading'),undefined);
 }
});
test('unknown creator command reconciles before an identical replay and remains locked after a later conflict',async()=>{
 const events=[],commands=[];let reads=0;
 const h=await workspaceHarness('CreatorMissionsWorkspace',{creatorMissions:{get:async()=>{events.push('read');reads++;return{ok:true,data:mission};},command:async(...args)=>{events.push('write');commands.push(JSON.parse(JSON.stringify(args)));return commands.length===1?unavailable:{ok:false,code:'CONFLICT',retryable:false,requestId:uuid};}}},{path:'studio/missions/'+uuid});
 h.find('input','I have read the collaboration requirements.').props.onChange({target:{checked:true}});h.render();
 await h.find('button','Join collaboration').props.onClick();await tick();h.render();events.length=0;
 await h.find('button','Retry the same request').props.onClick();await tick();h.render();
 assert.deepEqual(events,['read','write']);assert.deepEqual(commands[1],commands[0]);
 assert.ok(h.find('button','Retry the same request'));assert.equal(h.find('button','Join collaboration').props.disabled,true);
 assert.ok(reads>=2);
});
test('unknown merchant draft reconciles, keeps its payload and stays locked after a later conflict',async()=>{
 const events=[],commands=[];
 const h=await workspaceHarness('MerchantCampaigns',{merchantCampaigns:{list:async()=>{events.push('read');return{ok:true,data:empty};},command:async(...args)=>{events.push('write');commands.push(JSON.parse(JSON.stringify(args)));return commands.length===1?unavailable:{ok:false,code:'CONFLICT',retryable:false,requestId:uuid};}}});
 h.field('Brief title').props.onChange({target:{value:'Retained authored draft'}});h.render();
 h.elements().find(n=>n.type==='form').props.onSubmit({preventDefault(){},nativeEvent:{submitter:{getAttribute:()=> 'draft'}}});await tick();h.render();events.length=0;
 h.find('button','Retry promotion request').props.onClick();await tick();await tick();h.render();
 assert.deepEqual(events,['read','write']);assert.deepEqual(commands[1],commands[0]);
 assert.equal(h.field('Brief title').props.value,'Retained authored draft');assert.equal(h.field('Brief title').props.disabled,true);
 assert.ok(h.find('button','Retry promotion request'));
});
test('permission loss during reconciliation clears private results and prevents replay',async()=>{
 let revoked=false,writes=0;
 const h=await workspaceHarness('CreatorMissionsWorkspace',{creatorMissions:{get:async()=>revoked?{ok:false,code:'FORBIDDEN',retryable:false,requestId:uuid}:{ok:true,data:mission},command:async()=>{writes++;return unavailable;}}},{path:'studio/missions/'+uuid});
 h.find('input','I have read the collaboration requirements.').props.onChange({target:{checked:true}});h.render();
 await h.find('button','Join collaboration').props.onClick();await tick();h.render();revoked=true;
 await h.find('button','Retry the same request').props.onClick();await tick();h.render();
 assert.equal(writes,1);assert.doesNotMatch(h.text(),/Private collaboration|Private brief/);
 assert.equal(h.find('button','Retry the same request'),undefined);
});

test('unknown onboarding reconciles before replay and retains its request through a later rejection',async()=>{
 const events=[],commands=[];
 const h=await workspaceHarness('MerchantOnboarding',{merchantOnboarding:{get:async()=>{events.push('read');return{ok:true,data:{applications:[],merchant:null}};},submit:async(...args)=>{events.push('write');commands.push(JSON.parse(JSON.stringify(args)));return commands.length===1?unavailable:{ok:false,code:'CONFLICT',retryable:false,requestId:uuid};}}},{path:'merchant'});
 h.field('Company name').props.onChange({target:{value:'Retained company'}});h.render();
 h.field('Contact email').props.onChange({target:{value:'synthetic@example.test'}});h.render();
 h.elements().find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});h.render();
 h.elements().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await tick();h.render();events.length=0;
 h.find('button','Retry same application').props.onClick();await tick();await tick();h.render();
 assert.deepEqual(events,['read','write']);assert.deepEqual(commands[1],commands[0]);
 assert.equal(h.elements().find(n=>n.type==='fieldset').props.disabled,true);
 assert.equal(h.field('Company name').props.value,'Retained company');assert.ok(h.find('button','Retry same application'));
});
test('moderator retry reconciles a terminal decision without sending another POST',async()=>{
 const row={id:uuid,companyName:'Synthetic company',contactName:'Synthetic contact',contactEmail:'synthetic@example.test',websiteUrl:'',pitch:'Synthetic application',status:'pending',createdAt:'2026-10-10T19:00:00Z',decidedAt:null,decisionReason:null};
 let writes=0,terminal=false;const events=[];
 const h=await workspaceHarness('MerchantApplicationReview',{request:async(url,method='GET',body)=>{
  if(method==='POST'){events.push('write');writes++;terminal=true;return unavailable;}
  events.push('read');return url.includes('?id=')?{ok:true,data:{...row,status:terminal?'approved':'pending',decisionReason:terminal?'Confirmed original decision':null}}:{ok:true,data:{applications:[row],nextCursor:null}};
 }},{path:'ops/merchants'});
 h.find('select','Pending merchant application').props.onChange({target:{value:uuid}});h.render();
 h.find('textarea','Decision reason').props.onChange({target:{value:'Confirmed original decision'}});h.render();
 h.find('button','Approve application').props.onClick();await tick();h.render();events.length=0;
 h.find('button','Retry original decision').props.onClick();await tick();await tick();h.render();
 assert.deepEqual(events,['read']);assert.equal(writes,1);assert.match(h.text(),/Recorded decision: approved/);
 assert.equal(h.find('button','Retry original decision'),undefined);
});

test('moderator conflict comparison retains the authored reason and reads the latest selected application',async()=>{
 const row={id:uuid,companyName:'Synthetic company',contactName:'Synthetic contact',contactEmail:'synthetic@example.test',websiteUrl:'',pitch:'Original pitch',status:'pending',createdAt:'2026-10-10T19:00:00Z',decidedAt:null,decisionReason:null};
 const events=[];
 const h=await workspaceHarness('MerchantApplicationReview',{request:async(url,method='GET')=>{
  events.push([method,url]);
  if(method==='POST')return{ok:false,code:'CONFLICT',retryable:false,requestId:uuid};
  return url.includes('?id=')?{ok:true,data:{...row,pitch:'Latest submitted pitch'}}:{ok:true,data:{applications:[row],nextCursor:null}};
 }},{path:'ops/merchants'});
 h.find('select','Pending merchant application').props.onChange({target:{value:uuid}});h.render();
 h.find('textarea','Decision reason').props.onChange({target:{value:'Authored reason for comparison'}});h.render();
 h.find('button','Approve application').props.onClick();await tick();h.render();
 assert.equal(h.find('textarea','Decision reason').props.value,'Authored reason for comparison');events.length=0;
 h.find('button','Reload and compare').props.onClick();await tick();h.render();
 assert.equal(h.find('textarea','Decision reason')?.props.value,'Authored reason for comparison');
 assert.match(h.text(),/Latest submitted pitch/);assert.deepEqual(events,[['GET','/api/ops/merchant-applications?id='+uuid]]);
});

test('merchant conflict comparison retains review feedback and authored branch changes',async()=>{
 const detail={...mission,updatedAt:'2026-10-10T19:00:00Z',requiresApplication:true,canEdit:false,canClose:false,canReviewSubmissions:false,participants:[{id:uuid,creatorId:'creator-B',creatorName:'Synthetic applicant',creatorHandle:'',status:'applied',note:'',reviewNote:null,updatedAt:'2026-10-10T19:00:00Z'}],participantsNextCursor:null,submissionsNextCursor:null,affiliateRate:null,kinnsoRate:null};
 const directory={...empty,detail,branches:[{id:'22222222-2222-4222-8222-222222222222',name:'Central',active:true}],branchesNextCursor:null};
 const h=await workspaceHarness('MerchantCampaigns',{merchantCampaigns:{list:async()=>({ok:true,data:directory}),command:async()=>({ok:false,code:'CONFLICT',retryable:false,requestId:uuid})}});
 h.field('Application review feedback').props.onChange({target:{value:'Authored feedback'}});h.render();
 h.field('Updated branch name').props.onChange({target:{value:'Authored branch rename'}});h.render();
 h.field('Branch change reason').props.onChange({target:{value:'Authored branch reason'}});h.render();
 h.find('button','Approve application').props.onClick();await tick();h.render();
 h.find('button','Reload and compare').props.onClick();await tick();h.render();
 assert.equal(h.field('Application review feedback').props.value,'Authored feedback');
 assert.equal(h.field('Updated branch name').props.value,'Authored branch rename');
 assert.equal(h.field('Branch change reason').props.value,'Authored branch reason');
});
