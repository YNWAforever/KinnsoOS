import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture,anonymous,admin} from './local-fixtures.mjs';
import {readPublicGuidePage,guidePageMetadata} from '../../lib/seo/guide-publication.ts';

test('anonymous publication projection excludes owner drafts and follows published visibility',async()=>{
 const f=await fixture();
 try {
  const owner=await f.actor(true),other=await f.actor(true);
  const id=await f.guide(owner),draft=await f.guide(owner,{status:'draft'}),otherDraft=await f.guide(other,{status:'draft'});
  const time='2026-09-01T10:00:00+00:00',cover='https://cdn.kinnso.ai/synthetic-publication.png';
  const denied=await owner.client.from('guides').update({creator_name:'Synthetic public author',cover_url:cover,published_at:time}).eq('id',id);
  assert.equal(denied.error?.code,'42501');
  // Admin changes only this fixture's rows; application direct grants remain restricted.
  assert.equal((await admin.from('guides').update({creator_name:'Synthetic public author',cover_url:cover,published_at:time}).eq('id',id)).error,null);
  const rows=await anonymous.from('guides').select('id,creator_name,published_at,cover_url').in('id',[id,draft,otherDraft]);
  assert.equal(rows.error,null);assert.deepEqual(rows.data.map(row=>row.id),[id]);
  const guide=await readPublicGuidePage(id,process.env);assert.equal(guide.kind,'summary');assert.equal(guide.publication.author,'Synthetic public author');
  assert.equal(Date.parse(guide.publication.publishedAt),Date.parse(time));assert.equal(guide.publication.coverUrl,cover);
  assert.deepEqual(Object.keys(guide.publication).sort(),['author','coverUrl','publishedAt']);assert.equal(guide.days,undefined);
  assert.equal(await readPublicGuidePage(draft,process.env),null);assert.equal(await readPublicGuidePage(otherDraft,process.env),null);
  const version=await owner.client.rpc('publish_guide_version',{p_guide_id:id,p_expected_version:0,p_request_id:randomUUID(),p_content:{days:[{offset:0,title:'Explicit authored day',stops:[{title:'Explicit authored stop',description:'Public source description',placeId:null,startMinuteOfDay:600,durationMinutes:45}]}]}});
  assert.equal(version.error,null);
  assert.equal((await admin.from('guides').update({creator_name:'Changed public row name',published_at:'2026-09-02T10:00:00Z'}).eq('id',id)).error,null);
  const structured=await readPublicGuidePage(id,process.env);const meta=guidePageMetadata(structured);
  assert.equal(structured.kind,'itinerary');assert.equal(meta.authors[0].name,structured.creator.name);assert.equal(meta.openGraph.publishedTime,version.data.publishedAt);
  assert.equal((await admin.from('guides').update({status:'draft'}).eq('id',id)).error,null);
  assert.equal(await readPublicGuidePage(id,process.env),null);
 } finally {await f.cleanup();}
});
