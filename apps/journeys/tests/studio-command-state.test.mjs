import {test} from 'node:test';
import assert from 'node:assert/strict';
import {studioModule} from './helpers/studio-load.mjs';
const c=await studioModule('command-state');
test('timeout preserves the exact immutable request and blocks replacing it',()=>{
 assert.equal(typeof c.beginCommand,'function');
 const input={requestId:'R1',expectedRevision:2,payload:{text:'one'}};
 let state=c.initialCommandState('A');state=c.beginCommand(state,input);input.payload.text='changed';
 state=c.reduceStudioCommand(state,{type:'unknown'});
 assert.equal(state.phase,'unknown');assert.deepEqual(state.intent.payload,{text:'one'});assert.equal(state.intent.requestId,'R1');
 assert.throws(()=>c.beginCommand(state,{...input,requestId:'R2'}),/PENDING/);
});
test('late acknowledgement does not overwrite newer edits; wrong scope is ignored',()=>{
 assert.equal(typeof c.reduceStudioCommand,'function');
 let state=c.beginCommand(c.initialCommandState('A'),{requestId:'R1',expectedRevision:0,payload:{text:'one'}});
 state=c.reduceStudioCommand(state,{type:'edit'});
 assert.equal(c.reduceStudioCommand(state,{type:'verified',scope:'B',requestId:'R1',revision:1}),state);
 state=c.reduceStudioCommand(state,{type:'verified',scope:'A',requestId:'R1',revision:1});
 assert.equal(state.phase,'dirty');assert.equal(state.savedRevision,1);assert.equal(state.intent,null);
 assert.equal(c.reduceStudioCommand(state,{type:'scope',scope:'B'}).savedRevision,0);
});
test('conflict requires explicit new intent; receipt missing stays unknown',()=>{
 assert.equal(typeof c.reduceStudioCommand,'function');
 let state=c.beginCommand(c.initialCommandState('A'),{requestId:'R1',expectedRevision:1,payload:{}});
 state=c.reduceStudioCommand(state,{type:'receiptMissing'});assert.equal(state.phase,'unknown');
 state=c.reduceStudioCommand(state,{type:'conflict'});assert.equal(state.phase,'conflict');
 state=c.reduceStudioCommand(state,{type:'edit'});assert.equal(state.phase,'conflict');
 assert.throws(()=>c.beginCommand(state,{requestId:'R2',expectedRevision:2,payload:{}}),/CONFLICT/);
 state=c.reduceStudioCommand(state,{type:'resolveConflict'});assert.equal(c.beginCommand(state,{requestId:'R2',expectedRevision:2,payload:{}}).intent.requestId,'R2');
});
