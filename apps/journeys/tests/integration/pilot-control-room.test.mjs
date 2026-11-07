import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync, spawn} from 'node:child_process';
import {verifyTestTarget} from '../../scripts/verify-test-target.mjs';
import {pilotExecutionReadiness} from '../../lib/pilot/readiness.ts';

// No credentials or remote target overrides: authenticate SQL sessions with local
// synthetic Auth rows, then execute each public boundary as authenticated.
const target=verifyTestTarget();
assert.equal(target.projectRef,'kinnsoos-public-it-20261106');
assert.equal(target.apiOrigin,'http://127.0.0.1:59721');
assert.equal(target.dbContainer,'supabase_db_kinnsoos-public-it-20261106');
const args=['exec','-i',target.dbContainer,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'];
const sql=text=>execFileSync('docker',args,{input:text,encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe']}).trim();
const q=x=>`'${String(x).replaceAll("'","''")}'`;
const json=x=>`${q(JSON.stringify(x))}::jsonb`;
const asyncSql=input=>new Promise((resolve,reject)=>{
 const child=spawn('docker',args,{windowsHide:true,stdio:['pipe','pipe','pipe']});let out='',err='';
 child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);
 child.on('error',reject);child.on('close',status=>resolve({status,out,err}));child.stdin.end(input);
});
const ids=()=>Object.fromEntries(['ops','owner','mod','traveller','creator','merchant','other','run','slot','creatorSlot','merchantSlot','invite','guide','intake','request','check'].map(k=>[k,randomUUID()]));
function setup(i){return `
create function pg_temp.rpc(a uuid, statement text) returns jsonb language plpgsql as $$
declare result jsonb; begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','session_id',a)::text,true);
 set local role authenticated;
 execute statement into result;
 reset role; return result;
exception when others then reset role; raise; end $$;
create function pg_temp.ok(v boolean, label text) returns void language plpgsql as $$begin if v is distinct from true then raise exception 'assertion: %',label; end if;end $$;
create function pg_temp.denied(a uuid, statement text, expected text default null) returns void language plpgsql as $$
begin
 begin perform pg_temp.rpc(a,statement); exception when others then
 if expected in ('PILOT_REVIEW_REQUIRED','CONFLICT') and sqlerrm<>expected or expected not in ('PILOT_REVIEW_REQUIRED','CONFLICT') and position(lower(expected) in lower(sqlerrm))=0 then raise exception 'wrong denial: %, wanted %',sqlerrm,expected; end if; return; end;
 raise exception 'expected denial: %',statement; end $$;
insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) select id::uuid,id||'@pilot.test','{}','{}' from unnest(array[${['ops','owner','mod','traveller','creator','merchant','other'].map(k=>q(i[k])).join(',')}]) id;
update auth.users set email_confirmed_at=now() where id in (${['ops','owner','mod','traveller','creator','merchant','other'].map(k=>q(i[k])).join(',')});
insert into auth.sessions(id,user_id,created_at,updated_at) select id,id,now(),now() from auth.users where id in (${['ops','owner','mod','traveller','creator','merchant','other'].map(k=>q(i[k])).join(',')});
insert into public.kinnso_ops_members(id,user_id,display_name,role,status) values (${q(i.ops)},${q(i.ops)},'Synthetic admin','admin','active'),(${q(i.owner)},${q(i.owner)},'Synthetic owner','owner','active'),(${q(i.mod)},${q(i.mod)},'Synthetic moderator','moderator','active');
update public.creators set public_profile='{}'::jsonb,status='active',display_name='Synthetic pilot',handle='pilot-'||substr(id::text,1,8) where id in (${q(i.creator)},${q(i.traveller)});
`;}
const call=(i,c,actor='ops',request=randomUUID())=>`select public.admin_apply_kinnso_pilot_command(${q(request)},${json(c)})`;
const pc=(c,request=randomUUID())=>`select public.apply_kinnso_pilot_participant_command(${q(request)},${json({...c,requestId:request})})`;
const run=i=>({type:'createRun',id:i.run,name:'Synthetic pilot',dataClassification:'synthetic',candidateReleaseSha:'a'.repeat(40),environmentOrigin:'http://127.0.0.1:59721'});
const invoke=(i,c,actor='ops',req)=>`select pg_temp.rpc(${q(i[actor])},${q(call(i,c,actor,req))});`;
const manualCodes=['guide_discovered','trip_recovered','privacy_support','alert_owner','physical_ios','physical_android','voiceover','nvda'];
const manualCall=(i,code,reference)=>`format('select public.admin_apply_kinnso_pilot_command(%L,%L::jsonb)',gen_random_uuid(),jsonb_build_object('type','setManualCheck','id',(select id from kinnso_internal.pilot_checks where run_id=${q(i.run)} and code=${q(code)}),'expectedRevision',(select revision from kinnso_internal.pilot_checks where run_id=${q(i.run)} and code=${q(code)}),'status','pass','evidenceReference',${q(reference)},'observedSummary',${q('Synthetic observation: '+code)}))`;
const manualPass=(i,code,reference)=>`select pg_temp.rpc(${q(i.ops)},${manualCall(i,code,reference)});`;
function seed(i){return `
${invoke(i,run(i))}
update kinnso_internal.pilot_runs set status='running',acceptance_started_at=now()-interval '1 hour',participation_notice_version='participation-v1',privacy_notice_version='privacy-v1',content_consent_version='content-v1',participation_notice_digest=repeat('a',64),privacy_notice_digest=repeat('b',64),content_consent_digest=repeat('c',64),coordinator_reference='coordinator',support_owner_reference='support',privacy_owner_reference='privacy',alert_owner_reference='alerts',private_channel_reference='channel' where id=${q(i.run)};
insert into kinnso_internal.pilot_participants(id,run_id,role,pilot_cohort_role,display_label,user_id,status,consent_version,consent_digest,consented_at) values
(${q(i.slot)},${q(i.run)},'traveller','required_traveller','Traveller',${q(i.traveller)},'active','participation-v1',kinnso_internal.pilot_consent_identity((select r from kinnso_internal.pilot_runs r where id=${q(i.run)})),now()),
(${q(i.creatorSlot)},${q(i.run)},'creator','required_creator','Creator',${q(i.creator)},'active','participation-v1',kinnso_internal.pilot_consent_identity((select r from kinnso_internal.pilot_runs r where id=${q(i.run)})),now()),
(${q(i.merchantSlot)},${q(i.run)},'merchant','required_merchant','Merchant',${q(i.merchant)},'active','participation-v1',kinnso_internal.pilot_consent_identity((select r from kinnso_internal.pilot_runs r where id=${q(i.run)})),now());
`;}
function check(name,body){test(name,()=>{const i=ids();try{sql(`begin;${setup(i)}${body(i)}rollback;`);}catch(e){assert.fail(String(e.stderr||e.message));}});}
check('moderator reads only; admin and owner mutate; current role and session revoke access',i=>`
${invoke(i,run(i))}
select pg_temp.ok(pg_temp.rpc(${q(i.mod)},${q(`select public.get_kinnso_ops_pilot(${q(i.run)})`)})->'run'->>'id'=${q(i.run)},'moderator read');
select pg_temp.denied(${q(i.mod)},${q(call(i,{...run(i),id:randomUUID()}))},'FORBIDDEN');
${invoke(i,{...run(i),id:randomUUID()},'owner')}
update public.kinnso_ops_members set status='paused' where id=${q(i.mod)};
select pg_temp.denied(${q(i.mod)},${q(`select public.get_kinnso_ops_pilot(${q(i.run)})`)},'FORBIDDEN');
update auth.sessions set not_after=now()-interval '1 second' where id=${q(i.ops)};
select pg_temp.denied(${q(i.ops)},${q(`select public.get_kinnso_ops_pilot(${q(i.run)})`)});
`);
check('request replay preserves result, rejects changed digest and appends exactly one ops event',i=>`
create temp table receipt as select pg_temp.rpc(${q(i.ops)},${q(call(i,run(i),'ops',i.request))}) value;
select pg_temp.ok((select value->'_pilotReplay'='false'::jsonb from receipt) and (select value||'{"_pilotReplay":true}'::jsonb from receipt)=pg_temp.rpc(${q(i.ops)},${q(call(i,run(i),'ops',i.request))}),'same receipt');
select pg_temp.denied(${q(i.ops)},${q(call(i,{...run(i),name:'Different'},'ops',i.request))},'REQUEST_ID_REUSED');
select pg_temp.ok((select count(*)=1 from public.ops_audit_log where entity_id=${q(i.run)}),'one audit');
select pg_temp.ok((select count(*)>=18 from kinnso_internal.pilot_checks where run_id=${q(i.run)}),'default checks');
`);
check('real begin gates, immutable source and notice configuration, impossible terminal transitions',i=>`
${invoke(i,{...run(i),dataClassification:'real',environmentOrigin:'https://pilot.example.test'})}
select pg_temp.denied(${q(i.ops)},${q(call(i,{type:'setRunStatus',id:i.run,expectedRevision:1,status:'running',reason:'begin'}))},'CONFLICT');
select pg_temp.denied(${q(i.ops)},${q(call(i,{type:'configureRun',id:i.run,expectedRevision:1,candidateReleaseSha:'b'.repeat(40)}))},'INVALID');
select pg_temp.denied(${q(i.ops)},${q(call(i,{type:'setRunStatus',id:i.run,expectedRevision:1,status:'completed',reason:'skip'}))},'CONFLICT');
update kinnso_internal.pilot_runs set status='cancelled' where id=${q(i.run)};
select pg_temp.denied(${q(i.ops)},${q(call(i,{type:'setRunStatus',id:i.run,expectedRevision:1,status:'recruiting',reason:'reopen'}))},'CONFLICT');
`);
check('distinct required slots, withdrawal retains history and replacement inherits no identity',i=>`
${seed(i)}
select pg_temp.denied(${q(i.ops)},${q(call(i,{type:'addParticipant',id:randomUUID(),runId:i.run,role:'traveller',cohortRole:'required_traveller',displayLabel:'duplicate'}))});
${invoke(i,{type:'setParticipantStatus',id:i.slot,expectedRevision:1,status:'withdrawn',reason:'leave'})}
${invoke(i,{type:'addParticipant',id:i.other,runId:i.run,role:'traveller',cohortRole:'required_traveller',displayLabel:'Replacement'})}
select pg_temp.ok((select user_id is null and consented_at is null from kinnso_internal.pilot_participants where id=${q(i.other)}),'new identity');
select pg_temp.ok((select user_id=${q(i.traveller)} and status='withdrawn' from kinnso_internal.pilot_participants where id=${q(i.slot)}),'retained history');
select pg_temp.ok(pg_temp.rpc(${q(i.ops)},${q(`select public.get_kinnso_ops_pilot(${q(i.run)})`)})->'readiness'->>'executionComplete'='false','withdrawn readiness');
`);
check('participant self isolation, current suspension, forbidden identifiers and unknown commands',i=>`
${seed(i)}
select pg_temp.ok(pg_temp.rpc(${q(i.traveller)},'select public.get_kinnso_pilot_self()')->'participant'->>'id'=${q(i.slot)},'own slot');
select pg_temp.ok(pg_temp.rpc(${q(i.traveller)},'select public.get_kinnso_pilot_self()') =
 jsonb_build_object('run',jsonb_build_object('id',${q(i.run)}::uuid,'name','Synthetic pilot','status','running',
 'participationNoticeVersion','participation-v1','participationNoticeDigest',repeat('a',64),
 'privacyNoticeVersion','privacy-v1','privacyNoticeDigest',repeat('b',64)),
 'contentConsent',null,'intake',null,'intakes','[]'::jsonb,'acknowledgements',jsonb_build_object('notificationId',null,'supportCaseId',null),'workflowLinks',jsonb_build_object('merchant',null,'trip',null,'supportCaseId',null,'supportMissionId',null),
 'participant',jsonb_build_object('id',${q(i.slot)}::uuid,'revision',1,'role','traveller','status','active','consentVersion','participation-v1','consentDigest',
 (select consent_digest from kinnso_internal.pilot_participants where id=${q(i.slot)})),
 'nextStep',jsonb_build_object('code','open_workflow','href','/en/trips','messageKey','pilot.next.open_workflow'),
 'readiness',jsonb_build_object('stage','executing','readyToBegin',true,'executionComplete',false,'blockers','[]'::jsonb)),'strict self-only snapshot');
select pg_temp.denied(${q(i.traveller)},${q(pc({type:'acceptConsent',noticeVersion:'participation-v1',noticeDigest:'a'.repeat(64),privacyNoticeVersion:'privacy-v1',privacyNoticeDigest:'b'.repeat(64),runId:i.run}))},'INVALID');
select pg_temp.denied(${q(i.traveller)},${q(pc({type:'approveEverything'}))},'INVALID');
update public.creators set status='suspended' where id=${q(i.traveller)};
select pg_temp.denied(${q(i.traveller)},'select public.get_kinnso_pilot_self()','FORBIDDEN');
`);
const selfReadiness=(stage,readyToBegin,executionComplete,code)=>({
 stage,readyToBegin,executionComplete,blockers:code?[{code,category:'participation',messageKey:'pilot.readiness.'+code}]:[],
});
const expectSelf=(actor,stage,ready,complete,blocker,next)=>`
 create temp table self_state as select pg_temp.rpc(${q(actor)},'select public.get_kinnso_pilot_self()') value;
 select pg_temp.ok((select value->'readiness'=${json(selfReadiness(stage,ready,complete,blocker))}
 and value#>>'{nextStep,code}' is not distinct from ${next?q(next):'null'} from self_state),${q(blocker??stage)});
 drop table self_state;
`;
check('participant readiness distinguishes unavailable, invited, consent and activation',i=>`
 ${seed(i)}
 ${expectSelf(i.other,'blocked',false,false,'participant_unavailable',null)}
 update kinnso_internal.pilot_runs set status='recruiting' where id=${q(i.run)};
 update kinnso_internal.pilot_participants set status='invited',consent_version=null,consented_at=null where id=${q(i.slot)};
 ${expectSelf(i.traveller,'setup_incomplete',false,false,'invitation_required',null)}
 update kinnso_internal.pilot_participants set status='joined' where id=${q(i.slot)};
 ${expectSelf(i.traveller,'setup_incomplete',false,false,'consent_required','accept_consent')}
 update kinnso_internal.pilot_participants set consent_version='participation-v1',consented_at=now() where id=${q(i.slot)};
 ${expectSelf(i.traveller,'setup_incomplete',false,false,'participant_not_active',null)}
`);
check('only an active current-consent slot in a running run can begin workflow',i=>`
 ${seed(i)}
 ${expectSelf(i.traveller,'executing',true,false,null,'open_workflow')}
 update kinnso_internal.pilot_participants set consent_version='outdated' where id=${q(i.slot)};
 ${expectSelf(i.traveller,'setup_incomplete',false,false,'consent_required',null)}
 update kinnso_internal.pilot_participants set consent_version='participation-v1',status='paused' where id=${q(i.slot)};
 ${expectSelf(i.traveller,'blocked',false,false,'participant_paused',null)}
 update kinnso_internal.pilot_participants set status='active' where id=${q(i.slot)};
 update kinnso_internal.pilot_runs set status='paused' where id=${q(i.run)};
 ${expectSelf(i.traveller,'blocked',false,false,'run_paused',null)}
 update kinnso_internal.pilot_runs set status='recruiting' where id=${q(i.run)};
 ${expectSelf(i.traveller,'blocked',false,false,'run_not_running',null)}
`);
check('completion is self-scoped; withdrawn and cancelled cannot complete',i=>`
 ${seed(i)}
 update kinnso_internal.pilot_runs set status='completed' where id=${q(i.run)};
 ${expectSelf(i.traveller,'blocked',false,false,'run_completed',null)}
 update kinnso_internal.pilot_participants set status='completed' where id=${q(i.slot)};
 ${expectSelf(i.traveller,'completed',false,true,null,null)}
 ${expectSelf(i.creator,'blocked',false,false,'run_completed',null)}
 update kinnso_internal.pilot_participants set status='withdrawn' where id=${q(i.slot)};
 ${expectSelf(i.traveller,'blocked',false,false,'participant_withdrawn',null)}
 update kinnso_internal.pilot_runs set status='cancelled' where id=${q(i.run)};
 ${expectSelf(i.creator,'blocked',false,false,'run_cancelled',null)}
`);
check('historical participant display and replay return only safe state',i=>{
 const command=pc({type:'acceptConsent',noticeVersion:'participation-v1',noticeDigest:'a'.repeat(64),privacyNoticeVersion:'privacy-v1',privacyNoticeDigest:'b'.repeat(64)},i.request);
 return `
 ${seed(i)}
 update kinnso_internal.pilot_participants set consented_at=null,consent_version=null where id=${q(i.slot)};
 select pg_temp.rpc(${q(i.traveller)},${q(command)});
 -- Simulate a receipt created by the superseded draft migration.
 update kinnso_internal.requests set result=jsonb_set(result,'{snapshot,facts}',jsonb_build_object('privateSlot',${q(i.creatorSlot)}::uuid))
 where actor_id=${q(i.traveller)} and request_id=${q(i.request)};
 ${['completed','withdrawn'].map(status=>`
 update kinnso_internal.pilot_participants set status=${q(status)} where id=${q(i.slot)};
 create temp table ${status}_self as select pg_temp.rpc(${q(i.traveller)},'select public.get_kinnso_pilot_self()') value;
 select pg_temp.ok((select value->'participant'->>'status'=${q(status)} and value->'nextStep'='null'::jsonb
 and value->'readiness'->>'stage'=${q(status==='completed'?'completed':'blocked')} and not (value ?| array['facts','beginFacts','participants','checks']) from ${status}_self),'safe terminal read');
 select pg_temp.ok((select value from ${status}_self)=pg_temp.rpc(${q(i.traveller)},${q(command)})->'snapshot','safe terminal replay');
 `).join('')}
 select pg_temp.ok((select count(*)=1 from kinnso_internal.pilot_participant_audit where participant_id=${q(i.slot)}),'no replay audit');
 `;
});
check('claim response and replay stay scoped to the locked run and slot',i=>{
 const newer=randomUUID(),slot=randomUUID(),code='x'.repeat(64),command=pc({type:'claimInvite',code},i.request);
 return `
 ${seed(i)}
 -- Model overlapping runs inside this rolled-back fixture only.
 drop index kinnso_internal.pilot_runs_one_active_idx;
 ${invoke(i,{...run(i),id:newer,name:'Newer run'})}
 update kinnso_internal.pilot_runs set status='recruiting' where id=${q(newer)};
 insert into kinnso_internal.pilot_participants(id,run_id,role,pilot_cohort_role,display_label,user_id,status,created_at)
 values(${q(slot)},${q(newer)},'traveller','required_traveller','Newer slot',${q(i.traveller)},'joined',now()+interval '1 minute');
 update kinnso_internal.pilot_participants set user_id=null,status='invited',consent_version=null,consented_at=null where id=${q(i.slot)};
 insert into kinnso_internal.pilot_invites(id,participant_id,code_hash,expires_at,created_by_ops_member_id)
 values(${q(i.invite)},${q(i.slot)},extensions.digest(${q(code)},'sha256'),now()+interval '1 hour',${q(i.ops)});
 create temp table claimed as select pg_temp.rpc(${q(i.traveller)},${q(command)}) value;
 select pg_temp.ok((select value#>>'{snapshot,run,id}'=${q(i.run)} and value#>>'{snapshot,participant,id}'=${q(i.slot)} from claimed),'claim is scoped to command run');
 select pg_temp.ok((select value->'_pilotReplay'='false'::jsonb from claimed) and (select value||'{"_pilotReplay":true}'::jsonb from claimed)=pg_temp.rpc(${q(i.traveller)},${q(command)}),'scoped claim replay');
 select pg_temp.ok(pg_temp.rpc(${q(i.traveller)},'select public.get_kinnso_pilot_self()')#>>'{run,id}'=${q(newer)},'unscoped read still selects newer run');
 `;
});
check('invite first response only, replay redaction, consumed/revoked/expired denial and actor audit',i=>`
${seed(i)}
update kinnso_internal.pilot_participants set user_id=null,status='invited',consent_version=null,consented_at=null where id=${q(i.slot)};
create temp table invite as select pg_temp.rpc(${q(i.ops)},${q(call(i,{type:'createInvite',id:i.invite,participantId:i.slot,expectedRevision:1,expiresInHours:1},'ops',i.request))}) value;
select pg_temp.ok(length((select value->>'inviteCode' from invite))>=43,'entropy');
select pg_temp.ok(not(pg_temp.rpc(${q(i.ops)},${q(call(i,{type:'createInvite',id:i.invite,participantId:i.slot,expectedRevision:1,expiresInHours:1},'ops',i.request))}) ? 'inviteCode'),'no replay secret');
select pg_temp.ok(not exists(select 1 from kinnso_internal.requests where position((select value->>'inviteCode' from invite) in result::text)>0),'no stored code');
select pg_temp.rpc(${q(i.traveller)},format('select public.apply_kinnso_pilot_participant_command(%L,%L::jsonb)',${q(randomUUID())},jsonb_build_object('type','claimInvite','requestId',${q(randomUUID())},'code',(select value->>'inviteCode' from invite))- 'requestId'));
select pg_temp.denied(${q(i.other)},format('select public.apply_kinnso_pilot_participant_command(%L,%L::jsonb)',${q(randomUUID())},jsonb_build_object('type','claimInvite','code',(select value->>'inviteCode' from invite))));
select pg_temp.ok((select count(*)=1 from kinnso_internal.pilot_participant_audit where participant_id=${q(i.slot)} and actor_user_id=${q(i.traveller)}),'accurate participant audit');
`);
check('pause rejects intake, acknowledgements, manual evidence, claims and linked publication',i=>`
${seed(i)}update kinnso_internal.pilot_runs set status='paused' where id=${q(i.run)};
${['acceptConsent','submitContentIntake','acknowledgeNotification','acknowledgeSupportResponse'].map(type=>`select pg_temp.denied(${q(i.creator)},${q(pc({type,...(type==='acceptConsent'?{noticeVersion:'participation-v1',noticeDigest:'a'.repeat(64),privacyNoticeVersion:'privacy-v1',privacyNoticeDigest:'b'.repeat(64)}:type==='submitContentIntake'?{intake:content}: {})}))});`).join('\n')}
select pg_temp.denied(${q(i.ops)},${q(call(i,{type:'addEvidenceReference',runId:i.run,checkCode:'privacy_support',entityType:'guide',entityId:i.guide,evidenceReference:'ref:1'}))},'CONFLICT');
select pg_temp.denied(${q(i.ops)},format('select public.admin_apply_kinnso_pilot_command(%L,%L::jsonb)',${q(randomUUID())},jsonb_build_object('type','setManualCheck','id',(select id from kinnso_internal.pilot_checks where run_id=${q(i.run)} and code='physical_ios'),'expectedRevision',1,'status','pass','evidenceReference','ref:1','observedSummary','Observed')),'CONFLICT');
`);
const content={title:'Synthetic guide',destination:'Kyoto',authoredLocale:'en',sourceSummary:'Synthetic original work',sourceUrls:[],rightsBasis:'original',rightsEvidenceReference:'ref:1',authorConsentVersion:'content-v1',authorConsentDigest:'c'.repeat(64),coverRightsConfirmed:null,coverRightsEvidenceReference:null};
const draft={title:'Synthetic guide',city:'Kyoto',summary:'Synthetic summary',content:{days:[{offset:0,title:'Day one',stops:[{title:'Stop',description:'Synthetic',placeId:null,startMinuteOfDay:600,durationMinutes:60}]}]}};
const approval=(guide, id, revision, reason, overrides='{}')=>
 `format('select public.admin_apply_kinnso_pilot_command(%L,%L::jsonb)',gen_random_uuid(),${json({type:'reviewContentIntake',id,expectedRevision:revision,decision:'approve',reason})}||
  (select jsonb_build_object('expectedDraftRevision',d.revision,'expectedContentDigest',kinnso_internal.pilot_review_digest(d.payload,i)) from kinnso_internal.guide_drafts d join kinnso_internal.pilot_content_intakes i on i.guide_id=d.guide_id where d.guide_id=${q(guide)})||${q(overrides)}::jsonb)`;
function contentSeed(i,initialize=true){return `${initialize?seed(i):''}
select pg_temp.rpc(${q(i.creator)},${q(`select public.save_kinnso_guide_draft(${q(i.guide)},0,${q(randomUUID())},${json(draft)})`)});
select pg_temp.rpc(${q(i.creator)},${q(pc({type:'submitContentIntake',intake:content}))});
update kinnso_internal.pilot_content_intakes set id=${q(i.intake)} where run_id=${q(i.run)} and creator_participant_id=${q(i.creatorSlot)} and guide_id is null;
${invoke(i,{type:'bindGuide',intakeId:i.intake,guideId:i.guide,expectedRevision:1})}
select pg_temp.rpc(${q(i.ops)},${approval(i.guide,i.intake,2,'Rights and content reviewed')});
`;}
check('approval pins revision/digest; edits invalidate publish; paused publish and legacy bypass fail',i=>`
${contentSeed(i)}
select pg_temp.ok((select guide_draft_revision=1 and length(content_digest)=64 from kinnso_internal.pilot_content_intakes where id=${q(i.intake)}),'exact approval');
update kinnso_internal.pilot_content_intakes set content_digest=repeat('0',64) where id=${q(i.intake)};
select pg_temp.denied(${q(i.creator)},${q(`select public.publish_kinnso_pilot_guide_draft(${q(i.guide)},1,${q(randomUUID())})`)},'PILOT_REVIEW_REQUIRED');
update kinnso_internal.pilot_content_intakes set content_digest=(select kinnso_internal.pilot_review_digest(d.payload,i) from kinnso_internal.guide_drafts d join kinnso_internal.pilot_content_intakes i on i.guide_id=d.guide_id where d.guide_id=${q(i.guide)}) where id=${q(i.intake)};
select pg_temp.denied(${q(i.creator)},${q(`select public.publish_kinnso_pilot_guide_draft(${q(i.guide)},2,${q(randomUUID())})`)},'CONFLICT');
update kinnso_internal.pilot_runs set status='paused' where id=${q(i.run)};
select pg_temp.denied(${q(i.creator)},${q(`select public.publish_kinnso_pilot_guide_draft(${q(i.guide)},1,${q(randomUUID())})`)},'CONFLICT');
select pg_temp.denied(${q(i.creator)},${q(`select public.publish_kinnso_guide_draft(${q(i.guide)},1,${q(randomUUID())})`)});
select pg_temp.denied(${q(i.creator)},${q(`update public.guides set status='published',published_at=now() where id=${q(i.guide)} returning to_jsonb(guides)`)},'CONFLICT');
update kinnso_internal.pilot_runs set status='running' where id=${q(i.run)};
select pg_temp.rpc(${q(i.creator)},${q(`select public.save_kinnso_guide_draft(${q(i.guide)},1,${q(randomUUID())},${json({...draft,title:'Changed'})})`)});
select pg_temp.denied(${q(i.creator)},${q(`select public.publish_kinnso_pilot_guide_draft(${q(i.guide)},2,${q(randomUUID())})`)},'PILOT_REVIEW_REQUIRED');
`);
check('publishing delegates non-pilot and binds exact pilot version/digest with replay and facts',i=>`
${contentSeed(i)}
create temp table published as select pg_temp.rpc(${q(i.creator)},${q(`select public.publish_kinnso_pilot_guide_draft(${q(i.guide)},1,${q(i.request)})`)}) value;
select pg_temp.ok((select value->>'runId'=${q(i.run)} and value->>'contentIntakeId'=${q(i.intake)} from published),'confirmed pilot binding');
select pg_temp.ok((select value->'_pilotReplay'='false'::jsonb from published) and (select value||'{"_pilotReplay":true}'::jsonb from published)=pg_temp.rpc(${q(i.creator)},${q(`select public.publish_kinnso_pilot_guide_draft(${q(i.guide)},1,${q(i.request)})`)}),'publish replay');
select pg_temp.ok((select status='published' and reviewed_guide_version=1 from kinnso_internal.pilot_content_intakes where id=${q(i.intake)}),'publication link');
select pg_temp.ok(pg_temp.rpc(${q(i.ops)},${q(`select public.get_kinnso_ops_pilot(${q(i.run)})`)})->'facts'->'publications'->0 ?& array['publishedContentDigest','publishedVersion','currentDraftRevision','currentContentDigest'],'publication facts');
select pg_temp.rpc(${q(i.creator)},${q(`select public.save_kinnso_guide_draft(${q(i.other)},0,${q(randomUUID())},${json(draft)})`)});
select pg_temp.ok((select value ?& array['draft','snapshot'] from published),'delegate fields retained');
select pg_temp.ok((select count(*)=1 from kinnso_internal.pilot_participant_audit where entity_id=${q(i.guide)} and command_type='publishGuide'),'one publication audit across replay');
select pg_temp.denied(${q(i.creator)},${q(`select public.publish_kinnso_pilot_guide_draft(${q(i.other)},2,${q(randomUUID())})`)},'revision_conflict');
create temp table ordinary as select pg_temp.rpc(${q(i.creator)},${q(`select public.publish_kinnso_pilot_guide_draft(${q(i.other)},1,${q(i.check)})`)}) value;
select pg_temp.ok((select value ?& array['draft','snapshot'] and not(value ?| array['runId','contentIntakeId','_pilotReplay']) from ordinary),'ordinary delegate shape');
select pg_temp.ok((select value from ordinary)=pg_temp.rpc(${q(i.creator)},${q(`select public.publish_kinnso_pilot_guide_draft(${q(i.other)},1,${q(i.check)})`)}),'ordinary replay');
`);
check('manual pass requires in-window evidence and derived checks cannot be set',i=>`
${seed(i)}
select pg_temp.denied(${q(i.ops)},format('select public.admin_apply_kinnso_pilot_command(%L,%L::jsonb)',${q(randomUUID())},jsonb_build_object('type','setManualCheck','id',(select id from kinnso_internal.pilot_checks where run_id=${q(i.run)} and code='physical_ios'),'expectedRevision',1,'status','pass','evidenceReference',null,'observedSummary',null)),'INVALID');
select pg_temp.denied(${q(i.ops)},format('select public.admin_apply_kinnso_pilot_command(%L,%L::jsonb)',${q(randomUUID())},jsonb_build_object('type','setManualCheck','id',(select id from kinnso_internal.pilot_checks where run_id=${q(i.run)} and code='creator_public'),'expectedRevision',1,'status','pass','evidenceReference','ref:1','observedSummary','No')),'INVALID');
update kinnso_internal.pilot_runs set acceptance_started_at=now()+interval '1 hour' where id=${q(i.run)};
select pg_temp.denied(${q(i.ops)},format('select public.admin_apply_kinnso_pilot_command(%L,%L::jsonb)',${q(randomUUID())},jsonb_build_object('type','setManualCheck','id',(select id from kinnso_internal.pilot_checks where run_id=${q(i.run)} and code='physical_ios'),'expectedRevision',1,'status','pass','evidenceReference','ref:1','observedSummary','Observed')),'CONFLICT');
`);
check('cross-run and unowned guide, mission and support references fail',i=>`
${seed(i)}
select pg_temp.denied(${q(i.ops)},${q(call(i,{type:'bindCollaboration',id:i.other,runId:i.run,merchantParticipantId:i.merchantSlot,creatorParticipantId:i.merchantSlot,missionId:randomUUID()}))},'INVALID');
${['guide','mission','support_case'].map(entityType=>`select pg_temp.denied(${q(i.ops)},${q(call(i,{type:'addEvidenceReference',runId:i.run,checkCode:'support_resolved',entityType,entityId:randomUUID(),evidenceReference:'ref:1'}))});`).join('\n')}
`);
check('internal tables and helper functions deny direct authenticated and service-role access',i=>`
${seed(i)}
select pg_temp.denied(${q(i.traveller)},${q(`insert into kinnso_internal.pilot_checks(run_id,code,category) values (${q(i.run)},'fake','manual') returning to_jsonb(pilot_checks)`)},'permission denied');
select pg_temp.ok(not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join unnest(array['anon','authenticated','service_role']) role where n.nspname='kinnso_internal' and c.relname like 'pilot_%' and c.relkind='r' and (has_table_privilege(role,c.oid,'SELECT') or has_table_privilege(role,c.oid,'INSERT') or has_table_privilege(role,c.oid,'UPDATE') or has_table_privilege(role,c.oid,'DELETE'))),'private tables');
select pg_temp.ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='kinnso_internal' and p.proname like 'pilot_%' and has_function_privilege('authenticated',p.oid,'EXECUTE')),'private helpers');
`);
check('revoked and expired codes fail; pause blocks valid claims; same user cannot occupy two slots',i=>`
${seed(i)}
update kinnso_internal.pilot_participants set user_id=null,status='invited',consent_version=null,consented_at=null where id=${q(i.slot)};
insert into kinnso_internal.pilot_invites(id,participant_id,code_hash,status,expires_at,created_by_ops_member_id) values
(${q(i.invite)},${q(i.slot)},extensions.digest(repeat('x',64),'sha256'),'revoked',now()+interval '1 hour',${q(i.ops)});
select pg_temp.denied(${q(i.other)},${q(pc({type:'claimInvite',code:'x'.repeat(64)}))},'CONFLICT');
update kinnso_internal.pilot_invites set status='active',created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' where id=${q(i.invite)};
select pg_temp.denied(${q(i.other)},${q(pc({type:'claimInvite',code:'x'.repeat(64)}))},'CONFLICT');
update kinnso_internal.pilot_invites set expires_at=now()+interval '1 hour' where id=${q(i.invite)};
update kinnso_internal.pilot_runs set status='paused' where id=${q(i.run)};
select pg_temp.denied(${q(i.other)},${q(pc({type:'claimInvite',code:'x'.repeat(64)}))},'CONFLICT');
update kinnso_internal.pilot_runs set status='running' where id=${q(i.run)};
select pg_temp.denied(${q(i.creator)},${q(pc({type:'claimInvite',code:'x'.repeat(64)}))},'CONFLICT');
`);
check('enrolled notices are immutable; rehearsal must be completed synthetic on exact release',i=>{
 const config={type:'configureRun',id:i.run,expectedRevision:1,participationNoticeVersion:'changed',participationNoticeDigest:'a'.repeat(64),privacyNoticeVersion:'privacy-v1',privacyNoticeDigest:'b'.repeat(64),contentConsentVersion:'content-v1',contentConsentDigest:'c'.repeat(64),coordinatorReference:'coordinator',supportOwnerReference:'support',privacyOwnerReference:'privacy',alertOwnerReference:'alerts',privateChannelReference:'channel',syntheticRehearsalRunId:null};
 return `${seed(i)}select pg_temp.denied(${q(i.ops)},${q(call(i,config))},'CONFLICT');
 update kinnso_internal.pilot_runs set status='draft',data_classification='real',environment_origin='https://pilot.example.test' where id=${q(i.run)};
 delete from kinnso_internal.pilot_participants where run_id=${q(i.run)};
 select pg_temp.denied(${q(i.ops)},${q(call(i,{...config,syntheticRehearsalRunId:randomUUID()}))},'CONFLICT');`;
});
test('two concurrent claims have one winner and leave no test records',async()=>{
 const i=ids(),code=randomUUID().replaceAll('-','')+randomUUID().replaceAll('-','');
 const asyncSql=input=>new Promise(resolve=>{const child=spawn('docker',args,{windowsHide:true,stdio:['pipe','pipe','pipe']});let out='',err='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);child.on('close',status=>resolve({status,out,err}));child.stdin.end(input);});
 let seeded=false;
 try {
  sql(`begin;${setup(i)}${seed(i)}update kinnso_internal.pilot_participants set user_id=null,status='invited',consent_version=null,consented_at=null where id=${q(i.slot)};insert into kinnso_internal.pilot_invites(id,participant_id,code_hash,expires_at,created_by_ops_member_id) values(${q(i.invite)},${q(i.slot)},extensions.digest(${q(code)},'sha256'),now()+interval '1 hour',${q(i.ops)});commit;`);
  seeded=true;
  const results=await Promise.all([i.traveller,i.other].map(a=>asyncSql(`begin;set local role authenticated;select set_config('request.jwt.claims',${json({sub:a,role:'authenticated',session_id:a})}::text,true);${pc({type:'claimInvite',code})};commit;`)));
  assert.equal(results.filter(x=>x.status===0).length,1,results.map(x=>x.err).join('\n'));
  assert.equal(sql(`select count(*) from kinnso_internal.pilot_participant_audit where participant_id=${q(i.slot)} and command_type='claimInvite'`),'1');
 } finally {
  // Delete only UUIDs generated by this test, including receipts and both audit paths.
  if(seeded) sql(`begin;delete from kinnso_internal.pilot_participant_audit where run_id=${q(i.run)};delete from kinnso_internal.pilot_invites where participant_id in(select id from kinnso_internal.pilot_participants where run_id=${q(i.run)});delete from kinnso_internal.pilot_checks where run_id=${q(i.run)};delete from kinnso_internal.pilot_participants where run_id=${q(i.run)};delete from kinnso_internal.pilot_runs where id=${q(i.run)};delete from public.ops_audit_log where actor_ops_member_id in(${q(i.ops)},${q(i.owner)},${q(i.mod)});delete from auth.users where id in(${['ops','owner','mod','traveller','creator','merchant','other'].map(k=>q(i[k])).join(',')});commit;`);
 }
});
test('publication cannot reuse approval after a concurrent identical-content rebind',async()=>{
 const i=ids(),otherGuide=randomUUID(),publisher='pilot-publish-'+i.request, rebinder='pilot-rebind-'+i.request;
 const users=['ops','owner','mod','traveller','creator','merchant','other'].map(k=>q(i[k])).join(',');
 let seeded=false,rebind,publish;
 try {
  sql(`begin;${setup(i)}${contentSeed(i)}
  select pg_temp.rpc(${q(i.creator)},${q(`select public.save_kinnso_guide_draft(${q(otherGuide)},0,${q(randomUUID())},${json(draft)})`)});
  commit;`);
  seeded=true;
  rebind=asyncSql(`set application_name=${q(rebinder)};begin;
  select id from kinnso_internal.pilot_runs where id=${q(i.run)} for update;
  do $$begin for attempt in 1..120 loop
   perform pg_stat_clear_snapshot();
   if exists(select 1 from pg_stat_activity where application_name=${q(publisher)} and wait_event_type='Lock') then return;end if;
   perform pg_sleep(0.05);
  end loop;raise exception 'publisher never waited for run lock';end$$;
  set local role authenticated;
  select set_config('request.jwt.claims',${json({sub:i.ops,role:'authenticated',session_id:i.ops})}::text,true);
  ${call(i,{type:'bindGuide',intakeId:i.intake,guideId:otherGuide,expectedRevision:3})};
  reset role;
  do $$declare statement text:=${approval(otherGuide,i.intake,4,'Reviewed replacement guide')}; begin set local role authenticated; execute statement; end$$;
  commit;`);
  let locked=false;
  for(let attempt=0;attempt<50&&!locked;attempt++){
   locked=sql(`select exists(select 1 from pg_stat_activity where application_name=${q(rebinder)} and wait_event='PgSleep')`)==='t';
  }
  assert.equal(locked,true,'rebind session owns the run lock');
  publish=asyncSql(`set application_name=${q(publisher)};begin;
  set local role authenticated;
  select set_config('request.jwt.claims',${json({sub:i.creator,role:'authenticated',session_id:i.creator})}::text,true);
  select public.publish_kinnso_pilot_guide_draft(${q(i.guide)},1,${q(i.request)});commit;`);
  const [changed,attempt]=await Promise.all([rebind,publish]);
  assert.equal(changed.status,0,changed.err);
  assert.equal(attempt.status,3,'stale binding must reject publication');
  assert.match(attempt.err,/ERROR:\s+CONFLICT\r?\n/);
  assert.doesNotMatch(attempt.err,/PILOT_REVIEW_REQUIRED/);
  assert.equal(sql(`select status||':'||guide_id from kinnso_internal.pilot_content_intakes where id=${q(i.intake)}`),'approved:'+otherGuide);
  assert.equal(sql(`select count(*) from public.guide_versions where guide_id in (${q(i.guide)},${q(otherGuide)})`),'0');
  assert.equal(sql(`select count(*) from kinnso_internal.pilot_participant_audit where run_id=${q(i.run)} and command_type='publishGuide'`),'0');
 } finally {
  await Promise.allSettled([rebind,publish].filter(Boolean));
  if(seeded) sql(`begin;
  delete from kinnso_internal.pilot_participant_audit where run_id=${q(i.run)};
  delete from kinnso_internal.pilot_content_intakes where run_id=${q(i.run)};
  delete from kinnso_internal.pilot_checks where run_id=${q(i.run)};
  delete from kinnso_internal.pilot_participants where run_id=${q(i.run)};
  delete from kinnso_internal.pilot_runs where id=${q(i.run)};
  delete from public.ops_audit_log where actor_ops_member_id=${q(i.ops)};
  delete from public.guides where id in (${q(i.guide)},${q(otherGuide)});
  delete from auth.users where id in (${users});commit;`);
 }
});
check('equivalent participant UUID spellings cannot bind collaboration',i=>`
${seed(i)}select pg_temp.denied(${q(i.ops)},${q(call(i,{type:'bindCollaboration',id:randomUUID(),runId:i.run,merchantParticipantId:i.merchantSlot.toUpperCase(),creatorParticipantId:i.merchantSlot.toLowerCase(),missionId:randomUUID()}))},'INVALID');`);

function executionSeed(i,initialize=true){
 const mission=randomUUID(),milestone=randomUUID(),mp=randomUUID(),sub=randomUUID(),merchant=randomUUID(),trip=randomUUID(),support=randomUUID();
 return `${contentSeed(i,initialize)}
 select pg_temp.rpc(${q(i.creator)},${q(`select public.publish_kinnso_pilot_guide_draft(${q(i.guide)},1,${q(randomUUID())})`)});
 ${[0,1].map(()=>{const guide=randomUUID();return `
 select pg_temp.rpc(${q(i.creator)},${q(`select public.save_kinnso_guide_draft(${q(guide)},0,${q(randomUUID())},${json(draft)})`)});
 select pg_temp.rpc(${q(i.creator)},${q(pc({type:'submitContentIntake',intake:{...content,rightsEvidenceReference:'ref:'+guide}}))});
 select pg_temp.rpc(${q(i.ops)},format('select public.admin_apply_kinnso_pilot_command(%L,%L::jsonb)',${q(randomUUID())},jsonb_build_object('type','bindGuide','intakeId',(select id from kinnso_internal.pilot_content_intakes where run_id=${q(i.run)} and guide_id is null),'guideId',${q(guide)},'expectedRevision',1)));
 select pg_temp.rpc(${q(i.ops)},format('select public.admin_apply_kinnso_pilot_command(%L,%L::jsonb)',${q(randomUUID())},jsonb_build_object('type','reviewContentIntake','id',(select id from kinnso_internal.pilot_content_intakes where guide_id=${q(guide)}),'expectedRevision',2,'decision','approve','reason','Reviewed','expectedDraftRevision',(select revision from kinnso_internal.guide_drafts where guide_id=${q(guide)}),'expectedContentDigest',(select kinnso_internal.pilot_review_digest(d.payload,i) from kinnso_internal.guide_drafts d join kinnso_internal.pilot_content_intakes i on i.guide_id=d.guide_id where d.guide_id=${q(guide)}))));
 select pg_temp.rpc(${q(i.creator)},${q(`select public.publish_kinnso_pilot_guide_draft(${q(guide)},1,${q(randomUUID())})`)});`;}).join('\n')}
 insert into public.merchant_profiles(id,user_id,company_name,contact_email,status) values(${q(merchant)},${q(i.merchant)},'Synthetic merchant','merchant@pilot.test','active') on conflict(user_id) do nothing;
 insert into public.merchant_applications(user_id,company_name,contact_email,status,decided_at) values(${q(i.merchant)},'Synthetic merchant','merchant@pilot.test','approved',now());
 insert into public.missions(id,merchant_profile_id,title,summary,mission_type,status,published_at) values(${q(mission)},(select id from public.merchant_profiles where user_id=${q(i.merchant)}),'Synthetic mission','Synthetic','paid','draft',null);
 ${invoke(i,{type:'bindCollaboration',id:randomUUID(),runId:i.run,merchantParticipantId:i.merchantSlot,creatorParticipantId:i.creatorSlot,missionId:mission})}
 insert into public.mission_milestones(id,mission_id,title,description) values(${q(milestone)},${q(mission)},'Synthetic milestone','Synthetic');
 insert into public.mission_milestones(id,mission_id,title,description) values(${q(i.check)},${q(mission)},'Second synthetic milestone','Synthetic');
 update public.missions set status='published',published_at=now() where id=${q(mission)};
 insert into public.mission_participants(id,mission_id,creator_id,status,source,approved_at) values(${q(mp)},${q(mission)},${q(i.creator)},'active','application',now());
 insert into public.mission_milestone_submissions(id,mission_milestone_id,mission_participant_id,status) values(${q(sub)},${q(milestone)},${q(mp)},'submitted');
 update public.mission_milestone_submissions set status='revision_requested' where id=${q(sub)};
 update public.mission_milestone_submissions set status='approved',reviewed_at=now() where id=${q(sub)};
 select pg_temp.rpc(${q(i.creator)},${q(pc({type:'acknowledgeNotification'}))});
 insert into public.guide_saves(guide_id,traveler_user_id) values(${q(i.guide)},${q(i.traveller)});
 insert into public.trips(id,owner_user_id,title,timezone,head_revision_no) values(${q(trip)},${q(i.traveller)},'Synthetic trip','Asia/Tokyo',1);
 select pg_temp.rpc(${q(i.traveller)},${q(`select public.adopt_guide_to_trip(${q(i.guide)},1,${q(trip)},1,${q(randomUUID())})`)});
 insert into public.trip_revisions(trip_id,revision_no,change_kind,created_at) values(${q(trip)},3,'edit',clock_timestamp());
 insert into kinnso_internal.support_cases(id,recipient_id,subject,mission_id,status) values(${q(support)},${q(i.traveller)},'Synthetic support',${q(mission)},'resolved');
 insert into kinnso_internal.support_messages(case_id,actor_id,message) values(${q(support)},${q(i.ops)},'Synthetic response');
 ${invoke(i,{type:'addEvidenceReference',runId:i.run,checkCode:'support_resolved',entityType:'support_case',entityId:support,evidenceReference:'ref:'+support})}
 select pg_temp.rpc(${q(i.traveller)},${q(pc({type:'acknowledgeSupportResponse'}))});
 ${initialize?`select pg_temp.ok(pg_temp.rpc(${q(i.traveller)},'select public.get_kinnso_pilot_self()')->'workflowLinks' =
  jsonb_build_object('trip','/en/trips/'||${q(trip)},'supportCaseId',${q(support)},'supportMissionId',${q(mission)},'merchant',null),'traveller canonical links');
 select pg_temp.ok(pg_temp.rpc(${q(i.merchant)},'select public.get_kinnso_pilot_self()')->'workflowLinks' =
  jsonb_build_object('trip',null,'supportCaseId',null,'supportMissionId',${q(mission)},'merchant','/en/merchant/campaigns/'||${q(mission)}),'merchant canonical link');`:''}
 ${manualCodes.map(code=>{
  const entityType=code==='guide_discovered'?'guide':code==='trip_recovered'?'trip':'manual';
  const entityId=entityType==='guide'?i.guide:entityType==='trip'?trip:i.run;
  const reference='ref:'+randomUUID();
  return invoke(i,{type:'addEvidenceReference',runId:i.run,checkCode:code,entityType,entityId,participantId:entityType==='manual'?null:i.slot,evidenceReference:reference})+manualPass(i,code,reference);
 }).join('\n')}
 `;
}
test('authoritative facts satisfy the readiness evaluator and permit explicit completion',()=>{
 const i=ids();let output;
 try {output=sql(`begin;${setup(i)}${executionSeed(i)}
 select 'SELF:'||pg_temp.rpc(${q(i.traveller)},'select public.get_kinnso_pilot_self()')::text;
 select 'FACTS:'||pg_temp.rpc(${q(i.ops)},${q(`select public.get_kinnso_ops_pilot(${q(i.run)})`)})::text;
 ${invoke(i,{type:'setRunStatus',id:i.run,expectedRevision:1,status:'completed',reason:'Coordinator confirms synthetic acceptance'})}
 select pg_temp.ok((select count(*) from public.ops_audit_log where actor_ops_member_id=${q(i.ops)})=(select count(*) from kinnso_internal.requests where actor_id=${q(i.ops)}),'every successful ops command has exactly one audit');
 select pg_temp.ok((select count(*) from kinnso_internal.pilot_participant_audit where run_id=${q(i.run)})=(select count(*) from kinnso_internal.requests where actor_id in (${q(i.creator)},${q(i.traveller)}) and result ? 'snapshot'),'every successful participant command and publish has exactly one audit');
 select pg_temp.denied(${q(i.ops)},${q(call(i,{type:'addParticipant',id:randomUUID(),runId:i.run,role:'traveller',cohortRole:'observer',displayLabel:'Too late'}))},'CONFLICT');rollback;`);}catch(e){assert.fail(String(e.stderr||e.message));}
 const snap=JSON.parse(output.split(/\r?\n/).find(x=>x.startsWith('FACTS:')).slice(6));
 assert.deepEqual(pilotExecutionReadiness(snap).blockers,[]);
 const self=JSON.parse(output.split(/\r?\n/).find(x=>x.startsWith('SELF:')).slice(5));
 assert.deepEqual(Object.keys(self).sort(),['acknowledgements','contentConsent','intake','intakes','nextStep','participant','readiness','run','workflowLinks']);
 assert.deepEqual(Object.keys(self.run).sort(),['id','name','participationNoticeDigest','participationNoticeVersion','privacyNoticeDigest','privacyNoticeVersion','status']);
 assert.deepEqual(Object.keys(self.participant).sort(),['consentDigest','consentVersion','id','revision','role','status']);
 assert.equal(snap.facts.notifications.length,1);
 assert.equal(snap.facts.notifications[0].submissionId,snap.facts.submissions[0].entityId);
 assert.equal(snap.facts.checks.find(x=>x.code==='notification_acknowledged').notificationId,snap.facts.notifications[0].entityId);
});
check('three valid publications cannot conceal a fourth unapproved linked guide',i=>{
 const guide=randomUUID();return `${executionSeed(i)}
 select pg_temp.rpc(${q(i.creator)},${q(`select public.save_kinnso_guide_draft(${q(guide)},0,${q(randomUUID())},${json(draft)})`)});
 select pg_temp.rpc(${q(i.creator)},${q(pc({type:'submitContentIntake',intake:{...content,rightsEvidenceReference:'ref:'+guide}}))});
 select pg_temp.rpc(${q(i.ops)},format('select public.admin_apply_kinnso_pilot_command(%L,%L::jsonb)',${q(randomUUID())},jsonb_build_object('type','bindGuide','intakeId',(select id from kinnso_internal.pilot_content_intakes where run_id=${q(i.run)} and guide_id is null),'guideId',${q(guide)},'expectedRevision',1)));
 select pg_temp.denied(${q(i.ops)},${q(call(i,{type:'setRunStatus',id:i.run,expectedRevision:1,status:'completed',reason:'Cannot skip linked guide'}))},'CONFLICT');`;
});
check('notification acknowledgement rejects an older approval after a newer submission',i=>`
${executionSeed(i)}
insert into public.mission_milestone_submissions(mission_milestone_id,mission_participant_id,status,created_at) select ${q(i.check)},mp.id,'submitted',clock_timestamp() from public.mission_participants mp join kinnso_internal.pilot_collaborations c on c.mission_id=mp.mission_id where c.run_id=${q(i.run)};
select pg_temp.denied(${q(i.creator)},${q(pc({type:'acknowledgeNotification'}))},'CONFLICT');
`);
check('draft edits and publication counters remain independent with exact canonical digests',i=>`
${contentSeed(i)}
select pg_temp.rpc(${q(i.creator)},${q(`select public.save_kinnso_guide_draft(${q(i.guide)},1,${q(randomUUID())},${json({...draft,title:'Revised title'})})`)});
select pg_temp.rpc(${q(i.ops)},${approval(i.guide,i.intake,3,'Reviewed changed title')});
select pg_temp.rpc(${q(i.creator)},${q(`select public.publish_kinnso_pilot_guide_draft(${q(i.guide)},2,${q(randomUUID())})`)});
select pg_temp.ok((select guide_draft_revision=2 and reviewed_guide_version=1 from kinnso_internal.pilot_content_intakes where id=${q(i.intake)}),'independent counters');
select pg_temp.ok((select kinnso_internal.pilot_review_digest(d.payload,i)=i.content_digest and d.revision=i.guide_draft_revision from kinnso_internal.guide_drafts d join kinnso_internal.pilot_content_intakes i on i.guide_id=d.guide_id where i.id=${q(i.intake)}),'reviewed content unchanged by publication');
`);
check('published draft drift can be explicitly re-reviewed and published again',i=>`
${contentSeed(i)}
select pg_temp.rpc(${q(i.creator)},${q(`select public.publish_kinnso_pilot_guide_draft(${q(i.guide)},1,${q(randomUUID())})`)});
select pg_temp.rpc(${q(i.creator)},${q(`select public.save_kinnso_guide_draft(${q(i.guide)},1,${q(randomUUID())},${json({...draft,title:'Reviewed correction'})})`)});
select pg_temp.rpc(${q(i.ops)},${approval(i.guide,i.intake,4,'Review correction against exact draft')});
select pg_temp.rpc(${q(i.creator)},${q(`select public.publish_kinnso_pilot_guide_draft(${q(i.guide)},2,${q(randomUUID())})`)});
select pg_temp.ok((select status='published' and reviewed_guide_version=2 and guide_draft_revision=2 from kinnso_internal.pilot_content_intakes where id=${q(i.intake)}),'reviewed correction');
`);
check('owned intake updates only allow draft and rejected; approved and published are read only',i=>{
 const edit=(revision,intake=content)=>q(pc({type:'updateOwnedContentIntake',id:i.intake,expectedRevision:revision,intake}));
 return `
${contentSeed(i)}
select pg_temp.denied(${q(i.creator)},${edit(3)},'CONFLICT');
update kinnso_internal.pilot_content_intakes set status='rejected',review_reason='Needs revision' where id=${q(i.intake)};
create temp table owner_view as select pg_temp.rpc(${q(i.creator)},'select public.get_kinnso_pilot_self()') value;
select pg_temp.ok((select value#>>'{intake,id}'=${q(i.intake)} and value#>>'{intake,reviewReason}'='Needs revision'
 and value#>>'{intake,editorHref}'='/en/studio/guides/'||${q(i.guide)}||'/edit' from owner_view),'owner intake and canonical editor');
select pg_temp.ok(pg_temp.rpc(${q(i.traveller)},'select public.get_kinnso_pilot_self()')->'intake'='null'::jsonb,'cross-slot intake hidden');
select pg_temp.denied(${q(i.creator)},${edit(3,{...content,authorConsentDigest:'d'.repeat(64)})},'CONFLICT');
select pg_temp.denied(${q(i.creator)},${edit(3,{...content,authorConsentVersion:' content-v1 '})},'CONFLICT');
select pg_temp.denied(${q(i.creator)},${q(pc({type:'submitContentIntake',intake:{...content,authorConsentVersion:'content-v1 '}}))},'CONFLICT');
select pg_temp.rpc(${q(i.creator)},${edit(3)});
select pg_temp.ok((select status='submitted' and author_consent_digest=repeat('c',64) from kinnso_internal.pilot_content_intakes where id=${q(i.intake)}),'exact accepted content notice');
select pg_temp.denied(${q(i.creator)},${edit(4)},'CONFLICT');
update kinnso_internal.pilot_content_intakes set status='draft' where id=${q(i.intake)};
select pg_temp.rpc(${q(i.creator)},${edit(4)});
select pg_temp.rpc(${q(i.ops)},${approval(i.guide,i.intake,5,'Review draft intake')});
select pg_temp.rpc(${q(i.creator)},${q(`select public.publish_kinnso_pilot_guide_draft(${q(i.guide)},1,${q(randomUUID())})`)});
select pg_temp.denied(${q(i.creator)},${edit(7)},'CONFLICT');
`;});
check('two active creators in one run cannot read or edit another creator intake',i=>{
 const otherSlot=randomUUID();
 const get='select public.get_kinnso_pilot_self()';
 return `${contentSeed(i)}
 update public.creators set status='active' where id=${q(i.other)};
 insert into kinnso_internal.pilot_participants(id,run_id,role,pilot_cohort_role,display_label,user_id,status,consent_version,consent_digest,consented_at)
 select ${q(otherSlot)},r.id,'creator','observer','Second creator',${q(i.other)},'active',r.participation_notice_version,
   kinnso_internal.pilot_consent_identity(r),now() from kinnso_internal.pilot_runs r where id=${q(i.run)};
 update kinnso_internal.pilot_content_intakes set status='rejected',updated_at=now()-interval '1 minute' where id=${q(i.intake)};
 create temp table second_intake as select (pg_temp.rpc(${q(i.other)},${q(pc({type:'submitContentIntake',intake:{...content,title:'Second creator only'}}))})#>>'{snapshot,intake,id}')::uuid id;
 update kinnso_internal.pilot_content_intakes set status='rejected' where id=(select id from second_intake);
 select pg_temp.ok(pg_temp.rpc(${q(i.creator)},${q(get)})#>>'{intake,id}'=${q(i.intake)},'first creator reads own intake');
 select pg_temp.ok(pg_temp.rpc(${q(i.other)},${q(get)})#>>'{intake,id}'=(select id::text from second_intake),'second creator reads own intake');
 select pg_temp.denied(${q(i.other)},${q(pc({type:'updateOwnedContentIntake',id:i.intake,expectedRevision:3,intake:content}))},'NOT_FOUND');
 select pg_temp.denied(${q(i.creator)},format('select public.apply_kinnso_pilot_participant_command(%L,%L::jsonb)',gen_random_uuid(),
  jsonb_build_object('type','updateOwnedContentIntake','id',(select id from second_intake),'expectedRevision',1,'intake',${json(content)})),'NOT_FOUND');
 `;
});
check('missing and stale notice digests fail without accepting consent',i=>{
 const command={type:'acceptConsent',noticeVersion:'participation-v1',privacyNoticeVersion:'privacy-v1',privacyNoticeDigest:'b'.repeat(64)};
 return `${seed(i)}
 update kinnso_internal.pilot_participants set consent_version=null,consent_digest=null,consented_at=null where id=${q(i.slot)};
 select pg_temp.denied(${q(i.traveller)},${q(pc(command))},'CONFLICT');
 select pg_temp.denied(${q(i.traveller)},${q(pc({...command,noticeDigest:'d'.repeat(64)}))},'CONFLICT');
 ${['noticeVersion','privacyNoticeVersion'].map(key=>`select pg_temp.denied(${q(i.traveller)},${q(pc({...command,noticeDigest:'a'.repeat(64),[key]:' '+command[key]+' '}))},'CONFLICT');`).join(' ')}
 select pg_temp.ok((select consented_at is null from kinnso_internal.pilot_participants where id=${q(i.slot)}),'no consent on mismatch');
 select pg_temp.rpc(${q(i.traveller)},${q(pc({...command,noticeDigest:'a'.repeat(64)},i.request))});
 select pg_temp.denied(${q(i.traveller)},${q(pc({...command,noticeDigest:'a'.repeat(64),privacyNoticeDigest:'d'.repeat(64)},i.request))},'REQUEST_ID_REUSED');
 do $$begin
  begin
   update kinnso_internal.pilot_runs set privacy_notice_digest=repeat('d',64) where id=${q(i.run)};
   raise exception 'notice update unexpectedly succeeded';
  exception when others then if sqlerrm<>'CONFLICT' then raise;end if;end;
 end $$;
 `;
});
check('an active participant cannot be completed before the run',i=>`
${seed(i)}select pg_temp.denied(${q(i.ops)},${q(call(i,{type:'setParticipantStatus',id:i.slot,expectedRevision:1,status:'completed',reason:'Participant finished'}))},'CONFLICT');
select pg_temp.ok((select status='active' from kinnso_internal.pilot_participants where id=${q(i.slot)}),'participant completed');
select pg_temp.ok(not kinnso_internal.pilot_execution_complete(${q(i.run)}),'participant status is not run acceptance');
`);
check('recruitment starts the consent window and participant commands preserve receipts and audit count',i=>{
 const config={type:'configureRun',id:i.run,expectedRevision:1,participationNoticeVersion:'participation-v1',participationNoticeDigest:'a'.repeat(64),privacyNoticeVersion:'privacy-v1',privacyNoticeDigest:'b'.repeat(64),contentConsentVersion:'content-v1',contentConsentDigest:'c'.repeat(64),coordinatorReference:'coordinator',supportOwnerReference:'support',privacyOwnerReference:'privacy',alertOwnerReference:'alerts',privateChannelReference:'channel',syntheticRehearsalRunId:null};
 return `${invoke(i,run(i))}${invoke(i,config)}
 ${[['traveller',i.slot],['creator',i.creatorSlot],['merchant',i.merchantSlot]].map(([role,id])=>invoke(i,{type:'addParticipant',id,runId:i.run,role,cohortRole:'required_'+role,displayLabel:role})).join('\n')}
 ${invoke(i,{type:'setRunStatus',id:i.run,expectedRevision:2,status:'recruiting',reason:'Open synthetic enrollment'})}
 update kinnso_internal.pilot_participants set user_id=${q(i.traveller)},status='joined' where id=${q(i.slot)};
 create temp table consent_receipt as select pg_temp.rpc(${q(i.traveller)},${q(pc({type:'acceptConsent',noticeVersion:'participation-v1',noticeDigest:'a'.repeat(64),privacyNoticeVersion:'privacy-v1',privacyNoticeDigest:'b'.repeat(64)},i.request))}) value;
 select pg_temp.ok((select not ((value->'snapshot') ?| array['facts','beginFacts','participants','checks']) from consent_receipt),'mutation contains only the safe snapshot');
 select pg_temp.ok((select value->'_pilotReplay'='false'::jsonb from consent_receipt) and (select value||'{"_pilotReplay":true}'::jsonb from consent_receipt)=pg_temp.rpc(${q(i.traveller)},${q(pc({type:'acceptConsent',noticeVersion:'participation-v1',noticeDigest:'a'.repeat(64),privacyNoticeVersion:'privacy-v1',privacyNoticeDigest:'b'.repeat(64)},i.request))}),'consent replay');
 select pg_temp.ok((select count(*)=1 from kinnso_internal.pilot_participant_audit where participant_id=${q(i.slot)}),'one consent audit');
 select pg_temp.ok((select p.consented_at>r.acceptance_started_at from kinnso_internal.pilot_participants p join kinnso_internal.pilot_runs r on r.id=p.run_id where p.id=${q(i.slot)}),'consent in acceptance window');
 ${invoke(i,{type:'setRunStatus',id:i.run,expectedRevision:3,status:'running',reason:'Begin synthetic execution'})}
 `;
});

check('manual text alone cannot pass any required manual check',i=>`${seed(i)}
 ${manualCodes.map(code=>`select pg_temp.denied(${q(i.ops)},${manualCall(i,code,'ref:'+randomUUID())},'CONFLICT');`).join('\n')}
`);
check('manual evidence must match check, run, capture window and active capturing operator',i=>{
 const reference='ref:'+randomUUID();return `${seed(i)}
 ${invoke(i,{type:'addEvidenceReference',runId:i.run,checkCode:'physical_ios',entityType:'manual',entityId:i.run,participantId:null,evidenceReference:reference})}
 select pg_temp.denied(${q(i.ops)},${manualCall(i,'physical_android',reference)},'CONFLICT');
 select pg_temp.denied(${q(i.ops)},${manualCall(i,'physical_ios','ref:'+randomUUID())},'CONFLICT');
 update kinnso_internal.pilot_evidence set captured_at=now()-interval '2 hours' where run_id=${q(i.run)};
 select pg_temp.denied(${q(i.ops)},${manualCall(i,'physical_ios',reference)},'CONFLICT');
 update kinnso_internal.pilot_evidence set captured_at=clock_timestamp() where run_id=${q(i.run)};
 ${manualPass(i,'physical_ios',reference)}
 select pg_temp.ok((select status='pass' from kinnso_internal.pilot_check_rows(${q(i.run)}) where code='physical_ios'),'scoped evidence passes');
 update public.kinnso_ops_members set status='paused' where id=${q(i.ops)};
 select pg_temp.ok((select status<>'pass' from kinnso_internal.pilot_check_rows(${q(i.run)}) where code='physical_ios'),'inactive capturer cannot support readiness');
 `;
});
function boundSeed(i){return `${contentSeed(i)}
 select pg_temp.rpc(${q(i.creator)},${q(`select public.publish_kinnso_pilot_guide_draft(${q(i.guide)},1,${q(randomUUID())})`)});
 insert into public.merchant_profiles(id,user_id,company_name,contact_email) values(${q(i.merchant)},${q(i.merchant)},'Synthetic merchant','merchant@pilot.test');
 insert into public.missions(id,merchant_profile_id,title,summary,mission_type) values(${q(i.check)},${q(i.merchant)},'Synthetic mission','Synthetic','paid');
 ${invoke(i,{type:'bindCollaboration',id:randomUUID(),runId:i.run,merchantParticipantId:i.merchantSlot,creatorParticipantId:i.creatorSlot,missionId:i.check})}
`;}
check('discovery evidence requires the current traveller and current creator published guide',i=>{
 const evidence={type:'addEvidenceReference',runId:i.run,checkCode:'guide_discovered',entityType:'guide',entityId:i.guide,evidenceReference:'ref:'+randomUUID()};
 return `${boundSeed(i)}
 select pg_temp.denied(${q(i.ops)},${q(call(i,evidence))},'INVALID');
 select pg_temp.denied(${q(i.ops)},${q(call(i,{...evidence,participantId:i.creatorSlot}))},'INVALID');
 ${invoke(i,{...evidence,participantId:i.slot})}${manualPass(i,'guide_discovered',evidence.evidenceReference)}
 ${invoke(i,{type:'setParticipantStatus',id:i.slot,expectedRevision:1,status:'withdrawn',reason:'Replace traveller'})}
 ${invoke(i,{type:'addParticipant',id:i.other,runId:i.run,role:'traveller',cohortRole:'required_traveller',displayLabel:'New traveller'})}
 update kinnso_internal.pilot_participants set user_id=${q(i.other)},status='active',consent_version='participation-v1',consent_digest=kinnso_internal.pilot_consent_identity((select r from kinnso_internal.pilot_runs r where id=${q(i.run)})),consented_at=clock_timestamp() where id=${q(i.other)};
 select pg_temp.ok((select status<>'pass' from kinnso_internal.pilot_check_rows(${q(i.run)}) where code='guide_discovered'),'old traveller evidence not inherited');
 select pg_temp.denied(${q(i.ops)},${manualCall(i,'guide_discovered',evidence.evidenceReference)},'CONFLICT');
 select pg_temp.denied(${q(i.ops)},${q(call(i,{...evidence,participantId:i.slot}))},'INVALID');
 `;
});
check('creator withdrawal retires obligations atomically while preserving public guide history',i=>`${boundSeed(i)}
 ${invoke(i,{type:'setParticipantStatus',id:i.creatorSlot,expectedRevision:1,status:'withdrawn',reason:'Creator leaves pilot'})}
 select pg_temp.ok((select status='withdrawn' and revision=5 from kinnso_internal.pilot_content_intakes where id=${q(i.intake)}),'creator intake retired with revision');
 select pg_temp.ok((select status='retired' and revision=2 from kinnso_internal.pilot_collaborations where run_id=${q(i.run)}),'collaboration retired with revision');
 select pg_temp.ok((select status='published' from public.guides where id=${q(i.guide)}),'public guide preserved');
 select pg_temp.ok((select count(*)=1 from public.guide_versions where guide_id=${q(i.guide)}),'published version preserved');
`);
check('recovery evidence requires an owned trip and an in-window adoption of current pilot content',i=>{
 const reference='ref:'+randomUUID();
 const evidence={type:'addEvidenceReference',runId:i.run,checkCode:'trip_recovered',entityType:'trip',entityId:i.other,participantId:i.slot,evidenceReference:reference};
 return `${boundSeed(i)}
 insert into public.trips(id,owner_user_id,title,timezone,head_revision_no) values(${q(i.other)},${q(i.traveller)},'Recovery trip','Asia/Tokyo',1);
 select pg_temp.denied(${q(i.ops)},${q(call(i,evidence))},'INVALID');
 select pg_temp.rpc(${q(i.traveller)},${q(`select public.adopt_guide_to_trip(${q(i.guide)},1,${q(i.other)},1,${q(randomUUID())})`)});
 select pg_temp.denied(${q(i.ops)},${q(call(i,{...evidence,participantId:i.creatorSlot}))},'INVALID');
 update public.trips set owner_user_id=${q(i.creator)} where id=${q(i.other)};
 select pg_temp.denied(${q(i.ops)},${q(call(i,evidence))},'INVALID');
 update public.trips set owner_user_id=${q(i.traveller)} where id=${q(i.other)};
 ${invoke(i,evidence)}${manualPass(i,'trip_recovered',reference)}
 update public.trip_stops set adopted_at=now()-interval '2 hours' where trip_id=${q(i.other)};
 select pg_temp.ok((select status<>'pass' from kinnso_internal.pilot_check_rows(${q(i.run)}) where code='trip_recovered'),'out-of-window adoption does not count');
 select pg_temp.denied(${q(i.ops)},${q(call(i,evidence))},'INVALID');
 `;
});
check('merchant withdrawal retires its collaboration without withdrawing creator publications',i=>`${boundSeed(i)}
 ${invoke(i,{type:'setParticipantStatus',id:i.merchantSlot,expectedRevision:1,status:'withdrawn',reason:'Merchant leaves pilot'})}
 select pg_temp.ok((select status='retired' from kinnso_internal.pilot_collaborations where run_id=${q(i.run)}),'merchant binding retired');
 select pg_temp.ok((select status='published' from kinnso_internal.pilot_content_intakes where id=${q(i.intake)}),'creator publication retained');
`);
test('withdrawn creator can be replaced through invite and consent, then complete new obligations',()=>{
 const i=ids(),replacement={...i,creator:i.other,creatorSlot:randomUUID(),guide:randomUUID(),intake:randomUUID(),check:randomUUID()};
 let output;
 try {output=sql(`begin;${setup(i)}${executionSeed(i)}
 ${invoke(i,{type:'setParticipantStatus',id:i.creatorSlot,expectedRevision:1,status:'withdrawn',reason:'Replace creator'})}
 select pg_temp.ok((select count(*)=3 from kinnso_internal.pilot_content_intakes where run_id=${q(i.run)} and status='withdrawn'),'old intakes retained');
 select pg_temp.ok(not kinnso_internal.pilot_execution_complete(${q(i.run)}),'withdrawal removes readiness');
 ${invoke(i,{type:'addParticipant',id:replacement.creatorSlot,runId:i.run,role:'creator',cohortRole:'required_creator',displayLabel:'Replacement creator'})}
 create temp table replacement_invite as select pg_temp.rpc(${q(i.ops)},${q(call(i,{type:'createInvite',id:randomUUID(),participantId:replacement.creatorSlot,expectedRevision:1,expiresInHours:1}))}) value;
 select pg_temp.rpc(${q(replacement.creator)},format('select public.apply_kinnso_pilot_participant_command(%L,%L::jsonb)',gen_random_uuid(),jsonb_build_object('type','claimInvite','code',(select value->>'inviteCode' from replacement_invite))));
 select pg_temp.rpc(${q(replacement.creator)},${q(pc({type:'acceptConsent',noticeVersion:'participation-v1',noticeDigest:'a'.repeat(64),privacyNoticeVersion:'privacy-v1',privacyNoticeDigest:'b'.repeat(64)}))});
 ${invoke(i,{type:'setParticipantStatus',id:replacement.creatorSlot,expectedRevision:4,status:'active',reason:'Replacement consent verified'})}
 update public.creators set public_profile='{}'::jsonb,status='active',display_name='Replacement creator',handle='replacement-'||substr(id::text,1,8) where id=${q(replacement.creator)};
 select pg_temp.ok((select status<>'pass' from kinnso_internal.pilot_check_rows(${q(i.run)}) where code='guide_discovered'),'old creator evidence cannot complete replacement');
 ${executionSeed(replacement,false)}
 select pg_temp.ok((select count(*)=1 from kinnso_internal.pilot_collaborations where run_id=${q(i.run)} and status='active'),'one current binding');
 select pg_temp.ok((select count(*)=1 from kinnso_internal.pilot_collaborations where run_id=${q(i.run)} and status='retired'),'old binding remains history');
 select pg_temp.ok((select count(*)=6 from kinnso_internal.pilot_content_intakes where run_id=${q(i.run)}),'old and new intakes retained');
 select 'FACTS:'||pg_temp.rpc(${q(i.ops)},${q(`select public.get_kinnso_ops_pilot(${q(i.run)})`)})::text;
 ${invoke(i,{type:'setRunStatus',id:i.run,expectedRevision:1,status:'completed',reason:'Replacement acceptance complete'})}
 rollback;`);}catch(e){assert.fail(String(e.stderr||e.message));}
 const snapshot=JSON.parse(output.split(/\r?\n/).find(line=>line.startsWith('FACTS:')).slice(6));
 assert.deepEqual(pilotExecutionReadiness(snapshot).blockers,[]);
 assert.equal(snapshot.contentIntakes.length,3);
 assert.equal(snapshot.facts.publications.length,3);
 assert.ok(snapshot.facts.publications.every(row=>row.creatorUserId===replacement.creator));
 assert.equal(snapshot.collaboration.creatorParticipantId,replacement.creatorSlot);
});
test('competing operators cannot supersede or revoke an invite from the same participant revision',async()=>{
 const i=ids();let seeded=false;
 const asActor=(actor,command)=>`begin;set local role authenticated;select set_config('request.jwt.claims',${json({sub:actor,role:'authenticated',session_id:actor})}::text,true);${call(i,command)};commit;`;
 try{
  sql(`begin;${setup(i)}${seed(i)}update kinnso_internal.pilot_participants set user_id=null,status='invited',consent_version=null,consented_at=null where id=${q(i.slot)};commit;`);seeded=true;
  const commands=[i.ops,i.owner].map(()=>({type:'createInvite',id:randomUUID(),participantId:i.slot,expectedRevision:1,expiresInHours:1}));
  const results=await Promise.all([i.ops,i.owner].map((actor,index)=>asyncSql(asActor(actor,commands[index]))));
  assert.equal(results.filter(r=>r.status===0).length,1,results.map(r=>r.err).join('\n'));
  assert.match(results.find(r=>r.status!==0).err,/CONFLICT/);
  const winner=commands[results.findIndex(r=>r.status===0)];
  assert.equal(sql(`select revision from kinnso_internal.pilot_participants where id=${q(i.slot)}`),'2');
  assert.equal(sql(`select count(*) from kinnso_internal.pilot_invites where participant_id=${q(i.slot)} and status='active'`),'1');
  const race=[{type:'createInvite',id:randomUUID(),participantId:i.slot,expectedRevision:2,expiresInHours:1},{type:'revokeInvite',id:winner.id,participantId:i.slot,expectedRevision:2,reason:'Rotate observed invite'}];
  const changes=await Promise.all([i.ops,i.owner].map((actor,index)=>asyncSql(asActor(actor,race[index]))));
  assert.equal(changes.filter(r=>r.status===0).length,1,changes.map(r=>r.err).join('\n'));
  assert.match(changes.find(r=>r.status!==0).err,/CONFLICT/);
  assert.equal(sql(`select revision from kinnso_internal.pilot_participants where id=${q(i.slot)}`),'3');
  assert.equal(sql(`select count(*) from public.ops_audit_log where action in('pilot.createInvite','pilot.revokeInvite') and actor_ops_member_id in(${q(i.ops)},${q(i.owner)})`),'2');
 }finally{if(seeded)sql(`begin;delete from kinnso_internal.pilot_invites where participant_id in(select id from kinnso_internal.pilot_participants where run_id=${q(i.run)});delete from kinnso_internal.pilot_checks where run_id=${q(i.run)};delete from kinnso_internal.pilot_participants where run_id=${q(i.run)};delete from kinnso_internal.pilot_runs where id=${q(i.run)};delete from public.ops_audit_log where actor_ops_member_id in(${q(i.ops)},${q(i.owner)},${q(i.mod)});delete from auth.users where id in(${['ops','owner','mod','traveller','creator','merchant','other'].map(k=>q(i[k])).join(',')});commit;`);}
});

check('evidence participant foreign key rejects a slot from another run',i=>{
 const otherRun=randomUUID(),otherSlot=randomUUID();
 return `${seed(i)}
 ${invoke(i,{...run(i),id:otherRun})}
 insert into kinnso_internal.pilot_participants(id,run_id,role,pilot_cohort_role,display_label)
 values(${q(otherSlot)},${q(otherRun)},'traveller','required_traveller','Other run');
 do $$begin
  begin
   insert into kinnso_internal.pilot_evidence(run_id,check_code,entity_type,entity_id,participant_id,evidence_reference,captured_by_ops_member_id)
   values(${q(i.run)},'guide_discovered','guide',${q(i.guide)},${q(otherSlot)},${q('ref:'+otherSlot)},${q(i.ops)});
  exception when foreign_key_violation then return;end;
  raise exception 'cross-run evidence slot accepted';
 end$$;
 `;
});
check('invite revoke is revision guarded and replay does not advance the slot twice',i=>{
 const revoke={type:'revokeInvite',id:i.invite,participantId:i.slot,expectedRevision:2,reason:'Replace expired handoff'};
 return `${seed(i)}
 update kinnso_internal.pilot_participants set user_id=null,status='invited',consent_version=null,consented_at=null where id=${q(i.slot)};
 ${invoke(i,{type:'createInvite',id:i.invite,participantId:i.slot,expectedRevision:1,expiresInHours:1})}
 select pg_temp.denied(${q(i.owner)},${q(call(i,{...revoke,expectedRevision:1}))},'CONFLICT');
 select pg_temp.ok((select status='active' from kinnso_internal.pilot_invites where id=${q(i.invite)}),'stale revocation preserves issued invite');
 ${invoke(i,revoke,'ops',i.request)}
 ${invoke(i,revoke,'ops',i.request)}
 select pg_temp.ok((select revision=3 from kinnso_internal.pilot_participants where id=${q(i.slot)}),'revoke and replay advance once');
 select pg_temp.ok((select status='revoked' from kinnso_internal.pilot_invites where id=${q(i.invite)}),'invite revoked');
 `;
});

check('ops snapshot exposes only active invitation metadata, and approval rejects either stale value',i=>`
${contentSeed(i)}
select pg_temp.denied(${q(i.ops)},${approval(i.guide,i.intake,3,'Stale revision','{"expectedDraftRevision":2}')},'CONFLICT');
select pg_temp.denied(${q(i.ops)},${approval(i.guide,i.intake,3,'Wrong digest',JSON.stringify({expectedContentDigest:'0'.repeat(64)}))},'CONFLICT');
select pg_temp.ok((select revision=3 from kinnso_internal.pilot_content_intakes where id=${q(i.intake)}),'no stale approval');
update kinnso_internal.pilot_participants set user_id=null,status='invited',consent_version=null,consented_at=null where id=${q(i.slot)};
create temp table issued as select pg_temp.rpc(${q(i.ops)},${q(call(i,{type:'createInvite',id:i.invite,participantId:i.slot,expectedRevision:1,expiresInHours:1}))}) value;
create temp table readback as select pg_temp.rpc(${q(i.mod)},${q(`select public.get_kinnso_ops_pilot(${q(i.run)})`)}) value;
select pg_temp.ok((select p->'activeInvite' = jsonb_build_object('id',inv.id,'status','active','expiresAt',inv.expires_at)
 from readback cross join lateral jsonb_array_elements(value->'participants') p
 join kinnso_internal.pilot_invites inv on inv.participant_id=(p->>'id')::uuid where inv.id=${q(i.invite)}),'authorized active metadata');
select pg_temp.ok((select position((select value->>'inviteCode' from issued) in value::text)=0 from readback),'no code on later reads');
${invoke(i,{type:'revokeInvite',id:i.invite,participantId:i.slot,expectedRevision:2,reason:'Revoke synthetic invite'})}
select pg_temp.ok((select status='revoked' from kinnso_internal.pilot_invites where id=${q(i.invite)}),'revoked by snapshot ID');
`);

test('approval waiting on a concurrent draft update rejects the reviewed snapshot',async()=>{
 const i=ids(), writer='pilot-writer-'+i.request, approver='pilot-approver-'+i.request;
 const users=['ops','owner','mod','traveller','creator','merchant','other'].map(k=>q(i[k])).join(',');
 let seeded=false, change, review;
 try {
  sql(`begin;${setup(i)}${contentSeed(i)}commit;`);
  seeded=true;
  const reviewed=JSON.parse(sql(`select jsonb_build_object('expectedDraftRevision',d.revision,'expectedContentDigest',kinnso_internal.pilot_review_digest(d.payload,i)) from kinnso_internal.guide_drafts d join kinnso_internal.pilot_content_intakes i on i.guide_id=d.guide_id where d.guide_id=${q(i.guide)}`));
  change=asyncSql(`set application_name=${q(writer)};begin;
    update kinnso_internal.guide_drafts set revision=revision+1,payload=jsonb_set(payload,'{title}','"Concurrent revision"') where guide_id=${q(i.guide)};
    select pg_advisory_xact_lock(hashtextextended(${q(writer)},0));
    do $race$begin for attempt in 1..240 loop
      perform pg_stat_clear_snapshot();
      if exists(select 1 from pg_stat_activity where application_name=${q(approver)} and pg_backend_pid()=any(pg_blocking_pids(pid))) then return; end if;
      perform pg_sleep(0.05);
    end loop; raise exception 'approval never waited for draft lock'; end$race$;commit;`);
  let locked=false;
  for(let attempt=0;attempt<50&&!locked;attempt++){
   await new Promise(resolve=>setTimeout(resolve,30));
   locked=sql(`select not pg_try_advisory_xact_lock(hashtextextended(${q(writer)},0))`)==='t';
  }
  if(!locked) assert.fail((await change).err || "draft writer did not acquire its lock");
  review=asyncSql(`set application_name=${q(approver)};begin;set local role authenticated;
    select set_config('request.jwt.claims',${json({sub:i.ops,role:'authenticated',session_id:i.ops})}::text,true);
    ${call(i,{type:'reviewContentIntake',id:i.intake,expectedRevision:3,decision:'approve',reason:'Reviewed before update',...reviewed})};commit;`);
  const [update, approvalResult]=await Promise.all([change,review]);
  assert.equal(update.status,0,update.err);
  assert.equal(approvalResult.status,3);
  assert.match(approvalResult.err,/ERROR:\s+CONFLICT/);
  assert.equal(sql(`select revision from kinnso_internal.pilot_content_intakes where id=${q(i.intake)}`),'3');
 } finally {
  await Promise.allSettled([change,review].filter(Boolean));
  if(seeded) sql(`begin;
    delete from kinnso_internal.pilot_participant_audit where run_id=${q(i.run)};
    delete from kinnso_internal.pilot_content_intakes where run_id=${q(i.run)};
    delete from kinnso_internal.pilot_checks where run_id=${q(i.run)};
    delete from kinnso_internal.pilot_participants where run_id=${q(i.run)};
    delete from kinnso_internal.pilot_runs where id=${q(i.run)};
    delete from public.ops_audit_log where actor_ops_member_id=${q(i.ops)};
    delete from public.guides where id=${q(i.guide)};
    delete from auth.users where id in (${users});commit;`);
 }
});

function supportRaceSeed(i) {
 return `
 ${setup(i)}${seed(i)}
 update public.creators set status='onboarding' where id=${q(i.traveller)};
 insert into public.merchant_profiles(id,user_id,company_name,contact_email,status)
 values(${q(i.other)},${q(i.merchant)},'Synthetic merchant','merchant@pilot.test','active');
 insert into public.missions(id,merchant_profile_id,title,summary,mission_type,status)
 values(${q(i.guide)},${q(i.other)},'Synthetic mission','Synthetic','paid','draft');
 ${invoke(i,{type:'bindCollaboration',id:i.intake,runId:i.run,merchantParticipantId:i.merchantSlot,creatorParticipantId:i.creatorSlot,missionId:i.guide})}
 `;
}
const supportCommand=(i,request,id)=>`select public.apply_kinnso_support_command(${q(request)},${json({
 type:'create',id,subject:'Synthetic support',message:'Synthetic fixture',context:{type:'mission',id:i.guide},
})})`;
const supportActor=(i,statement)=>`set local role authenticated;
 select set_config('request.jwt.claims',${json({sub:i.traveller,role:'authenticated',session_id:i.traveller})}::text,true);
 ${statement};`;

test('a pilot traveller who owns the merchant still sees the legacy merchant context',()=>{
 const i=ids();
 sql(`begin;${supportRaceSeed(i)}
 update public.merchant_profiles set user_id=${q(i.traveller)} where id=${q(i.other)};
 select pg_temp.ok(pg_temp.rpc(${q(i.traveller)},${q(`select public.get_kinnso_support_context(${q(i.guide)})`)})
  =jsonb_build_object('type','mission','id',${q(i.guide)},'title','Synthetic mission','workspace','merchant'),'legacy merchant context');
 rollback;`);
});

for(const change of ['pause','revoke','unbind']) test('support create waits for pilot '+change+'; exact receipt still replays',async()=>{
 const i=ids(), original=randomUUID(), fresh=randomUUID(), request=randomUUID();
 const writer='pilot-scope-writer-'+i.request, reader='pilot-support-reader-'+i.request;
 const users=['ops','owner','mod','traveller','creator','merchant','other'].map(k=>q(i[k])).join(',');
 let initialized=false, write, read;
 try {
  sql(`begin;${supportRaceSeed(i)}
   select pg_temp.rpc(${q(i.traveller)},${q(supportCommand(i,request,original))});commit;`);
  initialized=true;
  const mutation=change==='pause'?`update kinnso_internal.pilot_runs set status='paused' where id=${q(i.run)}`
   :change==='revoke'?`update kinnso_internal.pilot_participants set status='paused' where id=${q(i.slot)}`
   :`update kinnso_internal.pilot_collaborations set status='retired' where id=${q(i.intake)}`;
  write=asyncSql(`set application_name=${q(writer)};begin;
   select id from kinnso_internal.pilot_runs where id=${q(i.run)} for update;
   ${mutation};
   do $$begin for attempt in 1..120 loop
    perform pg_stat_clear_snapshot();
    if exists(select 1 from pg_stat_activity where application_name=${q(reader)} and wait_event_type='Lock') then return;end if;
    perform pg_sleep(0.05);
   end loop;raise exception 'support never waited for scope lock';end$$;commit;`);
  let locked=false;
  for(let attempt=0;attempt<20&&!locked;attempt++) {
   await new Promise(resolve=>setTimeout(resolve,25));
   locked=sql(`select exists(select 1 from pg_stat_activity where application_name=${q(writer)} and wait_event='PgSleep')`)==='t';
  }
  if (!locked) assert.fail('Writer did not acquire scope lock: ' + (await write).err);
  read=asyncSql(`set application_name=${q(reader)};begin;${supportActor(i,supportCommand(i,randomUUID(),fresh))}commit;`);
  const [changed,attempt]=await Promise.all([write,read]);
  assert.equal(changed.status,0,changed.err);
  assert.equal(attempt.status,3,attempt.err);
  assert.match(attempt.err,/ERROR:\s+forbidden/i);
  const replay=sql(`begin;${supportActor(i,supportCommand(i,request,original))}rollback;`).split(/\r?\n/).at(-1);
  assert.deepEqual(JSON.parse(replay),{id:original,revision:1,status:'open'});
  assert.equal(sql(`select count(*) from kinnso_internal.support_cases where id in (${q(original)},${q(fresh)})`),'1');
 } finally {
  await Promise.allSettled([write,read].filter(Boolean));
  if(initialized) sql(`begin;
   delete from kinnso_internal.support_cases where id in (${q(original)},${q(fresh)});
   delete from kinnso_internal.pilot_collaborations where run_id=${q(i.run)};
   delete from kinnso_internal.pilot_checks where run_id=${q(i.run)};
   delete from kinnso_internal.pilot_participants where run_id=${q(i.run)};
   delete from kinnso_internal.pilot_runs where id=${q(i.run)};
   delete from public.ops_audit_log where actor_ops_member_id in (${users});
   delete from public.merchant_profiles where id=${q(i.other)};
   delete from auth.users where id in (${users});commit;`);
 }
});

check('external URL cannot be recorded as an opaque pilot evidence reference',i=>`
 ${seed(i)}
 select pg_temp.denied(${q(i.ops)},${q(call(i,{type:'addEvidenceReference',runId:i.run,checkCode:'physical_ios',entityType:'manual',entityId:i.run,evidenceReference:'https://untrusted.example.test/private'}))},'INVALID');
 select pg_temp.ok(not exists(select 1 from kinnso_internal.pilot_evidence where run_id=${q(i.run)}),'no evidence write');
 select pg_temp.ok(not exists(select 1 from public.ops_audit_log where actor_ops_member_id=${q(i.ops)} and action='pilot.addEvidenceReference'),'no evidence audit write');
 ${invoke(i,{type:'addEvidenceReference',runId:i.run,checkCode:'physical_ios',entityType:'manual',entityId:i.run,evidenceReference:'ref:1'})}
 ${manualPass(i,'physical_ios','ref:1')}
 select pg_temp.ok((select status='pass' from kinnso_internal.pilot_check_rows(${q(i.run)}) where code='physical_ios'),'opaque evidence still works');
`);

check('normalized intake duplicates conflict and exact request replay remains distinct',i=>{
 const first=pc({type:'submitContentIntake',intake:content},i.request);
 const variant={...content,title:content.title+' '};
 return `
 ${seed(i)}
 create temp table original as select pg_temp.rpc(${q(i.creator)},${q(first)}) value;
 select pg_temp.ok((select value - '_pilotReplay' from original) =
   (pg_temp.rpc(${q(i.creator)},${q(first)}) - '_pilotReplay'),'exact replay receipt');
 select pg_temp.denied(${q(i.creator)},${q(pc({type:'submitContentIntake',intake:variant},i.request))},'REQUEST_ID_REUSED');
 select pg_temp.denied(${q(i.creator)},${q(pc({type:'submitContentIntake',intake:variant}))},'CONFLICT');
 select pg_temp.ok((select count(*)=1 from kinnso_internal.pilot_content_intakes where run_id=${q(i.run)}),'one intake');
 select pg_temp.ok((select count(*)=1 from kinnso_internal.pilot_participant_audit where run_id=${q(i.run)} and command_type='submitContentIntake'),'one intake audit');
 select pg_temp.ok((select count(*)=1 from kinnso_internal.requests where actor_id=${q(i.creator)}),'one receipt');
 `;
});

check('FINAL cover owner direct update invalidates exact approval',i=>`
 ${contentSeed(i)}
 select pg_temp.rpc(${q(i.creator)},${q(`with changed as (update public.guides set cover_url='https://example.test/changed.jpg' where id=${q(i.guide)} returning id) select to_jsonb(count(*)) from changed`)});
 select pg_temp.ok((select cover_url='https://example.test/changed.jpg' from public.guides where id=${q(i.guide)}),'authenticated owner changed cover');
 select pg_temp.denied(${q(i.creator)},${q(`select public.publish_kinnso_pilot_guide_draft(${q(i.guide)},1,${q(randomUUID())})`)},'PILOT_REVIEW_REQUIRED');
 select pg_temp.ok((select count(*)=0 from public.guide_versions where guide_id=${q(i.guide)}),'no publication');
 ${invoke(i,{type:'reviewContentIntake',id:i.intake,expectedRevision:3,decision:'reject',reason:'Review changed cover rights'})}
 select pg_temp.rpc(${q(i.creator)},${q(pc({type:'updateOwnedContentIntake',id:i.intake,expectedRevision:4,intake:{...content,coverRightsConfirmed:true,coverRightsEvidenceReference:'ref:2'}}))});
 select pg_temp.rpc(${q(i.ops)},${approval(i.guide,i.intake,5,'Exact changed cover approved')});
 select pg_temp.rpc(${q(i.creator)},${q(`select public.publish_kinnso_pilot_guide_draft(${q(i.guide)},1,${q(randomUUID())})`)});
 select pg_temp.ok((select count(*)=1 from public.guide_versions where guide_id=${q(i.guide)}),'publication after exact reapproval');
`);
check('FINAL all owned intakes are selectable and operator review contains substantive source',i=>`
 ${contentSeed(i)}
 ${[2,3].map(n=>`select pg_temp.rpc(${q(i.creator)},${q(pc({type:'submitContentIntake',intake:{...content,title:'Guide '+n}}))});`).join('')}
 select pg_temp.ok(jsonb_array_length(pg_temp.rpc(${q(i.creator)},'select public.get_kinnso_pilot_self()')->'intakes')=3,'three owned intakes');
 select pg_temp.ok(pg_temp.rpc(${q(i.traveller)},'select public.get_kinnso_pilot_self()')->'intakes'='[]'::jsonb,'other role sees no intake');
 select pg_temp.ok((pg_temp.rpc(${q(i.ops)},${q(`select public.get_kinnso_ops_pilot(${q(i.run)})`)})#>>'{contentIntakes,0,review,sourceSummary}') is not null,'substantive review');
`);
check('FINAL premature participant completion denied and self withdrawal retires only pilot',i=>`
 ${contentSeed(i)}
 select pg_temp.denied(${q(i.ops)},${q(call(i,{type:'setParticipantStatus',id:i.creatorSlot,expectedRevision:1,status:'completed',reason:'Too early'}))},'CONFLICT');
 select pg_temp.denied(${q(i.creator)},${q(pc({type:'withdrawParticipation',runId:i.run,participantId:i.creatorSlot,expectedRevision:2}))},'CONFLICT');
 select pg_temp.denied(${q(i.traveller)},${q(pc({type:'withdrawParticipation',runId:i.run,participantId:i.creatorSlot,expectedRevision:1}))},'CONFLICT');
 select pg_temp.rpc(${q(i.creator)},${q(pc({type:'withdrawParticipation',runId:i.run,participantId:i.creatorSlot,expectedRevision:1}))});
 select pg_temp.ok((select status='withdrawn' from kinnso_internal.pilot_participants where id=${q(i.creatorSlot)}),'withdrawn');
 select pg_temp.ok((select status='withdrawn' from kinnso_internal.pilot_content_intakes where id=${q(i.intake)}),'intake retired');
 select pg_temp.ok((select status='active' from public.creators where id=${q(i.creator)}),'ordinary account unchanged');
 select pg_temp.ok(pg_temp.rpc(${q(i.creator)},'select public.get_kinnso_pilot_self()')#>>'{participant,status}'='withdrawn','current self');
`);
check('FINAL run completion atomically completes all required slots',i=>`
 ${executionSeed(i)}
 ${invoke(i,{type:'setRunStatus',id:i.run,expectedRevision:1,status:'completed',reason:'Finish verified run'})}
 select pg_temp.ok((select count(*)=3 from kinnso_internal.pilot_participants where run_id=${q(i.run)} and status='completed'),'required slots complete');
`);
check('FINAL creator visibility requires public profile',i=>`
 ${seed(i)}
 update public.creators set public_profile=null where id=${q(i.creator)};
 select pg_temp.ok((select status='not_run' from kinnso_internal.pilot_check_rows(${q(i.run)}) where code='creator_public'),'private profile blocks');
`);
check('FINAL old merchant and creator applications cannot become fresh on approval',i=>`
 ${executionSeed(i)}
 update public.merchant_applications set created_at=now()-interval '2 hours' where user_id=${q(i.merchant)};
 alter table public.mission_participants disable trigger user;
 update public.mission_participants set created_at=now()-interval '2 hours' where creator_id=${q(i.creator)};
 alter table public.mission_participants enable trigger user;
 select pg_temp.ok((select count(*)=2 from kinnso_internal.pilot_check_rows(${q(i.run)}) where code in ('merchant_approved','application_active') and status='not_run'),'created after acceptance required');
`);
check('FINAL slot twenty-one denies without row receipt or audit',i=>{
 const request=randomUUID(),slot=randomUUID();return `${seed(i)}
 insert into kinnso_internal.pilot_participants(run_id,role,pilot_cohort_role,display_label)
 select ${q(i.run)},'traveller','observer','Observer '||n from generate_series(1,17) n;
 create temp table audit_before as select count(*) n from public.ops_audit_log;
 select pg_temp.denied(${q(i.ops)},${q(call(i,{type:'addParticipant',id:slot,runId:i.run,role:'traveller',cohortRole:'observer',displayLabel:'Excess'},'ops',request))},'CONFLICT');
 select pg_temp.ok((select count(*)=20 from kinnso_internal.pilot_participants where run_id=${q(i.run)}),'cap');
 select pg_temp.ok((select count(*) from public.ops_audit_log)=(select n from audit_before),'no audit');
 select pg_temp.ok(not exists(select 1 from kinnso_internal.requests where request_id=${q(request)}),'no receipt');`;
});
check('FINAL unconfirmed email cannot claim invitation',i=>`
 ${seed(i)}
 update auth.users set email_confirmed_at=null where id=${q(i.other)};
 update kinnso_internal.pilot_participants set user_id=null,status='invited' where id=${q(i.slot)};
 insert into kinnso_internal.pilot_invites(id,participant_id,code_hash,expires_at,created_by_ops_member_id) values(${q(i.invite)},${q(i.slot)},extensions.digest(repeat('x',64),'sha256'),now()+interval '1 hour',${q(i.ops)});
 select pg_temp.denied(${q(i.other)},${q(pc({type:'claimInvite',code:'x'.repeat(64)}))},'FORBIDDEN');
 select pg_temp.ok((select status='active' from kinnso_internal.pilot_invites where id=${q(i.invite)}),'invite untouched');
 select pg_temp.ok(not exists(select 1 from kinnso_internal.pilot_participant_audit where participant_id=${q(i.slot)}),'no audit');
`);

test('FINAL owner waiting for lock loses authority after demotion',async()=>{
 const i=ids(),waiting='final-owner-'+i.request,holder='final-holder-'+i.request;
 let hold,change;
 try{
  sql(`begin;${setup(i)}update public.kinnso_ops_members set role='owner' where id=${q(i.ops)};commit;`);
  hold=asyncSql(`set application_name=${q(holder)};begin;
   select pg_advisory_xact_lock(hashtextextended('kinnso_ops_owner_invariant',0));
   do $$begin for attempt in 1..200 loop perform pg_stat_clear_snapshot();
    if exists(select 1 from pg_stat_activity where application_name=${q(waiting)} and wait_event_type='Lock') then return;end if;
    perform pg_sleep(0.05);end loop;raise exception 'waiter not observed';end$$;
   set local role authenticated;select set_config('request.jwt.claims',${json({sub:i.ops,role:'authenticated',session_id:i.ops})}::text,true);
   select public.admin_set_ops_member_role(${q(i.owner)},'admin','Demote waiting owner');commit;`);
  let locked=false;for(let n=0;n<50&&!locked;n++)locked=sql(`select exists(select 1 from pg_stat_activity where application_name=${q(holder)} and wait_event='PgSleep')`)==='t';
  assert.equal(locked,true);
  change=asyncSql(`set application_name=${q(waiting)};begin;set local role authenticated;
   select set_config('request.jwt.claims',${json({sub:i.owner,role:'authenticated',session_id:i.owner})}::text,true);
   select public.admin_set_ops_member_role(${q(i.mod)},'admin','Stale owner must fail');commit;`);
  const [a,b]=await Promise.all([hold,change]);assert.equal(a.status,0,a.err);assert.equal(b.status,3,'demoted waiter denied');assert.match(b.err,/forbidden/);
  assert.equal(sql(`select role from public.kinnso_ops_members where id=${q(i.mod)}`),'moderator');
  assert.equal(sql(`select count(*) from public.ops_audit_log where entity_id=${q(i.mod)}`),'0');
 }finally{
  await Promise.allSettled([hold,change].filter(Boolean));
  sql(`begin;delete from public.ops_audit_log where actor_ops_member_id in(${q(i.ops)},${q(i.owner)},${q(i.mod)});delete from auth.users where id in(${['ops','owner','mod','traveller','creator','merchant','other'].map(k=>q(i[k])).join(',')});commit;`);
 }
});
check('unconfirmed creator can publish ordinary content but cannot publish pilot content',i=>`
${contentSeed(i)}
select pg_temp.rpc(${q(i.creator)},${q(`select public.save_kinnso_guide_draft(${q(i.other)},0,${q(randomUUID())},${json(draft)})`)});
update auth.users set email_confirmed_at=null where id=${q(i.creator)};
select pg_temp.denied(${q(i.creator)},${q(`select public.publish_kinnso_pilot_guide_draft(${q(i.guide)},1,${q(randomUUID())})`)},'FORBIDDEN');
select pg_temp.rpc(${q(i.creator)},${q(`select public.publish_kinnso_pilot_guide_draft(${q(i.other)},1,${q(randomUUID())})`)});
select pg_temp.ok((select status='published' from public.guides where id=${q(i.other)}),'ordinary guide published');
`);

check('lost edit response replays the original result after a newer edit',i=>{
 const edit=(req,rev,title)=>`format('select public.edit_kinnso_creator_session(%L,%L,%L,%s,%L)',${q(i.slot)},${q(req)},(select token from edit_lifetime),${rev},${json({title,description:'Synthetic',type:'ask_a_creator',starts_at:'2026-11-21T10:00:00Z',duration_minutes:60,destination_tags:[]})})`;
 return `
 insert into public.community_sessions(id,slug,host_creator_id,title,description,type,starts_at,duration_minutes)
 values(${q(i.slot)},${q('synthetic-'+i.slot)},${q(i.creator)},'Synthetic initial','Synthetic','ask_a_creator',now(),60);
 create temp table edit_lifetime as select edit_token token from public.community_sessions where id=${q(i.slot)};
 create temp table edit_a as select pg_temp.rpc(${q(i.creator)},${edit(i.request,1,'Synthetic A')}) value;
 select pg_temp.rpc(${q(i.creator)},${edit(i.check,2,'Synthetic B')});
 select pg_temp.ok((select value from edit_a)=pg_temp.rpc(${q(i.creator)},${edit(i.request,1,'Synthetic A')}),'exact receipt');
 select pg_temp.denied(${q(i.creator)},${edit(i.request,1,'Synthetic changed')},'REQUEST_ID_REUSED');
 select pg_temp.denied(${q(i.creator)},${edit(randomUUID(),1,'Synthetic stale')},'CONFLICT');
 select pg_temp.ok((select title='Synthetic B' and edit_revision=3 and edit_token=(select token from edit_lifetime) from public.community_sessions where id=${q(i.slot)}),'newer edit preserved');
 `;
});

check('stale withdrawal from one Auth session cannot withdraw either run after another session joins',i=>{
 const newer=randomUUID(),slot=randomUUID(),session=randomUUID(),req=randomUUID(),code='w'.repeat(64);
 return `
 ${seed(i)}
 create temp table displayed as select pg_temp.rpc(${q(i.creator)},'select public.get_kinnso_pilot_self()') value;
 update kinnso_internal.pilot_runs set status='cancelled' where id=${q(i.run)};
 ${invoke(i,{...run(i),id:newer})}
 update kinnso_internal.pilot_runs set status='recruiting' where id=${q(newer)};
 insert into kinnso_internal.pilot_participants(id,run_id,role,pilot_cohort_role,display_label,created_at,status)
 values(${q(slot)},${q(newer)},'creator','required_creator','Synthetic newer',clock_timestamp()+interval '1 second','invited');
 insert into kinnso_internal.pilot_invites(id,participant_id,code_hash,expires_at,created_by_ops_member_id)
 values(${q(i.invite)},${q(slot)},extensions.digest(${q(code)},'sha256'),now()+interval '1 hour',${q(i.ops)});
 insert into auth.sessions(id,user_id,created_at,updated_at) values(${q(session)},${q(i.creator)},now(),now());
 select set_config('request.jwt.claims',jsonb_build_object('sub',${q(i.creator)},'role','authenticated','session_id',${q(session)})::text,true);
 set local role authenticated;
 ${pc({type:'claimInvite',code})};
 reset role;
 select pg_temp.denied(${q(i.creator)},format('select public.apply_kinnso_pilot_participant_command(%L,%L::jsonb)',${q(req)},
 (select jsonb_build_object('type','withdrawParticipation','requestId',${q(req)},'runId',value#>>'{run,id}','participantId',value#>>'{participant,id}','expectedRevision',1) from displayed)),'CONFLICT');
 select pg_temp.ok((select status='joined' and revision=2 from kinnso_internal.pilot_participants where id=${q(slot)}),'new slot unchanged');
 select pg_temp.ok((select status='active' and revision=1 from kinnso_internal.pilot_participants where id=${q(i.creatorSlot)}),'old slot unchanged');
 select pg_temp.ok(not exists(select 1 from kinnso_internal.requests where actor_id=${q(i.creator)} and request_id=${q(req)}) and not exists(select 1 from kinnso_internal.pilot_participant_audit where participant_id in (${q(slot)},${q(i.creatorSlot)}) and command_type='withdrawParticipation'),'no withdrawal effects');
 `;
});
check('stale edit after delete and recreate cannot write or leave a receipt',i=>{
 const insert=title=>`insert into public.community_sessions(id,slug,host_creator_id,title,description,type,starts_at,duration_minutes)
 values(${q(i.slot)},${q('synthetic-'+i.slot)},${q(i.creator)},${q(title)},'Synthetic','ask_a_creator',now(),60);`;
 const input={title:'Synthetic stale',description:'Synthetic',type:'ask_a_creator',starts_at:'2026-11-21T10:00:00Z',duration_minutes:60,destination_tags:[]};
 return `
 ${insert('Synthetic original')}
 create temp table original_lifetime as select edit_token token from public.community_sessions where id=${q(i.slot)};
 update public.community_sessions set status='cancelled',edit_token=gen_random_uuid() where id=${q(i.slot)};
 select pg_temp.ok((select edit_token=(select token from original_lifetime) from public.community_sessions where id=${q(i.slot)}),'status and direct updates preserve token');
 delete from public.community_sessions where id=${q(i.slot)};
 ${insert('Synthetic replacement')}
 select pg_temp.denied(${q(i.creator)},format('select public.edit_kinnso_creator_session(%L,%L,%L,1,%L)',${q(i.slot)},${q(i.request)},(select token from original_lifetime),${json(input)}),'CONFLICT');
 select pg_temp.ok((select title='Synthetic replacement' and edit_revision=1 and edit_token<>(select token from original_lifetime) from public.community_sessions where id=${q(i.slot)}),'replacement untouched');
 select pg_temp.ok(not exists(select 1 from kinnso_internal.requests where actor_id=${q(i.creator)} and request_id=${q(i.request)}),'no receipt');
 `;
});

check('an unconfirmed creator cannot replay a confirmed pilot publication receipt',i=>{
 const publish=`select public.publish_kinnso_pilot_guide_draft(${q(i.guide)},1,${q(i.request)})`;
 return `
 ${contentSeed(i)}
 select pg_temp.rpc(${q(i.creator)},${q(publish)});
 update auth.users set email_confirmed_at=null where id=${q(i.creator)};
 select pg_temp.denied(${q(i.creator)},${q(publish)},'FORBIDDEN');
 select pg_temp.ok((select count(*)=1 from kinnso_internal.pilot_participant_audit where entity_id=${q(i.guide)} and command_type='publishGuide'),'no extra audit');
 `;
});
