import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOpsPilotCommand, parsePilotParticipantCommand } from '../lib/contracts/pilot.ts';
const id='123e4567-e89b-12d3-a456-426614174000', other='123e4567-e89b-12d3-a456-426614174001';
const ops=[
{type:'createRun',id,name:'Run',dataClassification:'synthetic',candidateReleaseSha:'dev',environmentOrigin:'http://localhost:3000'},
{type:'configureRun',id,expectedRevision:1,participationNoticeVersion:'p1',privacyNoticeVersion:'p1',contentConsentVersion:'c1',coordinatorReference:'ops:coord',supportOwnerReference:'ops:support',privacyOwnerReference:'ops:privacy',alertOwnerReference:'ops:alerts',privateChannelReference:'channel:private',syntheticRehearsalRunId:null},
{type:'setRunStatus',id,expectedRevision:1,status:'recruiting',reason:'Approved'},
{type:'addParticipant',id,runId:id,role:'traveller',cohortRole:'required_traveller',displayLabel:'Traveller A'},
{type:'setParticipantStatus',id,expectedRevision:1,status:'active',reason:'Verified'},
{type:'createInvite',id,participantId:id,expiresInHours:168},
{type:'revokeInvite',id,participantId:id,reason:'Rotate'},
{type:'reviewContentIntake',id,expectedRevision:1,decision:'approve',reason:'Rights verified'},
{type:'bindGuide',intakeId:id,guideId:other,expectedRevision:1},
{type:'bindCollaboration',id,runId:id,merchantParticipantId:id,creatorParticipantId:other,missionId:id},
{type:'setManualCheck',id,expectedRevision:1,status:'pass',evidenceReference:'private:evidence',observedSummary:'Observed'},
{type:'addEvidenceReference',runId:id,checkCode:'check',entityType:'guide',entityId:id,evidenceReference:null}];
const intake={title:'Title',destination:'Place',authoredLocale:'en',sourceSummary:'Observed research',sourceUrls:['https://example.com/'],rightsBasis:'original',rightsEvidenceReference:'private:rights',authorConsentVersion:'v1',coverRightsConfirmed:null,coverRightsEvidenceReference:null};
const participant=[{type:'claimInvite',requestId:id,code:'a'.repeat(32)},{type:'acceptConsent',requestId:id,noticeVersion:'p1'},{type:'submitContentIntake',requestId:id,intake},{type:'updateOwnedContentIntake',requestId:id,id:other,expectedRevision:1,intake:{...intake,sourceUrls:[],rightsBasis:'permission',coverRightsConfirmed:true,coverRightsEvidenceReference:'private:cover'}},{type:'acknowledgeNotification',requestId:id},{type:'acknowledgeSupportResponse',requestId:id}];
test('accepts every operations command variant',()=>{for(const c of ops) assert.deepEqual(parseOpsPilotCommand(c),c)});
test('accepts every participant command variant',()=>{for(const c of participant) assert.deepEqual(parsePilotParticipantCommand(c),c)});
test('rejects unknown keys, commands, duplicate IDs and invalid UUIDs',()=>{assert.throws(()=>parseOpsPilotCommand({...ops[0],extra:true}));assert.throws(()=>parseOpsPilotCommand({...ops[0],type:'invented'}));assert.throws(()=>parseOpsPilotCommand({...ops[9],creatorParticipantId:id}));assert.throws(()=>parseOpsPilotCommand({...ops[9],creatorParticipantId:id.toUpperCase()}));assert.throws(()=>parseOpsPilotCommand({...ops[3],runId:'bad'}))});
test('bounds text and restricts content source URLs to HTTP(S)',()=>{assert.throws(()=>parseOpsPilotCommand({...ops[0],name:'x'.repeat(201)}));assert.throws(()=>parsePilotParticipantCommand({...participant[2],intake:{...intake,sourceSummary:'x'.repeat(4001)}}));for(const url of ['javascript:alert(1)','file:///tmp/a','ftp://example.com'])assert.throws(()=>parsePilotParticipantCommand({...participant[2],intake:{...intake,sourceUrls:[url]}}))});
test('requires real run release identity and secure origin',()=>{const real={...ops[0],dataClassification:'real',candidateReleaseSha:'a'.repeat(40),environmentOrigin:'https://example.com'};assert.throws(()=>parseOpsPilotCommand({...real,candidateReleaseSha:'A'.repeat(40)}));assert.throws(()=>parseOpsPilotCommand({...real,environmentOrigin:'http://example.com'}));assert.equal(parseOpsPilotCommand(real).candidateReleaseSha,'a'.repeat(40))});
test('validates configured notices, owner references and rehearsal reference',()=>{const config={...ops[1],syntheticRehearsalRunId:other};assert.throws(()=>parseOpsPilotCommand({...config,privacyNoticeVersion:''}));assert.throws(()=>parseOpsPilotCommand({...config,syntheticRehearsalRunId:'bad'}));assert.throws(()=>parseOpsPilotCommand({...config,alertOwnerReference:''}))});
test('rejects invalid run statuses and missing state-change reasons',()=>{assert.throws(()=>parseOpsPilotCommand({...ops[2],status:'ready'}));assert.throws(()=>parseOpsPilotCommand({...ops[2],reason:''}));assert.throws(()=>parseOpsPilotCommand({...ops[4],reason:''}));assert.throws(()=>parseOpsPilotCommand({...ops[6],reason:''}));assert.throws(()=>parseOpsPilotCommand({...ops[7],reason:''}))});
test('validates invite duration and manual pass evidence',()=>{for(const hours of [0,169,1.5])assert.throws(()=>parseOpsPilotCommand({...ops[5],expiresInHours:hours}));assert.throws(()=>parseOpsPilotCommand({...ops[10],evidenceReference:null}));assert.throws(()=>parseOpsPilotCommand({...ops[10],observedSummary:null}))});
test('participant commands cannot carry operations identity or authority fields',()=>{for(const key of ['userId','runId','decision','approval','role','evidenceReference'])assert.throws(()=>parsePilotParticipantCommand({...participant[0],[key]:'forbidden'}))});
test('rejects unknown participant command names',()=>{assert.throws(()=>parsePilotParticipantCommand({...participant[0],type:'approveContent'}))});

import {
  pilotBeginReadiness, pilotExecutionReadiness, pilotCanPublish,
  pilotEvidenceEligible, pilotExportSummary,
} from '../lib/pilot/readiness.ts';

const started = '2026-11-07T00:00:00Z';
const run = {
  id, status: 'running', dataClassification: 'real', candidateReleaseSha: 'a'.repeat(40),
  environmentOrigin: 'https://pilot.example', acceptanceStartedAt: started,
  participationNoticeVersion: 'p1', privacyNoticeVersion: 'p1', contentConsentVersion: 'c1',
  minimumPublishedGuides: 3,
};
const setup = {
  run: { ...run, status: 'recruiting', acceptanceStartedAt: null },
  capabilityConnected: true, ownersConfigured: true, noticesPinned: true, syntheticRehearsalPassed: true,
};

test('begin readiness separates setup from execution and orders setup blockers', () => {
  const ready = pilotBeginReadiness(setup);
  assert.equal(ready.readyToBegin, true);
  assert.equal(ready.executionComplete, false);
  const incomplete = pilotBeginReadiness({
    ...setup, run: { ...setup.run, environmentOrigin: '', candidateReleaseSha: '' },
    capabilityConnected: false, ownersConfigured: false, noticesPinned: false, syntheticRehearsalPassed: false,
  });
  assert.equal(incomplete.stage, 'setup_incomplete');
  assert.deepEqual(incomplete.blockers.map(x => x.code), [
    'source_missing', 'release_missing', 'capability_disconnected', 'owners_missing',
    'notices_unpinned', 'rehearsal_missing',
  ]);
  assert.equal(pilotBeginReadiness({ ...setup, run: { ...setup.run, privacyNoticeVersion: null } }).readyToBegin, false);
});

test('manual evidence requires a valid capture at or after acceptance start and a running run', () => {
  assert.equal(pilotEvidenceEligible(started, started, 'running'), true);
  assert.equal(pilotEvidenceEligible('2026-11-06T23:59:59Z', started, 'running'), false);
  assert.equal(pilotEvidenceEligible('invalid', started, 'running'), false);
  assert.equal(pilotEvidenceEligible(started, null, 'running'), false);
  for (const status of ['draft', 'recruiting', 'paused', 'completed', 'cancelled']) {
    assert.equal(pilotEvidenceEligible(started, started, status), false);
  }
});

test('publication requires exact approval, active creator and a non-withdrawn guide', () => {
  const input = {
    pilotLinked: true, runStatus: 'running', intakeStatus: 'approved',
    approvedDraftRevision: 2, approvedContentDigest: 'digest',
    currentDraftRevision: 2, currentContentDigest: 'digest', publishedVersion: null,
    creatorIsActive: true, guideIsWithdrawn: false,
  };
  assert.deepEqual(pilotCanPublish(input), { allowed: true });
  for (const [patch, reason] of [
    [{ currentContentDigest: 'changed' }, 'digest_changed'],
    [{ currentDraftRevision: 3 }, 'revision_changed'],
    [{ publishedVersion: 1 }, 'revision_changed'],
    [{ creatorIsActive: false }, 'creator_inactive'],
    [{ guideIsWithdrawn: true }, 'guide_withdrawn'],
    [{ intakeStatus: null }, 'intake_not_approved'],
    [{ runStatus: 'paused' }, 'run_not_running'],
  ]) assert.deepEqual(pilotCanPublish({ ...input, ...patch }), { allowed: false, reason });
  assert.deepEqual(pilotCanPublish({ ...input, pilotLinked: false, runStatus: 'paused' }), { allowed: true });
});

const participants = ['traveller', 'creator', 'merchant'].map(role => ({
  id: role, role, cohortRole: 'required_' + role, status: 'active',
  userLinked: true, consentAccepted: true, displayLabel: 'PRIVATE',
}));
const contentIntakes = [1, 2, 3].map(n => ({
  id: 'intake-' + n, creatorParticipantId: 'creator', guideId: 'guide-' + n,
  status: 'published', guideDraftRevision: n, reviewedGuideVersion: n, contentDigest: 'digest',
}));
const collaboration = {
  id: 'binding', merchantParticipantId: 'merchant', creatorParticipantId: 'creator', missionId: 'mission',
  steps: ['merchant_approved', 'mission_published', 'application_active', 'submission_approved',
    'submission.approved', 'notification_acknowledged'].map(code => ({ code, status: 'pass' })),
};
const checks = [
  ...['distinct_auth_users', 'creator_public', 'guide_publication_exact', 'guide_saved',
    'trip_adopted', 'trip_revised', 'support_resolved', 'support_acknowledged'].map(code => ({ code, derived: true })),
  ...['guide_discovered', 'trip_recovered', 'privacy_support', 'alert_owner',
    'physical_ios', 'physical_android', 'voiceover', 'nvda'].map(code => ({ code, derived: false })),
].map(check => ({ ...check, category: 'test', status: 'pass', evidenceReference: 'ref:1', observedSummary: 'PRIVATE' }));
const execution = { run, participants, contentIntakes, collaboration, checks };

test('execution requires each role, distinct Auth users and exact guide bindings', () => {
  const ready = pilotExecutionReadiness(execution);
  assert.equal(ready.stage, 'execution_complete');
  assert.equal(ready.readyToBegin, false);
  for (const patch of [
    { participants: participants.slice(1) },
    { checks: checks.map(x => x.code === 'distinct_auth_users' ? { ...x, status: 'fail' } : x) },
    { checks: checks.filter(x => x.code !== 'guide_publication_exact') },
    ...[{ creatorParticipantId: 'other' }, { status: 'withdrawn' }, { reviewedGuideVersion: 99 }].map(change =>
      ({ contentIntakes: [{ ...contentIntakes[0], ...change }, ...contentIntakes.slice(1)] })),
  ]) assert.equal(pilotExecutionReadiness({ ...execution, ...patch }).executionComplete, false);
});

test('revision requested and an unrelated notification cannot satisfy collaboration', () => {
  for (const steps of [
    collaboration.steps.map(x => x.code === 'submission_approved' ? { ...x, status: 'fail' } : x),
    collaboration.steps.map(x => x.code === 'submission.approved' ? { ...x, code: 'submission.revised' } : x),
  ]) assert.equal(pilotExecutionReadiness({ ...execution, collaboration: { ...collaboration, steps } }).executionComplete, false);
  assert.equal(pilotExecutionReadiness(execution).executionComplete, true);
});

test('export only includes allowlisted fields, including nested records', () => {
  const summary = pilotExportSummary({
    ...execution, run: { ...run, contactEmail: 'PRIVATE' }, inviteCode: 'PRIVATE',
    tripTitle: 'PRIVATE', supportMessage: 'PRIVATE', privateEvidenceBody: 'PRIVATE',
    readiness: { ...pilotExecutionReadiness(execution), privateEvidenceBody: 'PRIVATE',
      blockers: [{ code: 'test', category: 'test', messageKey: 'pilot.test', privateEvidenceBody: 'PRIVATE' }] },
  });
  assert.equal(summary.schemaVersion, 1);
  assert.equal(Number.isFinite(Date.parse(summary.exportedAt)), true);
  assert.equal(summary.checks[0].evidenceReference, 'ref:1');
  assert.equal(JSON.stringify(summary).includes('PRIVATE'), false);
});
