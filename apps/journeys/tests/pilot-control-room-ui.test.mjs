import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pilotExportSummary } from '../lib/pilot/readiness.ts';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const room = name => read('app/travel/pilot/' + name + '.tsx');

test('pilot is routed before the generic operations renderer', () => {
  const source = read('app/travel/OpsWorkspace.tsx');
  assert.match(source, /if\(view==='pilot'\)return <PilotControlRoom[\s\S]+if\(dashboard\)return <OpsDashboardWorkspace/);
});

test('access, readiness and same-object retry are explicit UI contracts', () => {
  const source = room('PilotControlRoom');
  for (const term of ['Sign in to continue','FORBIDDEN','Read only','Setup incomplete','Ready to begin','Executing','Execution complete','Completed','Blocked','recordId']) assert.ok((source + room('PilotRun')).includes(term), term);
  assert.match(source, /opsPilot\.command\(intent\.command, actorId\)/);
  assert.match(source, /<Modal[\s\S]+returnFocus=/);
});

test('the room uses wrapping cards and limits private rendering and editing', () => {
  const source = ['PilotControlRoom','PilotParticipants','PilotContentReview','PilotChecks'].map(room).join('\n');
  assert.doesNotMatch(source, /<table|<pre|\.email\b|\.supportText\b|\.tripText\b|\.observedSummary\b/);
  assert.match(source, /overflowWrap: 'anywhere'/);
  assert.match(room('PilotChecks'), /!check\.derived/);
  assert.match(room('PilotContentReview'), /guideDraftRevision[\s\S]+contentDigest[\s\S]+reason/);
  assert.match(room('PilotParticipants'), /cannot be retrieved[\s\S]+rotate/i);
  assert.match(room('PilotControlRoom'), /navigator\.clipboard[\s\S]+manual/i);
});

test('acceptance export excludes participant identity, arbitrary text and non-opaque references', () => {
  const exported = pilotExportSummary({
    run: {id:'run', status:'running', dataClassification:'real', candidateReleaseSha:'sha', name:'private name'},
    inviteCode:'secret-code', participants:[{displayLabel:'private participant'}],
    readiness:{stage:'executing', readyToBegin:false, executionComplete:false, blockers:[{code:'required_traveller_not_ready', category:'cohort', messageKey:'pilot.readiness.required_traveller_not_ready', recordId:'private-participant-id'}]},
    checks:[{code:'one',status:'pass',derived:false,evidenceReference:'ref:123',observedSummary:'private support body'},
      {code:'two',status:'blocked',derived:true,evidenceReference:'private@example.test'}],
  }, '2026-11-07T00:00:00Z');
  const result = JSON.stringify(exported);
  assert.doesNotMatch(result, /secret-code|private/);
  assert.equal(exported.checks[0].evidenceReference,'ref:123');
  assert.equal(exported.checks[1].evidenceReference,null);
});
