import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createContext, runInContext} from 'node:vm';
import {build} from 'esbuild';

const require = createRequire(import.meta.url);
const runId = '11111111-1111-4111-8111-111111111111';
const participantId = '22222222-2222-4222-8222-222222222222';
const intakeId = '33333333-3333-4333-8333-333333333333';
const requestId = '44444444-4444-4444-8444-444444444444';
const actorId = '55555555-5555-4555-8555-555555555555';
const otherId = '66666666-6666-4666-8666-666666666666';
const origin = 'https://pilot.example.test';
const emptyFacts = () => ({participants: [], publications: [], checks: [], submissions: [], notifications: []});
const snapshot = (status = 'draft') => ({
  run: {
    id: runId, name: 'Synthetic pilot', status, revision: 1, dataClassification: 'synthetic',
    candidateReleaseSha: 'synthetic', environmentOrigin: origin,
    acceptanceStartedAt: status === 'running' ? '2026-11-07T00:00:00Z' : null,
    minimumPublishedGuides: 1, participationNoticeVersion: 'v1',participationNoticeDigest:'a'.repeat(64),
    privacyNoticeVersion: 'v1',privacyNoticeDigest:'b'.repeat(64), contentConsentVersion: 'v1',contentConsentDigest:'c'.repeat(64),
  },
  participants: [], contentIntakes: [], collaboration: null, checks: [],
  facts: {...emptyFacts(), privateMarker: 'PRIVATE_AUTH_SOURCE'},
  beginFacts: {rpcAvailable: true, ownersConfigured: true, noticesPinned: true, syntheticRehearsalPassed: true},
  readiness: {stage: 'execution_complete', readyToBegin: true, executionComplete: true, blockers: []},
});
const createRun = {
  type: 'createRun', id: runId, name: 'Synthetic pilot', dataClassification: 'synthetic',
  candidateReleaseSha: 'synthetic', environmentOrigin: origin,
};

async function compile(relative) {
  const entry = new URL(relative, import.meta.url);
  if (!existsSync(entry)) return null;
  const compiled = await build({
    entryPoints: [fileURLToPath(entry)], bundle: true, write: false, platform: 'node', format: 'cjs',
    plugins: [{
      name: 'pilot-external-boundaries',
      setup(builder) {
        builder.onResolve({filter: /supabase\/server(?:\.ts)?$/}, () => ({path: 'session', namespace: 'pilot-test'}));
        builder.onResolve({filter: /telemetry\/server(?:\.ts)?$/}, () => ({path: 'observer', namespace: 'pilot-test'}));
        builder.onResolve({filter: /contracts\/capabilities(?:\.ts)?$/}, () => ({path: 'capabilities', namespace: 'pilot-test'}));
        builder.onLoad({filter: /.*/, namespace: 'pilot-test'}, ({path}) => ({
          contents: path === 'session' ? 'export async function serverClient(){return globalThis.fixture.client}'
            : path === 'observer' ? 'export function observeRequest(){}; export const timedRpc=(client,name,args)=>client.rpc(name,args); export async function successEvent(){}'
              : 'export function capabilities(){return {pilot:{mode:globalThis.fixture.mode},creator:{mode:globalThis.fixture.mode}}}',
          loader: 'js',
        }));
      },
    }],
  });
  return compiled.outputFiles[0].text;
}

const routeCode = await compile('../app/api/ops/pilot/route.ts');
const repositoryCode = await compile('../lib/pilot/repository.ts');
const telemetryCode = await compile('../lib/pilot/telemetry.ts');

function load(code, fixture = {}) {
  assert.ok(code, 'Task 5 production module must exist');
  const module = {exports: {}};
  const context = createContext({
    module, exports: module.exports, require, Request, Response, Headers, URL, URLSearchParams,
    Buffer, TextEncoder, AbortController, AbortSignal, crypto: globalThis.crypto, performance, fixture,
    process: {env: {KINNSO_SITE_URL: origin}}, fetch: (...args) => fixture.fetch(...args),
    console: {info: (...args) => {
      if (fixture.telemetryThrows) throw new Error('Optional telemetry failed');
      fixture.events.push(args);
    }},
  });
  runInContext(code, context);
  return module.exports;
}

function setup(options = {}) {
  const state = {
    mode: 'connected', events: [], calls: [], denied: null, error: null, throws: false,
    data: snapshot(), mutation: null, ...options,
  };
  state.client = {
    auth: {getUser: async () => ({
      data: {user: state.denied === 401 ? null : {id: actorId}},
      error: state.denied === 401 ? {message: 'unauthenticated'} : null,
    })},
    rpc: async (name, args) => {
      if (name === 'kinnso_actor') return {data: {id: actorId, roles: ['ops']}, error: null};
      state.calls.push({name, args});
      if (state.throws) throw new Error('Unknown network outcome');
      if (state.denied === 403) return {data: null, error: {message: 'FORBIDDEN'}};
      if (state.error) return {data: null, error: state.error};
      return {
        data: name.startsWith('get_kinnso_') ? state.data
          : state.mutation ?? {snapshot: state.data, _pilotReplay: false}, error: null,
      };
    },
  };
  return {state, route: load(routeCode, state)};
}

function request(body, query = '', headers = {}) {
  return new Request(origin + '/api/ops/pilot' + query, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {host: 'pilot.example.test', 'content-type': 'application/json', ...body === undefined ? {} : {origin}, ...headers},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function expectFailure(response, status, code, expectedRequestId) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('vary'), 'Cookie');
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.code, code);
  assert.equal(body.retryable, status === 503);
  assert.equal('data' in body, false);
  assert.equal(typeof body.requestId, 'string');
  if (expectedRequestId) assert.equal(body.requestId, expectedRequestId);
  return body;
}

function assertRedacted(value) {
  const serialized = JSON.stringify(value);
  assert.equal(serialized.includes('PRIVATE_AUTH_SOURCE'), false);
  assert.equal(serialized.includes('"facts"'), false);
  assert.equal(serialized.includes('"beginFacts"'), false);
}

test('GET accepts one optional UUID runId and rejects unknown or duplicate query fields', async () => {
  const {state, route} = setup();
  for (const query of ['', '?runId=' + runId]) {
    const response = await route.GET(request(undefined, query));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(state.calls)), [
    {name: 'get_kinnso_ops_pilot', args: {p_run_id: null}},
    {name: 'get_kinnso_ops_pilot', args: {p_run_id: runId}},
  ]);
  for (const query of ['?runId=', '?runId=invalid', '?runId=' + runId + '&runId=' + runId, '?extra=x']) {
    await expectFailure(await route.GET(request(undefined, query)), 400, 'INVALID');
  }
  assert.equal(state.calls.length, 2);
  assert.equal(state.events.length, 0);
});

test('GET evaluates begin facts and execution facts before redacting every response', async () => {
  const {state, route} = setup();
  let body = await (await route.GET(request())).json();
  assert.equal(body.data.readiness.stage, 'ready_to_begin');
  assert.equal(body.data.readiness.executionComplete, false);
  assertRedacted(body);
  assert.ok(state.data.facts, 'Evaluation must not mutate the RPC snapshot');
  state.data.beginFacts.rpcAvailable = false;
  body = await (await route.GET(request())).json();
  assert.equal(body.data.readiness.readyToBegin, false);
  assert.ok(body.data.readiness.blockers.some(blocker => blocker.code === 'capability_disconnected'));
  state.data = snapshot();
  delete state.data.beginFacts;
  body = await (await route.GET(request())).json();
  assert.equal(body.data.readiness.readyToBegin, false);
  state.data = snapshot('running');
  body = await (await route.GET(request())).json();
  assert.equal(body.data.readiness.stage, 'executing');
  assert.equal(body.data.readiness.executionComplete, false);
  assert.ok(body.data.readiness.blockers.some(blocker => blocker.code === 'distinct_auth_users'));
  assertRedacted(body);
  state.data = {run: null, participants: [], contentIntakes: [], collaboration: null, checks: [], facts: emptyFacts()};
  body = await (await route.GET(request())).json();
  assert.equal(body.data.readiness.stage, 'setup_incomplete');
  assert.equal(body.data.readiness.blockers[0].code, 'run_missing');
  assertRedacted(body);
});

test('POST requires one bounded exact request envelope and a valid operations command', async () => {
  const {state, route} = setup();
  for (const body of [
    null, [], [createRun], createRun, {requestId, command: [createRun]},
    {requestId: 'bad', command: createRun}, {requestId, command: {...createRun, secret: 'PRIVATE'}},
    {requestId, command: {...createRun, id: 'bad'}}, {requestId, command: createRun, extra: true},
    {requestId, command: {type: 'unknown'}},
  ]) await expectFailure(await route.POST(request(body)), 400, 'INVALID');
  const envelope = {requestId, command: createRun};
  await expectFailure(await route.POST(request(envelope, '?extra=x')), 400, 'INVALID');
  await expectFailure(await route.POST(request(envelope, '', {'content-length': '262145'})), 400, 'INVALID');
  await expectFailure(await route.POST(new Request(origin + '/api/ops/pilot', {
    method: 'POST', headers: {origin}, body: ' '.repeat(262145) + JSON.stringify(envelope),
  })), 400, 'INVALID');
  await expectFailure(await route.POST(new Request(origin + '/api/ops/pilot', {
    method: 'POST', headers: {origin}, body: JSON.stringify(envelope) + JSON.stringify(envelope),
  })), 400, 'INVALID');
  assert.equal(state.calls.length, 0);
  assert.equal(state.events.length, 0);
  const response = await route.POST(request(envelope));
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(state.calls[0])), {
    name: 'admin_apply_kinnso_pilot_command', args: {p_request_id: requestId, p_command: createRun},
  });
});

test('the common pilot gate enforces capability, current session and same-origin writes without ad hoc role checks', async () => {
  const {state, route} = setup({mode: 'unavailable'});
  await expectFailure(await route.GET(request()), 503, 'UNAVAILABLE');
  await expectFailure(await route.POST(request({requestId, command: createRun})), 503, 'UNAVAILABLE', requestId);
  assert.equal(state.calls.length, 0);
  state.mode = 'connected';
  for (const status of [401, 403]) {
    state.denied = status;
    await expectFailure(await route.GET(request()), status, status === 401 ? 'AUTH_REQUIRED' : 'FORBIDDEN');
    await expectFailure(await route.POST(request({requestId, command: createRun})), status,
      status === 401 ? 'AUTH_REQUIRED' : 'FORBIDDEN', requestId);
  }
  state.denied = null;
  state.calls.length = 0;
  for (const headers of [{origin: 'https://foreign.example'}, {'sec-fetch-site': 'cross-site'}, {'x-kinnso-intent-actor': otherId}]) {
    const status = headers['x-kinnso-intent-actor'] ? 401 : 403;
    await expectFailure(await route.POST(request({requestId, command: createRun}, '', headers)), status,
      status === 401 ? 'AUTH_REQUIRED' : 'FORBIDDEN', requestId);
  }
  assert.equal(state.calls.length, 0);
  assert.equal(state.events.length, 0);
  assert.equal((await route.GET(request())).status, 200, 'Read-only GET does not require Origin');
  assert.equal((await route.POST(request({requestId, command: createRun}))).status, 200,
    'Database RPC authority remains authoritative even when actor roles do not include admin');
});

test('RPC failures preserve the failure vocabulary and original mutation request ID', async () => {
  const {state, route} = setup();
  for (const [error, status, code] of [
    [{message: 'CONFLICT'}, 409, 'CONFLICT'], [{message: 'revision_conflict'}, 409, 'CONFLICT'],
    [{message: 'REQUEST_ID_REUSED'}, 409, 'CONFLICT'], [{message: 'NOT_FOUND'}, 404, 'NOT_FOUND'],
    [{message: 'INVALID'}, 400, 'INVALID'], [{message: 'unauthenticated'}, 401, 'AUTH_REQUIRED'],
    [{message: 'FORBIDDEN'}, 403, 'FORBIDDEN'], [{code: '23514'}, 400, 'INVALID'],
    [{message: 'Internal private diagnostic'}, 503, 'UNAVAILABLE'],
  ]) {
    state.error = error;
    await expectFailure(await route.GET(request()), status, code);
    const body = await expectFailure(await route.POST(request({requestId, command: createRun})), status, code, requestId);
    assert.equal(JSON.stringify(body).includes('Internal private diagnostic'), false);
  }
  state.error = null;
  state.throws = true;
  await expectFailure(await route.GET(request()), 503, 'UNAVAILABLE');
  await expectFailure(await route.POST(request({requestId, command: createRun})), 503, 'UNAVAILABLE', requestId);
  assert.equal(state.events.length, 0);
});

test('mutations recompute readiness and strip internal facts while preserving the one-time invite result', async () => {
  const data = snapshot('running');
  const {state, route} = setup({
    mutation: {_pilotReplay: false, snapshot: data, inviteCode: 'ONE_TIME_PRIVATE_CODE', facts: {secret: true}, beginFacts: {secret: true}},
  });
  const command = {type: 'createInvite', id: otherId, participantId, expectedRevision: 1, expiresInHours: 24};
  const body = await (await route.POST(request({requestId, command}))).json();
  assert.equal(body.data.inviteCode, 'ONE_TIME_PRIVATE_CODE');
  assert.equal(body.data.snapshot.readiness.stage, 'executing');
  assert.equal(body.data.snapshot.readiness.executionComplete, false);
  assertRedacted(body);
  assert.equal(state.events.length, 1);
  assert.equal(JSON.stringify(state.events).includes('ONE_TIME_PRIVATE_CODE'), false);
  state.mutation = {snapshot: snapshot(), _pilotReplay: false};
  const configured = await (await route.POST(request({requestId, command: createRun}))).json();
  assert.equal(configured.data.snapshot.readiness.stage, 'ready_to_begin');
  assertRedacted(configured);
});

test('public snapshot projection removes nested internal fields from reads and every mutation', async () => {
  const data = snapshot('running');
  data.run.facts = {privateMarker: 'PRIVATE_AUTH_SOURCE'};
  data.participants = [{
    id: participantId, role: 'creator', cohortRole: 'required_creator', displayLabel: 'Synthetic',
    status: 'active', userLinked: true, consentAccepted: true, revision: 1,
    beginFacts: {privateMarker: 'PRIVATE_AUTH_SOURCE'},
  }];
  data.contentIntakes = [{
    id: intakeId, creatorParticipantId: participantId, guideId: otherId, status: 'approved',
    guideDraftRevision: 1, reviewedGuideVersion: 1, contentDigest: 'digest',
    title: 'Synthetic', destination: 'Tokyo', authoredLocale: 'en', revision: 1,
    facts: {privateMarker: 'PRIVATE_AUTH_SOURCE'},
  }];
  data.checks = [{
    code: 'physical_ios', category: 'manual', status: 'not_run', evidenceReference: null,
    observedSummary: null, revision: 1, derived: false, beginFacts: {privateMarker: 'PRIVATE_AUTH_SOURCE'},
  }];
  data.collaboration = {
    id: otherId, merchantParticipantId: otherId, creatorParticipantId: participantId, missionId: intakeId,
    facts: {privateMarker: 'PRIVATE_AUTH_SOURCE'},
    steps: [{code: 'mission_published', status: 'pass', facts: {privateMarker: 'PRIVATE_AUTH_SOURCE'}}],
  };
  const {route} = setup({data});
  assertRedacted(await (await route.GET(request())).json());
  for (const command of [
    createRun,
    {type: 'setParticipantStatus', id: participantId, expectedRevision: 1, status: 'paused', reason: 'Synthetic'},
  ]) assertRedacted(await (await route.POST(request({requestId, command}))).json());
});

test('GET and POST derive execution completion from exact source facts rather than backend readiness', async () => {
  const data = snapshot('running');
  const roles = ['traveller', 'creator', 'merchant'];
  const identities = [participantId, actorId, otherId];
  data.participants = roles.map((role, index) => ({
    id: identities[index], role, cohortRole: 'required_' + role, displayLabel: 'Synthetic',
    status: 'active', userLinked: true, consentAccepted: true, revision: 1,
  }));
  data.contentIntakes = [{
    id: intakeId, creatorParticipantId: actorId, guideId: requestId, status: 'published',
    guideDraftRevision: 2, reviewedGuideVersion: 7, contentDigest: 'digest',
    title: 'Synthetic', destination: 'Tokyo', authoredLocale: 'en', revision: 1,
  }];
  data.collaboration = {
    id: intakeId, merchantParticipantId: otherId, creatorParticipantId: actorId, missionId: intakeId,
    steps: ['merchant_approved', 'mission_published', 'application_active', 'notification_acknowledged']
      .map(code => ({code, status: 'pass'})),
  };
  data.checks = [
    ...['creator_public', 'guide_saved', 'trip_adopted', 'trip_revised', 'support_resolved', 'support_acknowledged']
      .map(code => ({code, derived: true})),
    ...['guide_discovered', 'trip_recovered', 'privacy_support', 'alert_owner', 'physical_ios', 'physical_android', 'voiceover', 'nvda']
      .map(code => ({code, derived: false})),
  ].map(check => ({
    ...check, category: 'synthetic', status: 'pass', evidenceReference: 'ref:1',
    observedSummary: 'Synthetic observation', revision: 1,
  }));
  const fact = {runId, dataClassification: 'synthetic', capturedAt: '2026-11-07T00:00:01Z'};
  data.facts = {
    participants: data.participants.map(participant => ({...fact, entityId: participant.id, userId: participant.id})),
    publications: [{
      ...fact, entityId: requestId, intakeId, creatorUserId: actorId, status: 'published',
      publishedVersion: 7, publishedContentDigest: 'digest', currentDraftRevision: 2, currentContentDigest: 'digest',
    }],
    checks: [...data.checks, ...data.collaboration.steps].map(check => ({
      ...fact, code: check.code, status: 'pass', entityId: runId, missionId: intakeId,
      ...check.code === 'notification_acknowledged' ? {notificationId: requestId, capturedAt: '2026-11-07T00:00:04Z'} : {},
    })),
    submissions: [{
      ...fact, entityId: intakeId, missionId: intakeId, creatorUserId: actorId, status: 'approved',
      capturedAt: '2026-11-07T00:00:02Z',
    }],
    notifications: [{
      ...fact, entityId: requestId, missionId: intakeId, submissionId: intakeId, creatorUserId: actorId,
      entityType: 'mission', notificationType: 'submission.approved', capturedAt: '2026-11-07T00:00:03Z',
    }],
  };
  data.readiness = {stage: 'setup_incomplete', readyToBegin: false, executionComplete: false, blockers: []};
  const {route} = setup({data});
  let body = await (await route.GET(request())).json();
  assert.equal(body.data.readiness.executionComplete, true);
  assert.equal(body.data.readiness.stage, 'execution_complete');
  assertRedacted(body);
  body = await (await route.POST(request({requestId, command: createRun}))).json();
  assert.equal(body.data.snapshot.readiness.executionComplete, true);
  assertRedacted(body);
  data.facts.publications[0].currentContentDigest = 'changed';
  body = await (await route.GET(request())).json();
  assert.equal(body.data.readiness.executionComplete, false);
  assert.ok(body.data.readiness.blockers.some(blocker => blocker.code === 'guide_not_exact'));
});

test('each confirmed operations command emits exactly one matching allowlisted event', async () => {
  const {state, route} = setup();
  for (const [command, action] of [
    [createRun, 'pilot.run.created'],
    [{type: 'configureRun', id: runId, expectedRevision: 1, participationNoticeVersion: 'v1',participationNoticeDigest:'a'.repeat(64),
      privacyNoticeVersion: 'v1',privacyNoticeDigest:'b'.repeat(64), contentConsentVersion: 'v1',contentConsentDigest:'c'.repeat(64), coordinatorReference: 'PRIVATE',
      supportOwnerReference: 'PRIVATE', privacyOwnerReference: 'PRIVATE', alertOwnerReference: 'PRIVATE',
      privateChannelReference: 'PRIVATE', syntheticRehearsalRunId: null}, 'pilot.run.configured'],
    [{type: 'setRunStatus', id: runId, expectedRevision: 1, status: 'recruiting', reason: 'PRIVATE'}, 'pilot.run.status_changed'],
    [{type: 'addParticipant', id: participantId, runId, role: 'traveller', cohortRole: 'required_traveller', displayLabel: 'PRIVATE'}, 'pilot.participant.status_changed'],
    [{type: 'setParticipantStatus', id: participantId, expectedRevision: 1, status: 'withdrawn', reason: 'PRIVATE'}, 'pilot.participant.status_changed'],
    [{type: 'createInvite', id: otherId, participantId, expectedRevision: 1, expiresInHours: 24}, 'pilot.invite.created'],
    [{type: 'revokeInvite', id: otherId, participantId, expectedRevision: 1, reason: 'PRIVATE'}, 'pilot.participant.status_changed'],
    [{type: 'reviewContentIntake', id: intakeId, expectedRevision: 1, decision: 'approve', expectedDraftRevision: 1, expectedContentDigest: 'a'.repeat(64), reason: 'PRIVATE'}, 'pilot.content.reviewed'],
    [{type: 'bindGuide', intakeId, guideId: otherId, expectedRevision: 1}, 'pilot.guide.bound'],
    [{type: 'bindCollaboration', id: otherId, runId, merchantParticipantId: otherId, creatorParticipantId: participantId, missionId: intakeId}, 'pilot.collaboration.bound'],
    [{type: 'addEvidenceReference', runId, checkCode: 'physical_ios', entityType: 'manual', entityId: runId, evidenceReference: 'PRIVATE'}, 'pilot.evidence.added'],
    [{type: 'setManualCheck', id: otherId, expectedRevision: 1, status: 'pass', evidenceReference: 'PRIVATE', observedSummary: 'PRIVATE'}, 'pilot.check.changed'],
  ]) {
    const before = state.events.length;
    const response = await route.POST(request({requestId, command}));
    assert.equal(response.status, 200, command.type);
    assert.equal(state.events.length, before + 1, command.type);
    const event = state.events.at(-1)[0];
    assert.equal(event.action, action);
    assert.equal(event.runId, runId);
    assert.equal(JSON.stringify(event).includes('PRIVATE'), false);
    assert.ok(Object.keys(event).every(key => ['action', 'runId', 'participantId', 'contentIntakeId', 'checkCode', 'status'].includes(key)));
  }
});

test('telemetry accepts only event-specific identifiers and fixed code/status values', async () => {
  const state = {events: []};
  const {emitPilotMetric} = load(telemetryCode, state);
  await emitPilotMetric('pilot.content.reviewed', {runId, contentIntakeId: intakeId, status: 'approved'});
  assert.equal(state.events.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(state.events[0][0])), {
    action: 'pilot.content.reviewed', runId, contentIntakeId: intakeId, status: 'approved',
  });
  for (const [action, ids] of [
    ['pilot.unknown', {runId}], ['pilot.run.created', {runId: 'private@example.test'}],
    ['pilot.run.created', {runId, participantId}], ['pilot.run.created', {runId, status: 'PRIVATE'}],
    ['pilot.check.changed', {runId, checkCode: 'PRIVATE', status: 'pass'}],
    ['pilot.check.changed', {runId, status: 'PRIVATE'}],
    ['pilot.content.reviewed', {runId, contentIntakeId: 'PRIVATE'}],
    ['pilot.run.created', {runId, userId: actorId}], ['pilot.run.created', {runId, reason: 'PRIVATE'}],
    ['pilot.invite.created', {runId, participantId, inviteCode: 'PRIVATE'}],
    ['pilot.evidence.added', {runId, checkCode: 'physical_ios', evidenceReference: 'PRIVATE'}],
    ['pilot.run.created', null],
  ]) await emitPilotMetric(action, ids);
  assert.equal(state.events.length, 1, 'Unallowlisted identifiers or free text must never reach the sink');
  state.telemetryThrows = true;
  await assert.doesNotReject(() => emitPilotMetric('pilot.run.created', {runId}));
});

test('telemetry failure and malformed backend results cannot turn success into a retried command', async () => {
  const {state, route} = setup({telemetryThrows: true});
  const body = await (await route.POST(request({requestId, command: createRun}))).json();
  assert.equal(body.ok, true);
  assertRedacted(body);
  assert.equal(state.calls.length, 1);
  state.mutation = null;
  state.data = null;
  await expectFailure(await route.GET(request()), 503, 'UNAVAILABLE');
  await expectFailure(await route.POST(request({requestId, command: createRun})), 503, 'UNAVAILABLE', requestId);
});

test('opsPilot repository retains exact command payload and request ID across unknown outcomes', async () => {
  const state = {events: [], attempts: [], failure: 'response'};
  state.fetch = async (url, options) => {
    state.attempts.push({url, options});
    if (state.failure === 'network') throw new Error('Disconnected');
    if (state.failure === 'malformed') return new Response('bad', {status: 503});
    if (state.failure === 'response') return Response.json({
      ok: false, code: 'UNAVAILABLE', retryable: true, requestId: otherId,
    }, {status: 503});
    return Response.json({ok: true, data: {snapshot: {run: null}}});
  };
  const {opsPilot} = load(repositoryCode, state);
  let firstRequestId;
  for (const failure of ['response', 'network', 'malformed', null]) {
    state.failure = failure;
    const result = await opsPilot.command(structuredClone(createRun));
    const attempt = state.attempts.at(-1);
    assert.equal(attempt.url, '/api/ops/pilot');
    assert.equal(attempt.options.method, 'POST');
    assert.equal(attempt.options.cache, 'no-store');
    const envelope = JSON.parse(attempt.options.body);
    firstRequestId ??= envelope.requestId;
    assert.equal(envelope.requestId, firstRequestId);
    assert.deepEqual(envelope.command, createRun);
    assert.deepEqual(Object.keys(envelope).sort(), ['command', 'requestId']);
    if (failure) {
      assert.equal(result.retryable, true);
      assert.equal(result.requestId, firstRequestId);
    } else assert.equal(result.ok, true);
  }
  await opsPilot.command(createRun);
  assert.notEqual(JSON.parse(state.attempts.at(-1).options.body).requestId, firstRequestId,
    'Confirmed completion releases the pending request identity');
  await opsPilot.get();
  assert.equal(state.attempts.at(-1).url, '/api/ops/pilot');
  await opsPilot.get(runId);
  assert.equal(state.attempts.at(-1).url, '/api/ops/pilot?runId=' + runId);
});

test('opsPilot returns authorization/conflict failures without cached successful data', async () => {
  const state = {events: [], attempts: [], status: 200};
  state.fetch = async (url, options) => {
    state.attempts.push({url, options});
    return state.status === 200 ? Response.json({ok: true, data: snapshot()})
      : Response.json({ok: false, code: state.status === 401 ? 'AUTH_REQUIRED' : state.status === 403 ? 'FORBIDDEN' : 'CONFLICT',
        retryable: false, requestId}, {status: state.status});
  };
  const {opsPilot} = load(repositoryCode, state);
  assert.equal((await opsPilot.get()).ok, true);
  for (const status of [401, 403, 409]) {
    state.status = status;
    for (const result of [await opsPilot.get(runId), await opsPilot.command(createRun)]) {
      assert.equal(result.ok, false);
      assert.equal(result.retryable, false);
      assert.equal('data' in result, false);
    }
  }
});

for (const [status, code] of [[401, 'AUTH_REQUIRED'], [403, 'FORBIDDEN']]) {
  test(`an unresolved evidence command retains its UUID through 503 -> ${status} -> success`, async () => {
    const command = {
      type: 'addEvidenceReference', runId, checkCode: 'physical_ios', entityType: 'manual',
      entityId: runId, evidenceReference: 'ref:1',
    };
    const state = {events: [], attempts: [], status: 503};
    state.fetch = async (url, options) => {
      if (options.method === 'GET') return Response.json({ok: true, data: snapshot()});
      state.attempts.push({url, options});
      return state.status === 200
        ? Response.json({ok: true, data: {snapshot: {run: null}}})
        : Response.json({
          ok: false, code: state.status === 503 ? 'UNAVAILABLE' : code,
          retryable: state.status === 503, requestId: otherId,
        }, {status: state.status});
    };
    const {opsPilot} = load(repositoryCode, state);
    assert.equal((await opsPilot.get()).ok, true);
    let originalRequestId;
    for (const nextStatus of [503, status, 200]) {
      state.status = nextStatus;
      const result = await opsPilot.command(structuredClone(command));
      const envelope = JSON.parse(state.attempts.at(-1).options.body);
      originalRequestId ??= envelope.requestId;
      assert.equal(envelope.requestId, originalRequestId, 'Authorization loss cannot resolve an earlier unknown write');
      assert.deepEqual(envelope.command, command);
      assert.equal(result.ok, nextStatus === 200);
      if (!result.ok) {
        assert.equal(result.code, nextStatus === 503 ? 'UNAVAILABLE' : code);
        assert.equal(result.retryable, nextStatus === 503);
        assert.equal(result.requestId, originalRequestId);
        assert.equal('data' in result, false, 'Permission denial must never return an earlier private snapshot');
      }
    }
    await opsPilot.command(structuredClone(command));
    assert.notEqual(JSON.parse(state.attempts.at(-1).options.body).requestId, originalRequestId,
      'A confirmed successful retry conclusively resolves the intent');
  });
}

test('terminal policy clears resolvable outcomes and retains unresolved authorization interruptions', async () => {
  for (const [status, code, precedesUnknown, retains] of [
    [400, 'INVALID', false, false], [400, 'INVALID', true, false],
    [401, 'AUTH_REQUIRED', false, true], [401, 'AUTH_REQUIRED', true, true],
    [403, 'FORBIDDEN', false, true], [403, 'FORBIDDEN', true, true],
    [404, 'NOT_FOUND', false, false], [404, 'NOT_FOUND', true, false],
    [409, 'CONFLICT', false, false], [409, 'CONFLICT', true, false],
  ]) {
    const state = {events: [], attempts: [], status: precedesUnknown ? 503 : status};
    state.fetch = async (url, options) => {
      state.attempts.push({url, options});
      return state.status === 200
        ? Response.json({ok: true, data: {snapshot: {run: null}}})
        : Response.json({
          ok: false, code: state.status === 503 ? 'UNAVAILABLE' : code,
          retryable: state.status === 503, requestId: otherId,
        }, {status: state.status});
    };
    const {opsPilot} = load(repositoryCode, state);
    await opsPilot.command(createRun);
    const originalRequestId = JSON.parse(state.attempts[0].options.body).requestId;
    if (precedesUnknown) {
      state.status = status;
      await opsPilot.command(createRun);
    }
    state.status = 200;
    await opsPilot.command(createRun);
    const finalRequestId = JSON.parse(state.attempts.at(-1).options.body).requestId;
    if (retains) assert.equal(finalRequestId, originalRequestId, `${code} after unknown=${precedesUnknown}`);
    else assert.notEqual(finalRequestId, originalRequestId, `${code} after unknown=${precedesUnknown}`);
  }
});

test('overlapping identical commands retain their request identity if either response is unknown', async () => {
  const state = {events: [], attempts: [], responses: []};
  state.fetch = async (url, options) => {
    state.attempts.push({url, options});
    if (state.attempts.length <= 2) return new Promise(resolve => state.responses.push(resolve));
    return Response.json({ok: true, data: {snapshot: {run: null}}});
  };
  const {opsPilot} = load(repositoryCode, state);
  const first = opsPilot.command(createRun);
  const second = opsPilot.command(structuredClone(createRun));
  const originalRequestId = JSON.parse(state.attempts[0].options.body).requestId;
  assert.equal(JSON.parse(state.attempts[1].options.body).requestId, originalRequestId);
  state.responses[0](Response.json({ok: true, data: {snapshot: {run: null}}}));
  await first;
  state.responses[1](Response.json({ok: false, code: 'UNAVAILABLE', retryable: true, requestId: otherId}, {status: 503}));
  assert.equal((await second).requestId, originalRequestId);
  await opsPilot.command(structuredClone(createRun));
  assert.equal(JSON.parse(state.attempts[2].options.body).requestId, originalRequestId);
});

const participantCode = await compile('../app/api/pilot/route.ts');
const publishCode = await compile('../app/api/creator/guides/[id]/publish/route.ts');
const self = {
  run: {id: runId, name: 'Pilot', status: 'running'},
  participant: {id: participantId, role: 'creator', status: 'active', consentVersion: 'v1'},
  nextStep: {code: 'open_workflow', href: '/en/studio/guides', messageKey: 'pilot.next.open_workflow'},
  readiness: {stage: 'executing', readyToBegin: true, executionComplete: false, blockers: []},
};
const claim = {type: 'claimInvite', requestId, code: 'synthetic-example-invite-value-for-tests'};

test('participant route accepts only self requests and projects RPC readiness unchanged', async () => {
  const {state} = setup({data: {...self, facts: {private: true}, participant: {...self.participant, email: 'private'}}});
  const route = load(participantCode, state);
  assert.equal(route.PUT, undefined);
  assert.equal(route.PATCH, undefined);
  for (const key of ['actorId', 'userId', 'runId']) {
    await expectFailure(await route.GET(request(undefined, '?' + key + '=' + runId)), 400, 'INVALID');
    await expectFailure(await route.POST(request({requestId, command: {...claim, [key]: runId}})), 400, 'INVALID');
    await expectFailure(await route.POST(request({requestId, command: claim, [key]: runId})), 400, 'INVALID');
  }
  await expectFailure(await route.POST(request({requestId: otherId, command: claim})), 400, 'INVALID');
  await expectFailure(await route.POST(request({requestId, command: claim}, '', {origin: 'https://foreign.test'})), 403, 'FORBIDDEN', requestId);
  assert.equal(state.calls.length, 0);
  assert.deepEqual(await (await route.GET(request())).json(), {ok: true, data: self});
  assert.equal(state.calls[0].name, 'get_kinnso_pilot_self');
});

test('participant claim denials are indistinguishable and success uses only the command snapshot', async () => {
  const {state} = setup({data: self, mutation: {snapshot: {...self, run: {...self.run, id: otherId}}, private: 'hidden', _pilotReplay: false}});
  const route = load(participantCode, state);
  const envelope = {requestId, command: claim};
  for (const details of ['wrong', 'expired', 'claimed', 'revoked']) {
    state.error = {message: 'CONFLICT', details};
    assert.deepEqual(await expectFailure(await route.POST(request(envelope)), 404, 'NOT_FOUND', requestId),
      {ok: false, code: 'NOT_FOUND', retryable: false, requestId});
  }
  assert.deepEqual(state.events, []);
  state.error = null;
  assert.deepEqual(await (await route.POST(request(envelope))).json(),
    {ok: true, data: {snapshot: {...self, run: {...self.run, id: otherId}}}});
  assert.deepEqual(JSON.parse(JSON.stringify(state.calls.at(-1))), {
    name: 'apply_kinnso_pilot_participant_command', args: {p_request_id: requestId, p_command: claim},
  });
  assert.deepEqual(JSON.parse(JSON.stringify(state.events)),
    [[{action: 'pilot.participant.joined', runId: otherId, participantId}]]);
});

test('participant repository retains the unresolved request ID for the same command', async () => {
  const attempts = [];
  const {pilot} = load(repositoryCode, {fetch: async (url, options) => {
    attempts.push({url, body: JSON.parse(options.body)});
    return attempts.length === 1
      ? Response.json({ok: false, retryable: true, code: 'UNAVAILABLE'}, {status: 503})
      : Response.json({ok: true, data: {snapshot: self}});
  }});
  await pilot.command(claim, participantId);
  assert.equal((await pilot.command({...claim, code: claim.code + "x"}, participantId)).code, "CONFLICT");
  await pilot.command({...claim, requestId: otherId}, participantId);
  pilot.invalidate();
  assert.equal((await pilot.retry(participantId)).code, "CONFLICT");
  assert.equal(attempts[0].url, '/api/pilot');
  assert.deepEqual(attempts[0], attempts[1]);
  assert.equal(attempts[0].body.requestId, attempts[0].body.command.requestId);
});

test('participant claims coalesce in flight and an account change discards the late snapshot', async () => {
  let resolve, signal, calls = 0;
  const {pilot} = load(repositoryCode, {fetch: (url, options) => {
    calls++;
    assert.equal(url, '/api/pilot');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['X-Kinnso-Intent-Actor'], participantId);
    signal = options.signal;
    return new Promise(r => { resolve = r; });
  }});
  const attempt = pilot.command(claim, participantId);
  assert.equal(attempt, pilot.command({...claim, requestId:otherId}, participantId));
  assert.equal(calls, 1);
  pilot.selectActor(otherId);
  assert.equal(signal.aborted, true);
  assert.equal((await pilot.retry(otherId)).code, 'CONFLICT');
  resolve(Response.json({ok:true, data:{snapshot:self}}));
  assert.equal((await attempt).code, 'AUTH_REQUIRED');
  assert.equal((await pilot.retry(participantId)).code, 'CONFLICT');
});

test('participant projection exposes only the owned editable fields and canonical references', async () => {
  const data = {...self, participant:{...self.participant, role:'creator', status:'active', consentDigest:'a'.repeat(64)},
    contentConsent:{version:'c1',digest:'b'.repeat(64),ownerReference:'private'},
    intake:{id:intakeId,status:'rejected',revision:3,title:'Title',destination:'Place',authoredLocale:'en',
      sourceSummary:'Summary',sourceUrls:[],rightsBasis:'original',rightsEvidenceReference:'rights:1',
      coverRightsConfirmed:null,coverRightsEvidenceReference:null,reviewReason:'Revise',guideId:otherId,
      currentDraftRevision:1,editorHref:'/en/studio/guides/'+otherId+'/edit',rawCode:'private'},
    workflowLinks:{merchant:'/en/merchant/campaigns/'+otherId,trip:'/en/trips/'+otherId,supportCaseId:otherId,owner:'private'}};
  const {state} = setup({data});
  const route = load(participantCode, state);
  const output = (await (await route.GET(new Request('https://kinnso.test/api/pilot'))).json()).data;
  assert.equal(output.intake.editorHref, data.intake.editorHref);
  assert.equal(output.intake.reviewReason, 'Revise');
  assert.equal(output.workflowLinks.supportCaseId, otherId);
  assert.equal(output.workflowLinks.merchant, null);
  assert.equal(output.workflowLinks.trip, null);
  assert.equal(JSON.stringify(output).includes('private'), false);
  const missing = {type:'acceptConsent',requestId,noticeVersion:'v1',privacyNoticeVersion:'p1'};
  await expectFailure(await route.POST(request({requestId,command:missing})),409,'CONFLICT',requestId);
});

test('publish trusts the atomic RPC for review and emits only confirmed pilot publication IDs', async () => {
  const {state} = setup();
  const route = load(publishCode, state);
  const post = expectedRevision => route.POST(request({requestId, expectedRevision}), {params: Promise.resolve({id: otherId})});
  state.error = {message: 'PILOT_REVIEW_REQUIRED'};
  await expectFailure(await post(1), 409, 'PILOT_REVIEW_REQUIRED');
  await expectFailure(await post(2), 409, 'PILOT_REVIEW_REQUIRED');
  state.error = {message: 'CONFLICT'};
  await expectFailure(await post(2), 409, 'CONFLICT');
  assert.deepEqual(state.events, []);
  state.error = null;
  const ordinary = {draft: {revision: 1}, snapshot: {version: 1}};
  state.mutation = ordinary;
  assert.deepEqual(await (await post(1)).json(), {ok: true, data: ordinary});
  assert.deepEqual(state.events, []);
  const publication = {...ordinary, runId, contentIntakeId: intakeId};
  for (const replay of [false, true]) {
    state.mutation = {...publication, _pilotReplay: replay};
    assert.deepEqual(await (await post(1)).json(), {ok: true, data: publication});
  }
  assert.deepEqual(state.calls.at(-1), state.calls.at(-2));
  assert.deepEqual(JSON.parse(JSON.stringify(state.events)),
    [[{action: 'pilot.content.published', runId, contentIntakeId: intakeId}]]);
  state.throws = true;
  await expectFailure(await post(1), 503, 'UNAVAILABLE');
  assert.equal(state.events.length, 1);
  assert.ok(state.calls.every(call => call.name === 'publish_kinnso_pilot_guide_draft'));
});

test('all participant command metrics use exact allowed fields and skip receipt replay', async () => {
  const intake = {
    title: 'Private title', destination: 'Private destination', authoredLocale: 'en',
    sourceSummary: 'Private free text', sourceUrls: [], rightsBasis: 'original',
    rightsEvidenceReference: 'Private reference', authorConsentVersion: 'v1',authorConsentDigest:'c'.repeat(64),
    coverRightsConfirmed: null, coverRightsEvidenceReference: null,
  };
  for (const [command, action, fields] of [
    [claim, 'pilot.participant.joined', {}],
    [{type: 'acceptConsent', noticeVersion: 'v1',noticeDigest:'a'.repeat(64),privacyNoticeVersion:'privacy-v1',privacyNoticeDigest:'b'.repeat(64)}, 'pilot.consent.accepted', {}],
    [{type: 'submitContentIntake', intake}, 'pilot.content.submitted', {}],
    [{type: 'updateOwnedContentIntake', intake, id: intakeId, expectedRevision: 1}, 'pilot.content.submitted', {contentIntakeId: intakeId}],
    [{type: 'acknowledgeNotification'}, 'pilot.notification.acknowledged', {}],
    [{type: 'acknowledgeSupportResponse'}, 'pilot.support.acknowledged', {}],
  ]) {
    const {state} = setup();
    const route = load(participantCode, state);
    const envelope = {requestId, command: {...command, requestId}};
    for (const replay of [false, true]) {
      const current = replay ? {...self, nextStep: null} : self;
      state.mutation = {snapshot: current, _pilotReplay: replay};
      assert.deepEqual(await (await route.POST(request(envelope))).json(), {ok: true, data: {snapshot: current}});
    }
    assert.deepEqual(JSON.parse(JSON.stringify(state.calls[0])), JSON.parse(JSON.stringify(state.calls[1])));
    assert.deepEqual(JSON.parse(JSON.stringify(state.events)), [[{action, runId, participantId, ...fields}]]);
  }
});

test('ops replay returns the receipt without the marker or another event', async () => {
  const {state, route} = setup();
  const envelope = {requestId, command: createRun};
  const first = await (await route.POST(request(envelope))).json();
  state.mutation = {snapshot: state.data, _pilotReplay: true};
  assert.deepEqual(await (await route.POST(request(envelope))).json(), first);
  assert.equal(state.events.length, 1);
});

test('ops exposes current review identity and only nonsecret invitation metadata', async () => {
  const data = snapshot('running');
  const digest = 'a'.repeat(64);
  const invite = {id:otherId,status:'active',expiresAt:'2026-11-08T00:00:00+00:00',codeHash:'PRIVATE_AUTH_SOURCE'};
  data.participants = [{id:participantId,activeInvite:invite}];
  data.contentIntakes = [{id:intakeId,guideId:otherId,revision:4,guideDraftRevision:2,contentDigest:'b'.repeat(64)}];
  data.facts.publications = [{runId,intakeId,entityId:otherId,currentDraftRevision:7,currentContentDigest:digest}];
  const {route,state} = setup({data});
  const reply = await (await route.GET(request())).json();
  assertRedacted(reply);
  assert.deepEqual(reply.data.participants[0].activeInvite, {id:otherId,status:'active',expiresAt:invite.expiresAt});
  assert.equal(reply.data.contentIntakes[0].guideDraftRevision, 2);
  assert.equal(reply.data.contentIntakes[0].currentDraftRevision, 7);
  assert.equal(reply.data.contentIntakes[0].currentContentDigest, digest);

  const command={type:'reviewContentIntake',id:intakeId,expectedRevision:4,decision:'approve',reason:'Reviewed fixture'};
  await expectFailure(await route.POST(request({requestId,command})),400,'INVALID');
  const exact={...command,expectedDraftRevision:7,expectedContentDigest:digest};
  const response=await route.POST(request({requestId,command:exact}));
  assert.equal(response.status,200);
  assert.deepEqual({...state.calls.find(call => call.name==='admin_apply_kinnso_pilot_command')?.args?.p_command}, exact);
  data.facts.publications[0].currentContentDigest='PRIVATE_AUTH_SOURCE';
  const redacted=await (await route.GET(request())).json();
  assert.equal(redacted.data.contentIntakes[0].currentDraftRevision,null);
  assert.equal(redacted.data.contentIntakes[0].currentContentDigest,null);
});

test('recoverable invite retains created entity and request IDs and clears on account change', async () => {
  const wire=[];
  const {opsPilot}=load(repositoryCode,{fetch:async (_url,init)=>{
    wire.push(JSON.parse(init.body));
    if(wire.length===1 || wire.length===3) throw Error('lost response');
    return Response.json({ok:true,data:{snapshot:snapshot()}});
  }});
  const create={type:'createInvite',id:otherId,participantId,expectedRevision:1,expiresInHours:24};
  await opsPilot.recoverableCommand(actorId,create);
  assert.equal(opsPilot.pending(actorId).id,otherId);
  assert.equal(opsPilot.pending(participantId),null);
  const other={...create,id:runId};
  assert.equal((await opsPilot.recoverableCommand(actorId,other)).code,'CONFLICT');
  await opsPilot.recoverableCommand(actorId);
  assert.deepEqual(wire[1],wire[0]);
  assert.equal(opsPilot.pending(actorId),null);
  await opsPilot.recoverableCommand(actorId,create);
  opsPilot.selectActor(participantId);
  assert.equal(opsPilot.pending(actorId),null);
  assert.equal((await opsPilot.recoverableCommand(participantId)).code,'CONFLICT');
  assert.equal(wire.length,3);
});
