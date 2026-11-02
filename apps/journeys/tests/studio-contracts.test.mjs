import {test} from 'node:test';
import assert from 'node:assert/strict';
import {studioModule} from './helpers/studio-load.mjs';
const policy=await studioModule('policy'),pub=await studioModule('guide-publication');
const id='11111111-1111-4111-8111-111111111111';
const command=()=>({requestId:id,expectedRevision:0,payload:{kind:'createThread',targetId:id,data:{title:'原創 brief',topic:'creation',templateId:'C1'}}});
test('bounded command rejects spoofed authority, arbitrary tools, unknown fields and wrong UUID',()=>{
 assert.equal(typeof policy.parseStudioCommand,'function');
 assert.equal(policy.parseStudioCommand(command()).payload.kind,'createThread');
 for(const invalid of [{...command(),actorId:id},{...command(),requestId:'bad'},{...command(),expectedRevision:-1},{...command(),payload:{kind:'sendMail',targetId:id,data:{}}},{...command(),payload:{...command().payload,data:{...command().payload.data,roles:['ops']}}}])assert.throws(()=>policy.parseStudioCommand(invalid),/INVALID/);
});
test('role and handoff capability are separate from template discoverability',()=>{
 assert.equal(typeof policy.authorizeStudio,'function');
 const actor={id,roles:['traveller'],merchantMemberships:[]};
 assert.equal(policy.authorizeStudio(actor,command().payload,false),true);
 const handoff={kind:'prepareGuideSave',targetId:id,data:{}};
 assert.equal(policy.authorizeStudio(actor,handoff,true),false);
 assert.equal(policy.authorizeStudio({...actor,roles:['creator']},handoff,false),false);
 assert.equal(policy.authorizeStudio({...actor,roles:['creator']},handoff,true),true);
});
test('publication is verified only against the same draft revision and public content',()=>{
 assert.equal(typeof pub.verifyGuidePublication,'function');
 const payload={title:'t',city:'c',summary:'s',content:{days:[{offset:0,title:'d',stops:[{title:'a',description:'b',placeId:null,startMinuteOfDay:null,durationMinutes:null}]}]}};
 const draft={id,revision:3,publishedVersion:1,payload};
 const snapshot={id,version:1,title:'t',days:payload.content.days};
 assert.equal(pub.verifyGuidePublication({draft,snapshot},draft,snapshot),'verified');
 assert.equal(pub.verifyGuidePublication({draft,snapshot},draft,{...snapshot,publication:{adoptable:true}}),'verified');
 assert.equal(pub.verifyGuidePublication({draft,snapshot},{...draft,revision:4},snapshot),'unknown');
 assert.equal(pub.verifyGuidePublication({draft,snapshot},draft,{...snapshot,title:'changed'}),'unknown');
 assert.equal(pub.verifyGuidePublication({draft,snapshot},null,null),'unknown');
});
