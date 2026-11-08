import {test} from 'node:test';
import assert from 'node:assert/strict';
import {studioModule} from './helpers/studio-load.mjs';
const editor=await studioModule('guide-editor');
const id='11111111-1111-4111-8111-111111111111',actor='22222222-2222-4222-8222-222222222222';
const payload={title:'own',city:'HK',summary:'own text',content:{days:[]}};
test('studio editor uses immutable prepare and original writer, then owner readback; retry retains both UUIDs',async()=>{
 assert.equal(typeof editor.runStudioGuideAction,'function');const original=global.fetch,writes=[];let fail=true;
 const command={action:'save',requestId:crypto.randomUUID(),preparationId:crypto.randomUUID(),revision:1,payload};
 let receipt;
 global.fetch=async(url,options={})=>{assert.equal(options.headers['X-Kinnso-Intent-Actor'],actor);const body=options.body&&JSON.parse(options.body);if(body)writes.push({url,body});
  const reply=data=>Response.json({ok:true,data});
  if(url.startsWith('/api/studio/guides/'))return reply({artifactId:id,artifactRevision:1,selectedBlockIds:[],threadId:id});
  if(url==='/api/studio/commands'){receipt={requestId:body.requestId,resourceId:body.payload.targetId,revision:1,digest:'hash',data:{id:body.payload.targetId,guideId:id,expectedRevision:1,domainRequestId:command.requestId,operation:'save',payload}};return reply(receipt);}
  if(url.startsWith('/api/studio/requests/'))return reply({status:'complete',receipt});
  if(options.method==='PUT'&&fail){fail=false;throw Error('lost reply');}
  return reply({id,revision:2,publishedVersion:0,payload});
 };
 try{assert.equal((await editor.runStudioGuideAction(actor,id,command)).ok,false);assert.equal((await editor.runStudioGuideAction(actor,id,command)).ok,true);
  const saves=writes.filter(x=>x.url==='/api/creator/guides/'+id);assert.equal(saves.length,2);assert.deepEqual(saves[0].body,saves[1].body);
  const preparations=writes.filter(x=>x.url==='/api/studio/commands');assert.deepEqual(preparations[0].body,preparations[1].body);
 }finally{global.fetch=original;}
});
test('an acknowledged save with a different readback is unknown',async()=>{
 assert.equal(typeof editor.verifyStudioDraftSave,'function');
 const ack={id,revision:2,payload};
 assert.equal(editor.verifyStudioDraftSave(ack,{...ack,payload:{...payload,title:'newer'}},payload),false);
 assert.equal(editor.verifyStudioDraftSave(ack,ack,payload),true);
});
