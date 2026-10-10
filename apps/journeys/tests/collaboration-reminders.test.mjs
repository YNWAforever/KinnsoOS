import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {transform} from 'esbuild';import {createContext,runInContext} from 'node:vm';
const module={exports:{}};let source='';try{source=await readFile(new URL('../lib/collaboration/reminders.ts',import.meta.url),'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
if(source){const result=await transform(source,{loader:'ts',format:'cjs'});runInContext(result.code,createContext({module,exports:module.exports,Date,require:()=>({})}));}const lib=module.exports;
const now='2026-10-11T00:00:00.000Z',candidate={participantId:'p',milestoneId:'m',deadlineVersion:now,eventKind:'collaboration.due_soon'};
test('bounded reminder scan preserves the same tick, advances a cursor and resumes after a crash',async()=>{
 assert.equal(typeof lib.runCollaborationReminders,'function');const scans=[],emits=[];let crash=true;
 const port={due:async(args)=>{scans.push(args);return args.after?{items:[{...candidate,milestoneId:'next'}],nextCursor:null}:{items:[candidate],nextCursor:'next-page'};},emit:async(c,tick)=>{emits.push([c,tick]);if(crash){crash=false;throw Error('ack lost');}return{emitted:false};}};
 await assert.rejects(lib.runCollaborationReminders(now,port,{limit:2,maxPages:2}),/ack lost/);
 const result=await lib.runCollaborationReminders(now,port,{limit:2,maxPages:2});assert.equal(result.completed,true);assert.equal(result.scanned,2);assert.equal(scans[1].now,now);assert.equal(scans[2].after,'next-page');assert.deepEqual(emits[1],emits[0]);
 const bounded=await lib.runCollaborationReminders(now,{...port,due:async()=>({items:[candidate],nextCursor:'remaining'})},{limit:1,maxPages:1});assert.equal(bounded.completed,false);assert.equal(bounded.nextCursor,'remaining');
});
test('invalid clocks, limits and cyclic server cursors fail without pretending successful completion',async()=>{
 assert.equal(typeof lib.dueCollaborationReminders,'function');let calls=0;const port={due:async()=>{calls++;return{items:[],nextCursor:'same'};},emit:async()=>({emitted:false})};
 for(const limit of [0,51,1.2])await assert.rejects(lib.dueCollaborationReminders(now,null,limit,port),/INVALID/);await assert.rejects(lib.dueCollaborationReminders('not-time',null,1,port),/INVALID/);assert.equal(calls,0);
 await assert.rejects(lib.runCollaborationReminders(now,port,{limit:1,maxPages:3}),/INVALID/);
});
test('inbox names existing decisions and both deadline reminders without inventing delivery',()=>{
 assert.equal(typeof lib.collaborationNotice,'function');for(const kind of ['collaboration.due_soon','collaboration.overdue','collaboration.invited','submission.revision_requested','submission.approved']){assert.notEqual(lib.collaborationNotice(kind,'en'),kind);assert.notEqual(lib.collaborationNotice(kind,'zh-HK'),kind);}
 assert.equal(lib.collaborationNotice('unrecognized.event','en'),'unrecognized.event');
});
