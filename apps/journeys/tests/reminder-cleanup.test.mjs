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


test('partial setup retains exact allocated IDs and stops cleanup writes before actor removal', async t => {
  const x = owned(t), source = fs.readFileSync(new URL('./integration/collaboration-reminders.test.mjs', import.meta.url), 'utf8');
  // Execute the actual test setup/wrapper without importing the DB module.
  const setupSource = source.slice(source.indexOf('async function setup('), source.indexOf('\nconst scan='));
  const cleanupSource = source.slice(source.indexOf('let ownedReminderCleanupBlocked='), source.indexOf("\ntest('PD17 owned DB:"));
  assert.ok(setupSource.startsWith('async function setup(')); assert.ok(cleanupSource.startsWith('let ownedReminderCleanupBlocked='));
  const records = new Map(), actors = ['actor-1', 'actor-2', 'actor-3'];
  const scenario = Error('CONTROLLED_SETUP_FAILURE_AFTER_MISSION'); let actorRemoved = false, reads = 0, sequence = 0;
  const f = {actor: async () => ({id: actors[sequence++]}), actorIds: () => [...actors], cleanup: async () => { actorRemoved = true; fs.unlinkSync(x.actors); }};
  const query = table => ({
    insert(row) { records.set(table, structuredClone(row)); return this; }, select() { return this; },
    single() { if (table === 'mission_milestones') throw scenario; return Promise.resolve({data: {...records.get(table), id: records.get(table)?.id ?? table + '-id'}, error: null}); },
    delete() { return {eq: async () => { fs.unlinkSync(x.mission); return {error: null}; }}; },
    eq: async () => { reads++; return {data: fs.existsSync(x.mission) ? [{id: 'retained-mission'}] : [], error: null}; },
  });
  const admin = {from: query, auth: {admin: {getUserById: async () => { reads++; return {data: {}, error: null}; }}}};
  const output = [], consolePort = {log: (...args) => output.push(args), error: (...args) => output.push(args)};
  const ok = async promise => { const r = await promise; assert.equal(r.error, null); return r.data; };
  const state = {actorRefs: []};
  const execute = new Function('finishReminderCleanup', 'admin', 'ok', 'console', 'randomUUID', setupSource + '\n' + cleanupSource + '\nreturn {setup, cleanupOwnedReminderProbe, blocked:()=>ownedReminderCleanupBlocked};');
  let id = 0; const actual = execute(finish, admin, ok, consolePort, () => 'allocated-' + (++id));
  let result, original; try { result = await actual.setup(f, 3600000, 5, false, state); } catch (error) { original = error; }
  assert.equal(original, scenario); assert.equal(result, undefined);
  await assert.rejects(actual.cleanupOwnedReminderProbe(f, result, original, state), error => {
    assert.ok(error instanceof AggregateError); assert.ok(error.errors.includes(scenario));
    assert.equal(error.cleanupReport.missionRemoval, 'FAIL'); assert.equal(error.cleanupReport.actorRemoval, 'NOT_ATTEMPTED'); return true;
  });
  assert.equal(actorRemoved, false); assert.equal(fs.existsSync(x.actors), true); assert.equal(fs.existsSync(x.mission), true);
  assert.ok(reads >= 4, 'mission and all known actors receive independent read-only diagnostics');
  assert.equal(actual.blocked(), true);
  const receipt = JSON.parse(output.find(row => row[0] === 'PD17_OWNED_CLEANUP_FAILED')[1]);
  assert.equal(receipt.missionRef, records.get('missions').id); assert.ok(receipt.missionRef);
  assert.deepEqual(receipt.actorRefs, actors); assert.equal(receipt.setupComplete, false);
  assert.equal(receipt.setupStage, 'milestone');
});
