import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
let finish;
try { ({finishReminderCleanup: finish} = await import('./helpers/reminder-cleanup.mjs')); }
catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; }
function owned(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'kinnso-cleanup-')),actual=fs.realpathSync(root),parent=fs.realpathSync(os.tmpdir());
  t.after(()=>{assert.equal(path.dirname(actual).toLowerCase(),parent.toLowerCase());assert.ok(path.basename(actual).startsWith('kinnso-cleanup-'));fs.rmSync(actual,{recursive:true});});
  const mission=path.join(root,'mission'),actors=path.join(root,'actors');fs.writeFileSync(mission,'own-mission');fs.writeFileSync(actors,'own-actors');
  return {mission,actors,port:{removeMission:async()=>fs.unlinkSync(mission),removeActors:async()=>fs.unlinkSync(actors),readMissionAbsent:async()=>!fs.existsSync(mission),readActorsAbsent:async()=>!fs.existsSync(actors)}};
}
async function call(port) {assert.equal(typeof finish,'function');return finish(port);}
test('successful cleanup is reported only after exact removal and both absence reads',async t=>{
 const x=owned(t),r=await call(x.port);assert.equal(r.status,'PASS');assert.equal(fs.existsSync(x.mission),false);assert.equal(fs.existsSync(x.actors),false);assert.equal(r.missionAbsent,true);assert.equal(r.actorsAbsent,true);
});
test('mission failure stops further deletion but records exact retained actors and failed readback',async t=>{
 const x=owned(t),failure=Error('MISSION_CLEANUP_FAILED');x.port.removeMission=async()=>{throw failure;};
 await assert.rejects(call(x.port),e=>{assert.ok(e instanceof AggregateError);assert.ok(e.errors.includes(failure));assert.equal(e.cleanupReport.status,'FAIL');assert.equal(e.cleanupReport.actorRemoval,'NOT_ATTEMPTED');assert.equal(e.cleanupReport.missionAbsent,false);assert.equal(e.cleanupReport.actorsAbsent,false);return true;});
 assert.equal(fs.existsSync(x.mission),true);assert.equal(fs.existsSync(x.actors),true);
});
test('actor failure retains its error and does not invent a successful cleanup receipt',async t=>{
 const x=owned(t),failure=Error('ACTOR_CLEANUP_FAILED');x.port.removeActors=async()=>{throw failure;};
 await assert.rejects(call(x.port),e=>{assert.ok(e.errors.includes(failure));assert.equal(e.cleanupReport.status,'FAIL');assert.equal(e.cleanupReport.missionAbsent,true);assert.equal(e.cleanupReport.actorsAbsent,false);return true;});
 assert.equal(fs.existsSync(x.actors),true);
});
test('a readback outage is unknown even when the deletion calls succeeded',async t=>{
 const x=owned(t),failure=Error('READBACK_FAILED');x.port.readActorsAbsent=async()=>{throw failure;};
 await assert.rejects(call(x.port),e=>{assert.ok(e.errors.includes(failure));assert.equal(e.cleanupReport.status,'FAIL');assert.equal(e.cleanupReport.actorsAbsent,null);return true;});
});
test('original scenario and cleanup failures are both retained',async t=>{
 const x=owned(t),scenario=Error('ORIGINAL_SCENARIO_FAILED'),cleanup=Error('MISSION_CLEANUP_FAILED');x.port.scenarioError=scenario;x.port.removeMission=async()=>{throw cleanup;};
 await assert.rejects(call(x.port),e=>{assert.equal(e.cause,scenario);assert.ok(e.errors.includes(scenario));assert.ok(e.errors.includes(cleanup));assert.equal(e.cleanupReport.status,'FAIL');return true;});
});
test('a scenario failure is rethrown unchanged after otherwise successful cleanup',async t=>{
 const x=owned(t),scenario=Error('ORIGINAL_SCENARIO_FAILED');x.port.scenarioError=scenario;await assert.rejects(call(x.port),e=>e===scenario);assert.equal(fs.existsSync(x.mission),false);assert.equal(fs.existsSync(x.actors),false);
});
