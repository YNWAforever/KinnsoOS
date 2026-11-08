import {test} from 'node:test';
import assert from 'node:assert/strict';
import {studioModule} from './helpers/studio-load.mjs';
const e=await studioModule('evidence'),g=await studioModule('guide-handoff');
const doc=(id,patch={})=>({id,ownerId:'A',threadId:'T',title:id,text:'原創筆記 '+id,version:1,aclVersion:1,hash:'abc',rights:'own',status:'active',...patch});
test('unselected document never enters the brief and notes never invent stops',()=>{
 assert.equal(typeof e.createBriefFromSources,'function');
 const brief=e.createBriefFromSources('B','T',[doc('D1'),doc('D2')],['D1']);
 assert.deepEqual(brief.blocks.flatMap(b=>b.sources.map(s=>s.sourceId)),['D1']);
 assert.ok(brief.blocks.every(b=>b.title===''&&b.intendedUse==='private'));
 assert.equal(typeof g.buildGuideProjection,'function');
 assert.equal(g.buildGuideProjection({...brief,title:'香港',city:'香港',summary:'原創'},[],[doc('D1')]).payload.content.days.length,0);
});
test('public projection excludes private block and requires current source permission',()=>{
 assert.equal(typeof g.buildGuideProjection,'function');
 const ref=id=>({sourceId:id,version:1,aclVersion:1,hash:'abc'});
 const brief={id:'B',threadId:'T',revision:1,title:'路線',city:'香港',summary:'原創',blocks:[{id:'one',title:'作者填寫的站點',text:'描述',sources:[ref('D1')],intendedUse:'public-candidate'},{id:'two',title:'私人備忘',text:'秘密',sources:[ref('D2')],intendedUse:'private'}]};
 const result=g.buildGuideProjection(brief,['one'],[doc('D1'),doc('D2')]);
 assert.equal(result.payload.content.days[0].stops.length,1);assert.ok(!JSON.stringify(result).includes('秘密'));
 assert.throws(()=>g.buildGuideProjection(brief,['two'],[doc('D2')]),/PRIVATE/);
 assert.throws(()=>g.buildGuideProjection(brief,['one'],[doc('D1',{status:'restricted'})]),/RESTRICTED/);
 assert.throws(()=>g.buildGuideProjection(brief,['one'],[doc('D1',{rights:'unknown'})]),/UNVERIFIED/);
 assert.throws(()=>g.buildGuideProjection(brief,['one'],[doc('D1',{aclVersion:2})]),/STALE/);
});
test('editing cannot erase lineage and withdrawn source hides cached derivative',()=>{
 assert.equal(typeof e.editBriefBlock,'function');assert.equal(typeof e.readableBrief,'function');
 const brief=e.createBriefFromSources('B','T',[doc('D1')],['D1']);
 const edited=e.editBriefBlock(brief,brief.blocks[0].id,{text:'人工修訂',sources:[]});
 assert.equal(edited.blocks[0].sources.length,1);
 assert.equal(e.readableBrief(edited,[doc('D1',{status:'restricted'})]),null);
});
