import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOpsPilotCommand, parsePilotParticipantCommand } from '../lib/contracts/pilot.ts';
const id='123e4567-e89b-12d3-a456-426614174000', other='123e4567-e89b-12d3-a456-426614174001';
const ops=[
{type:'createRun',id,name:'Run',dataClassification:'synthetic',candidateReleaseSha:'dev',environmentOrigin:'http://localhost:3000'},
{type:'configureRun',id,expectedRevision:1,participationNoticeVersion:'p1',participationNoticeDigest:'a'.repeat(64),privacyNoticeVersion:'p1',privacyNoticeDigest:'b'.repeat(64),contentConsentVersion:'c1',contentConsentDigest:'c'.repeat(64),coordinatorReference:'ops:coord',supportOwnerReference:'ops:support',privacyOwnerReference:'ops:privacy',alertOwnerReference:'ops:alerts',privateChannelReference:'channel:private',syntheticRehearsalRunId:null},
{type:'setRunStatus',id,expectedRevision:1,status:'recruiting',reason:'Approved'},
{type:'addParticipant',id,runId:id,role:'traveller',cohortRole:'required_traveller',displayLabel:'Traveller A'},
{type:'setParticipantStatus',id,expectedRevision:1,status:'active',reason:'Verified'},
{type:'createInvite',id,participantId:id,expectedRevision:1,expiresInHours:168},
{type:'revokeInvite',id,participantId:id,expectedRevision:2,reason:'Rotate'},
{type:'reviewContentIntake',id,expectedRevision:1,decision:'approve',expectedDraftRevision:1,expectedContentDigest:'a'.repeat(64),reason:'Rights verified'},
{type:'bindGuide',intakeId:id,guideId:other,expectedRevision:1},
{type:'bindCollaboration',id,runId:id,merchantParticipantId:id,creatorParticipantId:other,missionId:id},
{type:'setManualCheck',id,expectedRevision:1,status:'pass',evidenceReference:'private:evidence',observedSummary:'Observed'},
{type:'addEvidenceReference',runId:id,checkCode:'check',entityType:'guide',entityId:id,evidenceReference:null}];
const intake={title:'Title',destination:'Place',authoredLocale:'en',sourceSummary:'Observed research',sourceUrls:['https://example.com/'],rightsBasis:'original',rightsEvidenceReference:'private:rights',authorConsentVersion:'v1',authorConsentDigest:'c'.repeat(64),coverRightsConfirmed:null,coverRightsEvidenceReference:null};
const participant=[{type:'claimInvite',requestId:id,code:'a'.repeat(32)},{type:'acceptConsent',requestId:id,noticeVersion:'p1',noticeDigest:'a'.repeat(64),privacyNoticeVersion:'privacy-v1',privacyNoticeDigest:'b'.repeat(64)},{type:'submitContentIntake',requestId:id,intake},{type:'updateOwnedContentIntake',requestId:id,id:other,expectedRevision:1,intake:{...intake,sourceUrls:[],rightsBasis:'permission',coverRightsConfirmed:true,coverRightsEvidenceReference:'private:cover'}},{type:'acknowledgeNotification',requestId:id},{type:'acknowledgeSupportResponse',requestId:id}];
test('accepts every operations command variant',()=>{for(const c of ops) assert.deepEqual(parseOpsPilotCommand(c),c)});
test('accepts every participant command variant',()=>{for(const c of participant) assert.deepEqual(parsePilotParticipantCommand(c),c)});
test('rejects unknown keys, commands, duplicate IDs and invalid UUIDs',()=>{assert.throws(()=>parseOpsPilotCommand({...ops[0],extra:true}));assert.throws(()=>parseOpsPilotCommand({...ops[0],type:'invented'}));assert.throws(()=>parseOpsPilotCommand({...ops[9],creatorParticipantId:id}));assert.throws(()=>parseOpsPilotCommand({...ops[9],creatorParticipantId:id.toUpperCase()}));assert.throws(()=>parseOpsPilotCommand({...ops[3],runId:'bad'}))});
test('bounds text and restricts content source URLs to HTTP(S)',()=>{assert.throws(()=>parseOpsPilotCommand({...ops[0],name:'x'.repeat(201)}));assert.throws(()=>parsePilotParticipantCommand({...participant[2],intake:{...intake,sourceSummary:'x'.repeat(4001)}}));for(const url of ['javascript:alert(1)','file:///tmp/a','ftp://example.com'])assert.throws(()=>parsePilotParticipantCommand({...participant[2],intake:{...intake,sourceUrls:[url]}}))});
test('requires real run release identity and secure origin',()=>{const real={...ops[0],dataClassification:'real',candidateReleaseSha:'a'.repeat(40),environmentOrigin:'https://example.com'};assert.throws(()=>parseOpsPilotCommand({...real,candidateReleaseSha:'A'.repeat(40)}));assert.throws(()=>parseOpsPilotCommand({...real,environmentOrigin:'http://example.com'}));assert.equal(parseOpsPilotCommand(real).candidateReleaseSha,'a'.repeat(40))});
test('validates configured notices, owner references and rehearsal reference',()=>{const config={...ops[1],syntheticRehearsalRunId:other};assert.throws(()=>parseOpsPilotCommand({...config,privacyNoticeVersion:''}));assert.throws(()=>parseOpsPilotCommand({...config,syntheticRehearsalRunId:'bad'}));assert.throws(()=>parseOpsPilotCommand({...config,alertOwnerReference:''}))});
test('rejects invalid run statuses and missing state-change reasons',()=>{assert.throws(()=>parseOpsPilotCommand({...ops[2],status:'ready'}));assert.throws(()=>parseOpsPilotCommand({...ops[2],reason:''}));assert.throws(()=>parseOpsPilotCommand({...ops[4],reason:''}));assert.throws(()=>parseOpsPilotCommand({...ops[6],reason:''}));assert.throws(()=>parseOpsPilotCommand({...ops[7],reason:''}))});
test('validates invite duration and manual pass evidence',()=>{for(const hours of [0,169,1.5])assert.throws(()=>parseOpsPilotCommand({...ops[5],expiresInHours:hours}));assert.throws(()=>parseOpsPilotCommand({...ops[10],evidenceReference:null}));assert.throws(()=>parseOpsPilotCommand({...ops[10],observedSummary:null}))});
test('invite mutations require a positive observed participant revision',()=>{
 for(const command of [ops[5],ops[6]]) {
  assert.deepEqual(parseOpsPilotCommand(command),command);
  for(const expectedRevision of [undefined,null,0,-1,1.5,'1']) assert.throws(()=>parseOpsPilotCommand({...command,expectedRevision}));
 }
});
test('manual evidence supports scoped participant IDs and external run evidence',()=>{
 const base={type:'addEvidenceReference',runId:id,checkCode:'guide_discovered',entityType:'guide',entityId:other,participantId:id,evidenceReference:'ref:'+other};
 assert.deepEqual(parseOpsPilotCommand(base),base);
 for(const participantId of [undefined,null,'bad']) assert.throws(()=>parseOpsPilotCommand({...base,participantId}));
 assert.throws(()=>parseOpsPilotCommand({...base,entityType:'manual'}));
 assert.throws(()=>parseOpsPilotCommand({...base,checkCode:'trip_recovered'}));
 const manual={...base,checkCode:'physical_ios',entityType:'manual',entityId:id,participantId:null};
 assert.deepEqual(parseOpsPilotCommand(manual),manual);
 assert.throws(()=>parseOpsPilotCommand({...manual,entityId:other}));
 assert.throws(()=>parseOpsPilotCommand({...manual,participantId:id}));
 assert.throws(()=>parseOpsPilotCommand({...manual,evidenceReference:null}));
});
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
  participationNoticeVersion: 'p1',participationNoticeDigest:'a'.repeat(64), privacyNoticeVersion: 'p1',privacyNoticeDigest:'b'.repeat(64), contentConsentVersion: 'c1',contentConsentDigest:'c'.repeat(64),
  minimumPublishedGuides: 3,
};
const setup = {
  run: { ...run, status: 'recruiting', acceptanceStartedAt: null },
  requiredRoles: ['traveller','creator','merchant'], capabilityConnected: true, ownersConfigured: true, noticesPinned: true, syntheticRehearsalPassed: true,
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

test('manual evidence requires a valid capture strictly after acceptance start and a running run', () => {
  assert.equal(pilotEvidenceEligible(started, started, 'running'), false);
  assert.equal(pilotEvidenceEligible('2026-11-07T00:00:01Z', started, 'running'), true);
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
    approvedDraftRevision: 2, approvedContentDigest: 'digest', reviewedGuideVersion: null,
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

test('publication eligibility checks draft revision and reviewed guide version independently', () => {
  const input = {
    pilotLinked: true, runStatus: 'running', intakeStatus: 'approved',
    approvedDraftRevision: 2, approvedContentDigest: 'digest', reviewedGuideVersion: 7,
    currentDraftRevision: 2, currentContentDigest: 'digest', publishedVersion: 7,
    creatorIsActive: true, guideIsWithdrawn: false,
  };
  assert.deepEqual(pilotCanPublish(input), { allowed: true });
  for (const patch of [
    { publishedVersion: 8 }, { publishedVersion: 2 }, { publishedVersion: null },
    { currentDraftRevision: 3 }, { reviewedGuideVersion: null },
  ]) {
    assert.deepEqual(pilotCanPublish({ ...input, ...patch }), { allowed: false, reason: 'revision_changed' });
  }
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
const later = '2026-11-07T00:00:01Z';
const latest = '2026-11-07T00:00:02Z';
const fact = { runId: id, dataClassification: 'real', capturedAt: later };
const approved = { ...fact, capturedAt: latest, entityId: 'submission', missionId: 'mission', creatorUserId: 'creator-auth', status: 'approved' };
const notification = {
  ...fact, capturedAt: '2026-11-07T00:00:03Z', entityId: 'notification', entityType: 'mission',
  missionId: 'mission', submissionId: 'submission', creatorUserId: 'creator-auth', notificationType: 'submission.approved',
};
const facts = {
  participants: participants.map(p => ({ ...fact, entityId: p.id, userId: p.id + '-auth' })),
  publications: contentIntakes.map(i => ({
    ...fact, entityId: i.guideId, intakeId: i.id, creatorUserId: 'creator-auth',
    status: 'published', publishedVersion: i.reviewedGuideVersion, publishedContentDigest: i.contentDigest,
    currentDraftRevision: i.guideDraftRevision, currentContentDigest: i.contentDigest,
  })),
  checks: [...checks, ...collaboration.steps].map(c => ({
    ...fact, code: c.code, status: c.status, entityId: c.code + '-source', missionId: 'mission',
    ...(c.code === 'notification_acknowledged' ? { notificationId: notification.entityId, capturedAt: '2026-11-07T00:00:04Z' } : {}),
  })),
  submissions: [approved],
  notifications: [notification],
};
const execution = { run, participants, contentIntakes, collaboration, checks, facts };
const complete = (patch = {}) => pilotExecutionReadiness({ ...execution, ...patch }).executionComplete;
const withFacts = patch => complete({ facts: { ...facts, ...patch } });

test('execution requires all slots and distinct source Auth identities', () => {
  assert.equal(pilotExecutionReadiness(execution).stage, 'execution_complete');
  assert.equal(pilotExecutionReadiness(execution).readyToBegin, false);
  assert.equal(complete({ participants: participants.slice(1) }), false);
  assert.equal(withFacts({ participants: facts.participants.map(p => ({ ...p, userId: 'same-auth' })) }), false);
  assert.equal(withFacts({ participants: facts.participants.slice(1) }), false);
});

test('passing projections require source facts scoped to this run, classification and acceptance window', () => {
  assert.equal(complete({ facts: undefined }), false);
  for (const patch of [
    { runId: 'different-run' }, { dataClassification: 'synthetic' }, { capturedAt: started },
    { capturedAt: '2026-11-06T23:59:59Z' }, { capturedAt: 'invalid' }, { entityId: '' }, { status: 'fail' },
  ]) {
    assert.equal(withFacts({ checks: facts.checks.map(c => c.code === 'guide_saved' ? { ...c, ...patch } : c) }), false);
  }
});

test('publication facts must match each reviewed guide, creator, version and digest', () => {
  for (const patch of [
    { publishedVersion: 99 }, { publishedContentDigest: 'changed' }, { creatorUserId: 'other-auth' },
    { entityId: 'unbound-guide' }, { status: 'withdrawn' }, { capturedAt: started },
  ]) assert.equal(withFacts({ publications: [{ ...facts.publications[0], ...patch }, ...facts.publications.slice(1)] }), false);
  for (const patch of [{ creatorParticipantId: 'other' }, { status: 'withdrawn' }, { reviewedGuideVersion: 99 }]) {
    assert.equal(complete({ contentIntakes: [{ ...contentIntakes[0], ...patch }, ...contentIntakes.slice(1)] }), false);
  }
});

test('execution accepts a reviewed publication version independent of the approved draft revision', () => {
  const intake = { ...contentIntakes[0], guideDraftRevision: 2, reviewedGuideVersion: 7 };
  const publication = { ...facts.publications[0], publishedVersion: 7, currentDraftRevision: 2 };
  const evaluate = (reviewedIntake, publishedFact) => pilotExecutionReadiness({
    ...execution,
    contentIntakes: [reviewedIntake, ...contentIntakes.slice(1)],
    facts: { ...facts, publications: [publishedFact, ...facts.publications.slice(1)] },
  });
  assert.equal(evaluate(intake, publication).executionComplete, true);
  for (const publishedVersion of [8, 2]) {
    const readiness = evaluate(intake, { ...publication, publishedVersion });
    assert.equal(readiness.executionComplete, false);
    assert.ok(readiness.blockers.some(blocker => blocker.code === 'guide_not_exact' && blocker.recordId === intake.id));
  }
  assert.equal(evaluate(
    { ...intake, reviewedGuideVersion: null }, { ...publication, publishedVersion: null },
  ).executionComplete, false);
});

for (const [label, drift] of [
  ['later revision', { currentDraftRevision: 3 }],
  ['changed digest', { currentContentDigest: 'changed' }],
  ['missing revision', { currentDraftRevision: undefined }],
  ['null digest', { currentContentDigest: null }],
]) {
  test(`execution blocks post-approval draft drift (${label}) until the approved draft is restored`, () => {
    const intake = { ...contentIntakes[0], guideDraftRevision: 2, reviewedGuideVersion: 7 };
    const publication = {
      ...facts.publications[0], publishedVersion: 7,
      currentDraftRevision: 2, currentContentDigest: intake.contentDigest,
    };
    const evaluate = () => pilotExecutionReadiness({
      ...execution,
      contentIntakes: [intake, ...contentIntakes.slice(1)],
      facts: { ...facts, publications: [publication, ...facts.publications.slice(1)] },
    });
    assert.equal(evaluate().executionComplete, true);
    Object.assign(publication, drift);
    const readiness = evaluate();
    assert.equal(readiness.executionComplete, false);
    assert.ok(readiness.blockers.some(blocker => blocker.code === 'guide_not_exact' && blocker.recordId === intake.id));
    Object.assign(publication, { currentDraftRevision: 2, currentContentDigest: intake.contentDigest });
    assert.equal(evaluate().executionComplete, true);
    assert.equal(publication.publishedVersion, 7);
    assert.equal(publication.publishedContentDigest, intake.contentDigest);
  });
}

test('revision requested must be followed by source approval and its exact mission notification', () => {
  const requested = { ...approved, capturedAt: later, entityId: 'initial-submission', status: 'revision_requested' };
  const sequence = [requested];
  assert.equal(withFacts({ submissions: sequence }), false);
  sequence.push(approved);
  assert.equal(withFacts({ submissions: sequence }), true);
  assert.equal(withFacts({ submissions: [...sequence, { ...requested, capturedAt: '2026-11-07T00:00:04Z' }] }), false);
  for (const patch of [{ missionId: 'other' }, { creatorUserId: 'other' }, { capturedAt: started }]) {
    assert.equal(withFacts({ submissions: [requested, { ...approved, ...patch }] }), false);
  }
  for (const patch of [
    { missionId: 'other' }, { submissionId: requested.entityId }, { notificationType: 'submission.revised' },
    { entityType: 'guide' }, { creatorUserId: 'other' }, { capturedAt: later },
  ]) assert.equal(withFacts({ submissions: sequence, notifications: [{ ...notification, ...patch }] }), false);
});

test('export is deterministic and retains only opaque references and allowlisted fields', () => {
  const snapshot = {
    ...execution, run: { ...run, contactEmail: 'PRIVATE' }, inviteCode: 'PRIVATE',
    tripTitle: 'PRIVATE', supportMessage: 'PRIVATE', privateEvidenceBody: 'PRIVATE',
    checks: [{ ...checks[0], evidenceReference: 'ref:1' },
      ...[' PRIVATE ', 'PRIVATE support sentence', 'PRIVATE@example.com', 'https://private.example'].map(evidenceReference =>
        ({ ...checks[0], evidenceReference }))],
    readiness: { ...pilotExecutionReadiness(execution), privateEvidenceBody: 'PRIVATE',
      blockers: [{ code: 'test', category: 'test', messageKey: 'pilot.test', privateEvidenceBody: 'PRIVATE' }] },
  };
  const summary = pilotExportSummary(snapshot, latest);
  assert.equal(summary.schemaVersion, 1);
  assert.equal(summary.exportedAt, latest);
  assert.deepEqual(summary, pilotExportSummary(snapshot, latest));
  assert.deepEqual(summary.checks.map(c => c.evidenceReference), ['ref:1', null, null, null, null]);
  assert.equal(JSON.stringify(summary).includes('PRIVATE'), false);
  assert.throws(() => pilotExportSummary(snapshot, 'invalid'), RangeError);
});

test('only acknowledgement of the exact final approval notification completes execution', () => {
  const earlier = { ...notification, entityId: 'earlier-notification', capturedAt: approved.capturedAt };
  const notifications = [earlier, notification];
  const acknowledge = notificationId => facts.checks.map(check =>
    check.code === 'notification_acknowledged' ? { ...check, notificationId } : check);
  assert.equal(withFacts({ notifications, checks: acknowledge(earlier.entityId) }), false);
  assert.equal(withFacts({ notifications, checks: acknowledge(notification.entityId) }), true);
});
