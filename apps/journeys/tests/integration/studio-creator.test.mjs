// NOT RUN in the local-only review: requires separately approved migration target.
// Existing fixture verifies the isolated target before creating synthetic actors.
import {test} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {fixture} from './local-fixtures.mjs';
const rpc=async(a,name,args)=>{const r=await a.client.rpc(name,args);assert.equal(r.error,null,JSON.stringify(r.error));return r.data;};
const command=(a,id,rev,kind,data,requestId=randomUUID())=>rpc(a,'apply_kinnso_studio_command',{p_target_id:id,p_expected_revision:rev,p_request_id:requestId,p_command:{kind,...data}});
test('studio owner isolation, original writer guard, UUID replay, public selection and revoked-source denial',async()=>{
 const f=await fixture();try{
  const a=await f.actor(true),b=await f.actor(true),thread=randomUUID(),source=randomUUID(),artifact=randomUUID(),block=randomUUID(),guide=randomUUID();
  await command(a,thread,0,'createThread',{title:'Synthetic source-owned brief',topic:'creation',templateId:'C1'});
  const sourceResult=await command(a,source,0,'saveSource',{threadId:thread,title:'Own note',text:'Synthetic own wording',rights:'own',attested:true});const s=sourceResult.data;
  const brief={id:artifact,threadId:thread,revision:0,title:'Synthetic walk',city:'Hong Kong',summary:'Own summary',blocks:[{id:block,title:'Own stop',text:s.text,intendedUse:'public-candidate',sources:[{sourceId:source,version:s.version,aclVersion:s.aclVersion,hash:s.hash}]}]};
  await command(a,artifact,0,'saveArtifact',{threadId:thread,brief});
  assert.ok((await b.client.rpc('get_kinnso_studio_thread',{p_thread_id:thread})).error);
  assert.ok((await b.client.from('studio_sources').select('*')).error);
  const domain=randomUUID(),prepared=await command(a,randomUUID(),0,'prepareGuideSave',{artifactId:artifact,artifactRevision:1,guideId:guide,expectedGuideRevision:0,domainRequestId:domain,selectedBlockIds:[block],confirmed:true});
  const args={p_draft_id:guide,p_expected_revision:0,p_request_id:domain,p_payload:prepared.data.payload};
  const saved=await rpc(a,'save_kinnso_guide_draft',args);assert.equal(saved.revision,1);assert.ok(saved.studio);assert.deepEqual(await rpc(a,'save_kinnso_guide_draft',args),saved);
  assert.ok((await a.client.from('guides').update({summary:'Direct bypass'}).eq('id',guide)).error);
  assert.ok((await a.client.rpc('publish_guide_version',{p_guide_id:guide,p_expected_version:0,p_request_id:randomUUID(),p_content:prepared.data.payload.content})).error);
  // The guide pins brief v1 while a separately edited brief head advances to v2.
  await command(a,artifact,1,'saveArtifact',{threadId:thread,brief:{...brief,revision:1,title:'Later brief head'}});
  const edited={...prepared.data.payload,title:'Independent guide edit'},editId=randomUUID();
  await command(a,randomUUID(),0,'prepareGuideSave',{artifactId:artifact,artifactRevision:1,guideId:guide,expectedGuideRevision:1,domainRequestId:editId,selectedBlockIds:[block],confirmed:true,editedPayload:edited});
  const editedDraft=await rpc(a,'save_kinnso_guide_draft',{p_draft_id:guide,p_expected_revision:1,p_request_id:editId,p_payload:edited});assert.equal(editedDraft.revision,2);
  const publishId=randomUUID();await command(a,randomUUID(),0,'prepareGuidePublish',{guideId:guide,expectedGuideRevision:2,domainRequestId:publishId,confirmed:true});
  const published=await rpc(a,'publish_kinnso_guide_draft',{p_draft_id:guide,p_expected_revision:2,p_request_id:publishId});assert.equal(published.snapshot.version,1);
  const traveller=await f.actor();await rpc(traveller,'kinnso_bookmark',{p_guide_id:guide,p_desired_state:true,p_request_id:randomUUID()});await rpc(traveller,'kinnso_bookmark',{p_guide_id:guide,p_desired_state:false,p_request_id:randomUUID()});
  await command(a,source,1,'restrictSource',{});assert.ok((await a.client.rpc('get_kinnso_guide_draft',{p_draft_id:guide})).error);assert.ok((await a.client.rpc('save_kinnso_guide_draft',args)).error);
  const read=await rpc(a,'get_kinnso_studio_thread',{p_thread_id:thread});assert.equal(read.sources[0].text,'');assert.deepEqual(read.artifacts,[]);
  assert.equal((await a.client.from('guides').delete().eq('id',guide)).error,null);
  const recreated=await a.client.from('guides').insert({id:guide,creator_id:a.id,creator_handle:'synthetic',creator_name:'Synthetic author',slug:'synthetic-'+guide,title:'Cached title',summary:'Cached body',city:'Hong Kong',status:'draft'});assert.ok(recreated.error);
  assert.ok((await a.client.rpc('save_kinnso_guide_draft',{...args,p_request_id:randomUUID()})).error);
 }finally{await f.cleanup();}
});
