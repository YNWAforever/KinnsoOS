import test from 'node:test';
import assert from 'node:assert/strict';
import { pilotExportSummary } from '../lib/pilot/readiness.ts';

test('acceptance export excludes participant identity, arbitrary text and non-opaque references', () => {
  const exported = pilotExportSummary({
    run: {id:'run', status:'running', dataClassification:'synthetic', candidateReleaseSha:'private@example.test', name:'private name'},
    inviteCode:'secret-code', participants:[{displayLabel:'private participant'}],
    readiness:{stage:'executing', readyToBegin:false, executionComplete:false, blockers:[{code:'required_traveller_not_ready', category:'cohort', messageKey:'pilot.readiness.required_traveller_not_ready', recordId:'private-participant-id'}, {code:'private@example.test',category:'private',messageKey:'private'}]},
    checks:[{code:'one',status:'pass',derived:false,evidenceReference:'ref:123',observedSummary:'private support body'},
      {code:'two',status:'blocked',derived:true,evidenceReference:'private@example.test'}],
  }, '2026-11-07T00:00:00Z');
  const result = JSON.stringify(exported);
  assert.doesNotMatch(result, /secret-code|private/);
  assert.deepEqual(exported.run, {id:'run', status:'running', dataClassification:'synthetic'});
  assert.deepEqual(exported.readiness.blockers, [{code:'required_traveller_not_ready', category:'cohort', messageKey:'pilot.readiness.required_traveller_not_ready'}]);
  assert.equal(exported.checks[0].evidenceReference,'ref:123');
  assert.equal(exported.checks[1].evidenceReference,null);
});
test('approval requires both exact review values and rejection cannot carry them', async () => {
  const {parseOpsPilotCommand} = await import('../lib/contracts/pilot.ts');
  const base = {type:'reviewContentIntake', id:'11111111-1111-4111-8111-111111111111', expectedRevision:2, decision:'approve', reason:'Reviewed'};
  assert.throws(() => parseOpsPilotCommand(base), /INVALID/);
  assert.deepEqual(parseOpsPilotCommand({...base, expectedDraftRevision:3, expectedContentDigest:'a'.repeat(64)}),
    {...base, expectedDraftRevision:3, expectedContentDigest:'a'.repeat(64)});
  assert.throws(() => parseOpsPilotCommand({...base, decision:'reject', expectedDraftRevision:3, expectedContentDigest:'a'.repeat(64)}), /INVALID/);
});

import {parsePilotParticipantCommand} from '../lib/contracts/pilot.ts';

test('withdrawal requires the exact displayed participant and revision',()=>{
 const id='11111111-1111-4111-8111-111111111111';
 const command={type:'withdrawParticipation',requestId:id,runId:id,participantId:id,expectedRevision:2};
 assert.deepEqual(parsePilotParticipantCommand(command),command);
 assert.throws(()=>parsePilotParticipantCommand({type:command.type,requestId:id}));
});
