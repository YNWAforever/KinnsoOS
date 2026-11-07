import { expect, test, type Page } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { runPilotCleanup } from '../../scripts/pilot-cleanup.mjs';
import { loadEnvFile } from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { verifiedConnectedArtifact } from '../../scripts/connected-build-identity.mjs';
import { verifyTestTarget } from '../../scripts/verify-test-target.mjs';

const origin = 'http://127.0.0.1:3495';
const suiteLabel = 'task10a-' + randomUUID();
const runIds: string[] = [];
const users: string[] = [];
const guides: string[] = [];
const missions: string[] = [];
let target: ReturnType<typeof verifyTestTarget>;
const serviceClient = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } });
let admin: ReturnType<typeof serviceClient>;
const roles = ['traveller', 'creator', 'merchant'] as const;

test.beforeAll(() => {
  loadEnvFile('.env.test');
  target = verifyTestTarget();
  expect(target.projectRef).toBe('kinnsoos-public-it-20261106');
  expect(target.apiOrigin).toBe('http://127.0.0.1:59721');
  expect(target.dbContainer).toBe('supabase_db_kinnsoos-public-it-20261106');
  admin = serviceClient();
});

async function signIn(page: Page, role: string, label: string) {
  const email = label + '-' + role + '@example.test';
  const passphrase = 'Local-author!' + randomUUID();
  const result = await admin.auth.admin.createUser({ email, password: passphrase, email_confirm: true });
  if (result.error || !result.data.user) throw Error('Synthetic Auth bootstrap failed: ' + role);
  const id = result.data.user.id;
  users.push(id);
  await page.goto('/en/sign-in?next=%2Fen%2Ftrips');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(passphrase);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(origin + '/en/trips');
  return id;
}

async function api(page: Page, path: string, method = 'GET', data?: object) {
  const response = await page.request.fetch(origin + path, { method, data, headers: { Origin: origin }, maxRedirects: 0 });
  const body = await response.json();
  if (!response.ok() || body.ok !== true) {
    throw Error(method + ' ' + path.split('?')[0] + ' ' + (data && 'command' in data ?
      (data.command as { type: string }).type : '') + ': ' + response.status() + ' ' + (body.code ?? 'unknown'));
  }
  return body.data;
}

const ops = (page: Page, command: object) => api(page, '/api/ops/pilot', 'POST', { requestId: randomUUID(), command });
function participant(page: Page, command: object) {
  const requestId = randomUUID();
  return api(page, '/api/pilot', 'POST', { requestId, command: { ...command, requestId } });
}

test.afterAll(async ({}, testInfo) => {
  testInfo.setTimeout(120_000);
  if (!users.length) return;
  verifyTestTarget();
  const ids = (values: string[]) => "array[" + values.map(value => {
    if (!/^[0-9a-f-]{36}$/.test(value)) throw Error('Unsafe cleanup identifier');
    return "'" + value + "'";
  }).join(',') + "]::uuid[]";
  const sql = (statement: string) => execFileSync('docker', ['exec', '-i', target.dbContainer, 'psql',
    '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'],
    { input: statement, encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  const byRun = "run_id = any(" + ids(runIds) + ")";
  const byUser = (column: string) => column + ' = any(' + ids(users) + ')';
  const byGuide = (column: string) => column + ' = any(' + ids(guides) + ')';
  const captureErrors: string[] = [];
  const journal = '.local-private/pilot-cleanup/' + suiteLabel + '.json';
  const save = (value: object) => {
    try {
      mkdirSync('.local-private/pilot-cleanup', { recursive: true });
      writeFileSync(journal, JSON.stringify(value));
    } catch { captureErrors.push('cleanup journal'); }
  };
  save({ users, runIds, guides, missions });
  const inScope = (column: string, table: string, where: string) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const found = sql('select id from ' + table + ' where ' + where);
        return column + ' = any(' + ids(found ? found.split(/\r?\n/) : []) + ')';
      } catch { /* Retry the exact lookup before any deletion. */ }
    }
    captureErrors.push(table);
    return 'false';
  };
  const slot = inScope('participant_id', 'kinnso_internal.pilot_participants', byRun);
    const mission = 'id = any(' + ids(missions) + ')';
  const missionChild = 'mission_id = any(' + ids(missions) + ')';
  const submission = inScope('mission_participant_id', 'public.mission_participants', missionChild);
  const supportCase = inScope('case_id', 'kinnso_internal.support_cases', byUser('recipient_id'));
  const tripChild = inScope('trip_id', 'public.trips', byUser('owner_user_id'));
  const merchantChild = inScope('merchant_id', 'public.merchant_profiles', byUser('user_id'));
  const filters = [
    ['kinnso_internal.pilot_invites', slot],
    ...['pilot_evidence', 'pilot_participant_audit', 'pilot_checks', 'pilot_collaborations',
      'pilot_content_intakes', 'pilot_participants'].map(table => ['kinnso_internal.' + table, byRun]),
    ['kinnso_internal.pilot_runs', "id = any(" + ids(runIds) + ")"],
    ['public.ops_audit_log', inScope('actor_ops_member_id', 'public.kinnso_ops_members', byUser('user_id'))],
    ['kinnso_internal.requests', byUser('actor_id')],
    ['kinnso_internal.creator_requests', byUser('actor_id')],
    ['kinnso_internal.workspace_requests', byUser('actor_id')],
    ['kinnso_internal.trip_requests', byUser('actor_id')],
    ['kinnso_internal.pilot_events', byGuide('guide_id')],
    ['public.guide_saves', byUser('traveler_user_id')],
    ['kinnso_internal.guide_drafts', byGuide('guide_id')],
    ['public.guide_versions', byGuide('guide_id')],
    ['public.trips', byUser('owner_user_id')],
    ['public.guides', byGuide('id') + ' and ' + byUser('creator_id')],
    ['kinnso_internal.inbox_events', byUser('recipient_id')],
    ['kinnso_internal.support_messages', supportCase],
    ['kinnso_internal.support_audit', supportCase],
    ['kinnso_internal.support_cases', byUser('recipient_id')],
    ['kinnso_internal.notification_outbox', byUser('recipient_id')],
    ['public.notifications', byUser('creator_id')],
    ['public.mission_verification_jobs', byUser('creator_id')],
    ['public.mission_milestone_submissions', submission],
    ['public.mission_participants', missionChild],
    ['public.missions', mission],
    ['kinnso_internal.merchant_audit', merchantChild],
    ['kinnso_internal.merchant_members', merchantChild],
    ['kinnso_internal.merchant_branches', merchantChild],
    ['public.merchant_applications', byUser('user_id')],
    ['public.merchant_profiles', byUser('user_id')],
    ['public.kinnso_ops_members', byUser('user_id')],
  ];
  const checks = [...filters,
    ...['trip_revisions', 'trip_stops', 'trip_days'].map(table => ['public.' + table, tripChild]),
    ['public.mission_milestones', missionChild],
    ...[['auth.users', 'id'], ['auth.sessions', 'user_id'], ['auth.identities', 'user_id'],
      ['public.creators', 'id']].map(([table, key]) => [table, byUser(key)]),
  ];
  save({ users, runIds, guides, missions, filters, checks, captureErrors });
  await runPilotCleanup([
    ...filters.map(([table, where]) => ({ label: table, run: () => { sql('delete from ' + table + ' where ' + where); } })),
    ...users.map((id, index) => ({ label: 'Auth user ' + index, async run() {
      const result = await admin.auth.admin.deleteUser(id);
      if (result.error && result.error.status !== 404) throw Error('Synthetic Auth cleanup failed');
    } })),
  ], [
    ...checks.map(([table, where]) => ({ label: table, run() {
      if (sql('select count(*) from ' + table + ' where ' + where) !== '0') throw Error('Nonzero residue');
    } })),
    ...captureErrors.map(table => ({ label: 'uncaptured ' + table, run() { throw Error('Incomplete identifiers'); } })),
  ]);
    console.log('Task10A cleanup verified:', filters.length + 8, 'exact predicates');
});

test('pilot rehearsal completes; real-classified replay retains the four manual gates', async ({ browser, request }) => {
  test.setTimeout(240_000);
  const expectedBuild = verifiedConnectedArtifact(process.cwd());
  const health = await request.get(origin + '/api/health', { maxRedirects: 0 });
  const served = health.headers()['x-kinnso-local-build'];
  expect(served && JSON.parse(served)).toEqual(expectedBuild);
  console.log('Task10A expected and served build:', expectedBuild);
  let rehearsal: string | null = null;
  for (const classification of ['synthetic', 'real'] as const) {
    const runId = randomUUID();
    runIds.unshift(runId);
    const label = suiteLabel + '-' + classification;
    const firstGuide = guides.length;
    const contexts = await Promise.all([0, 1, 2, 3].map(() => browser.newContext()));
    try {
      const [operator, ...members] = await Promise.all(contexts.map(context => context.newPage()));
      const operatorId = await signIn(operator, 'operator', label);
      const membership = await admin.from('kinnso_ops_members').insert({
        user_id: operatorId, display_name: label, role: 'admin', status: 'active',
      });
      if (membership.error) throw Error('Synthetic operations bootstrap failed');
      const candidateReleaseSha = expectedBuild.head;
      const created = await ops(operator, { type: 'createRun', id: runId, name: label,
        dataClassification: classification, candidateReleaseSha,
        environmentOrigin: classification === 'real' ? 'https://pilot.example.test' : origin });
      const digest = (purpose: string) => createHash('sha256').update(label + ':' + purpose).digest('hex');
      const notices = {
        participationNoticeVersion: label + '-participation', participationNoticeDigest: digest('participation'),
        privacyNoticeVersion: label + '-privacy', privacyNoticeDigest: digest('privacy'),
        contentConsentVersion: label + '-rights', contentConsentDigest: digest('rights'),
      };
      let { snapshot } = await ops(operator, { type: 'configureRun', id: runId,
        expectedRevision: created.snapshot.run.revision, ...notices, syntheticRehearsalRunId: rehearsal,
        coordinatorReference: label + ':coordinator', supportOwnerReference: label + ':support',
        privacyOwnerReference: label + ':privacy', alertOwnerReference: label + ':alerts',
        privateChannelReference: label + ':channel' });
      const slots = roles.map(() => randomUUID());
      const inviteCodes: string[] = [];
      for (const [index, role] of roles.entries()) {
        ({ snapshot } = await ops(operator, { type: 'addParticipant', id: slots[index], runId, role,
          cohortRole: 'required_' + role, displayLabel: 'Synthetic ' + role }));
      }
      expect(snapshot.readiness.readyToBegin).toBe(true);
      for (const status of ['recruiting', 'running']) {
        ({ snapshot } = await ops(operator, { type: 'setRunStatus', id: runId,
          expectedRevision: snapshot.run.revision, status, reason: 'Local synthetic rehearsal' }));
      }
      for (const [index, role] of roles.entries()) {
        const page = members[index];
        await signIn(page, role, label);
        const id = slots[index];
        const slot = snapshot.participants.find((item: { id: string }) => item.id === id);
              const invite = await ops(operator, { type: 'createInvite', id: randomUUID(),
          participantId: id, expectedRevision: slot.revision, expiresInHours: 1 });
        inviteCodes.push(invite.inviteCode);
        const claim = await participant(page, { type: 'claimInvite', code: invite.inviteCode });
        expect(claim.snapshot.participant.id).toBe(id);
        const consent = await participant(page, { type: 'acceptConsent',
          noticeVersion: notices.participationNoticeVersion, noticeDigest: notices.participationNoticeDigest,
          privacyNoticeVersion: notices.privacyNoticeVersion, privacyNoticeDigest: notices.privacyNoticeDigest });
        expect(consent.snapshot.participant).toMatchObject({ id, role, consentVersion: notices.participationNoticeVersion });
        snapshot = await api(operator, '/api/ops/pilot?runId=' + runId);
        const joined = snapshot.participants.find((item: { id: string }) => item.id === id);
        ({ snapshot } = await ops(operator, { type: 'setParticipantStatus', id,
          expectedRevision: joined.revision, status: 'active', reason: 'Synthetic consent verified' }));
      }
      const creator = members[1];
      await creator.goto(origin + '/en/studio');
      const confirm = creator.getByRole('button', { name: 'Confirm creator profile', exact: true });
      await expect(confirm).toBeVisible();
      await creator.getByLabel('Bio', { exact: true }).fill('Synthetic local rehearsal author');
      await creator.getByLabel('I have reviewed this profile and confirm publication.', { exact: true }).check();
      await confirm.click();
      await expect(creator.getByRole('link', { name: 'Create guide', exact: true })).toBeVisible();
      for (let index = 1; index <= 3; index++) {
        const guideId = randomUUID();
        guides.push(guideId);
        const title = label + '-guide-' + index;
        const intake = (await participant(creator, { type: 'submitContentIntake', intake: {
          title, destination: 'Kyoto', authoredLocale: 'en', sourceSummary: 'Synthetic original work',
          sourceUrls: [], rightsBasis: 'original', rightsEvidenceReference: 'ref:' + guideId,
          authorConsentVersion: notices.contentConsentVersion, authorConsentDigest: notices.contentConsentDigest,
          coverRightsConfirmed: null, coverRightsEvidenceReference: null,
        } })).snapshot.intake;
        const path = '/api/creator/guides/' + guideId;
        const draft = await api(creator, path, 'PUT', { expectedRevision: 0, requestId: randomUUID(), payload: {
          title, city: 'Kyoto', summary: 'Synthetic rehearsal route',
          content: { days: [{ offset: 0, title: 'Synthetic day', stops: [{
            title: 'Synthetic stop', description: 'Synthetic authored stop', placeId: null,
            startMinuteOfDay: 600, durationMinutes: 30,
          }] }] },
        } });
        const bound = (await ops(operator, { type: 'bindGuide', intakeId: intake.id, guideId,
          expectedRevision: intake.revision })).snapshot.contentIntakes.find((item: { id: string }) => item.id === intake.id);
        expect(bound.currentDraftRevision).toBe(draft.revision);
        await ops(operator, { type: 'reviewContentIntake', id: intake.id, expectedRevision: bound.revision,
          decision: 'approve', expectedDraftRevision: bound.currentDraftRevision,
          expectedContentDigest: bound.currentContentDigest, reason: 'Reviewed synthetic original work' });
        await api(creator, path + '/publish', 'POST', { expectedRevision: draft.revision, requestId: randomUUID() });
        expect(await api(members[0], '/api/guides/' + guideId)).toMatchObject({ title, version: 1 });
      }
      const [traveller, , merchant] = members;
      const merchantApplication = await api(merchant, '/api/merchant/application', 'POST', {
        requestId: randomUUID(), input: { companyName: label, contactName: 'Synthetic merchant',
          contactEmail: label + '-merchant@example.test', websiteUrl: '', pitch: 'Synthetic rehearsal' },
      });
      await api(operator, '/api/ops/merchant-applications', 'POST', {
        id: merchantApplication.id, action: 'approve', reason: 'Synthetic merchant for rehearsal',
      });
      const memberships = await api(merchant, '/api/merchant');
      expect(memberships).toHaveLength(1);
      const merchantId = memberships[0].merchantId;
      const missionId = randomUUID();
      missions.push(missionId);
      const milestoneId = randomUUID();
      const campaign = (command: object) => api(merchant, '/api/merchant/campaigns', 'POST', {
        merchantId, command, requestId: randomUUID(),
      });
      const campaignDetail = async () => (await api(merchant, '/api/merchant/campaigns?id=' +
        merchantId + '&campaignId=' + missionId)).detail;
      await campaign({ type: 'createDraft', id: missionId, publish: true, reason: 'Synthetic rehearsal',
        input: { title: label + '-campaign', summary: 'Synthetic collaboration', couponCode: 'SYNTHETIC',
          couponUrl: 'https://example.test/synthetic', affiliateRate: 0, kinnsoRate: 0, creatorRate: 0,
          requirements: [], deliverables: ['Synthetic itinerary'], applicationOpensAt: null,
          applicationClosesAt: null, scheduleTimeZone: 'UTC',
          milestones: [{ id: milestoneId, title: 'Synthetic itinerary', description: 'Synthetic proof', dueAt: null }] },
      });
      expect((await campaignDetail()).status).toBe('published');
      await ops(operator, { type: 'bindCollaboration', id: randomUUID(), runId, missionId,
        merchantParticipantId: slots[2], creatorParticipantId: slots[1] });
      const mission = (command: object) => api(creator, '/api/creator/missions/' + missionId, 'POST', {
        command, requestId: randomUUID(),
      });
      await mission({ type: 'join', applicationNote: 'Synthetic application' });
      const application = (await campaignDetail()).participants[0];
      expect(application.status).toBe('applied');
      await campaign({ type: 'reviewApplication', id: application.id, expectedUpdatedAt: application.updatedAt,
        action: 'approve', note: 'Synthetic application approved', reason: 'Synthetic review' });
      const submit = (submissionId: string | null, expectedUpdatedAt: string | null, version: number) =>
        mission({ type: 'submitEvidence', milestoneId, submissionId, expectedUpdatedAt,
          proofUrls: ['https://example.test/synthetic-proof/' + version], notes: 'Synthetic submission' });
      await submit(null, null, 1);
      const review = (submission: { id: string; updatedAt: string }, action: string) => campaign({
        type: 'reviewSubmission', id: submission.id, expectedUpdatedAt: submission.updatedAt,
        action, feedback: 'Synthetic feedback', reason: 'Synthetic review',
      });
      await review((await campaignDetail()).submissions[0], 'request_revision');
      const revision = (await campaignDetail()).submissions[0];
      await submit(revision.id, revision.updatedAt, 2);
      const resubmitted = (await campaignDetail()).submissions[0];
      await review(resubmitted, 'approve');
      const inbox = await api(creator, '/api/inbox');
      expect(inbox.items).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'submission.approved', entityId: missionId }),
      ]));
      await participant(creator, { type: 'acknowledgeNotification' });
      const guideId = guides[firstGuide];
      const guide = await api(traveller, '/api/guides/' + guideId);
      await api(traveller, '/api/bookmarks', 'POST', { requestId: randomUUID(), guideId, desiredState: true });
      expect(await api(traveller, '/api/bookmarks?guideId=' + guideId)).toEqual([
        expect.objectContaining({ guide_id: guideId }),
      ]);
      const trip = await api(traveller, '/api/trips', 'POST', { requestId: randomUUID(), input: {
        title: label + '-private-trip', timezone: 'Asia/Tokyo', startDate: '2030-01-10', destinationId: null,
      } });
      await api(traveller, '/api/trips/' + trip.id + '/adopt', 'POST', { requestId: randomUUID(),
        guideId, version: guide.version, expectedRevision: trip.revision });
      await traveller.goto('/en/trips/' + trip.id);
      await expect(traveller.getByRole('heading', { name: label + '-private-trip', exact: true })).toBeVisible();
          const adopted = await api(traveller, '/api/trips/' + trip.id);
      const edited = await api(traveller, '/api/trips/' + trip.id + '/commands', 'POST', {
        requestId: randomUUID(), expectedRevision: adopted.revision,
        command: { type: 'updateStop', id: adopted.days[0].stops[0].id, patch: { travellerNote: label + '-private-note' } },
      });
      await traveller.reload();
      expect((await api(traveller, '/api/trips/' + trip.id)).revision).toBe(edited.revision);
      expect(await api(traveller, '/api/support/context?mission=' + missionId)).toEqual({
        type: 'mission', id: missionId, title: 'Pilot support', workspace: 'pilot',
      });
      await traveller.goto('/en/support?mission=' + missionId);
      await expect(traveller.getByLabel('Case subject', { exact: true })).toHaveValue('Collaboration: Pilot support');
            const support = (page: Page, command: object) => api(page, '/api/support', 'POST', { requestId: randomUUID(), command });
      const supportId = randomUUID();
      const opened = await support(traveller, { type: 'create', id: supportId, subject: label + '-private-subject',
        message: label + '-private-message', context: { type: 'mission', id: missionId } });
      const responseText = label + '-private-response';
      await support(operator, { type: 'review', id: supportId, expectedRevision: opened.revision,
        ownerId: operatorId, status: 'resolved', reason: 'Synthetic support review', message: responseText });
      expect((await api(traveller, '/api/support/' + supportId + '/messages')).items).toEqual(
        expect.arrayContaining([expect.objectContaining({ message: responseText })]));
      const evidence = (checkCode: string, entityType: string, entityId: string, participantId: string | null) =>
        ops(operator, { type: 'addEvidenceReference', runId, checkCode, entityType, entityId,
          participantId, evidenceReference: 'ref:' + entityId });
      await evidence('support_resolved', 'support_case', supportId, null);
      await participant(traveller, { type: 'acknowledgeSupportResponse' });
      const deviceChecks = ['physical_ios', 'physical_android', 'voiceover', 'nvda'];
      const checks: Array<[string, string, string, string | null]> = [
        ['guide_discovered', 'guide', guideId, slots[0]], ['trip_recovered', 'trip', trip.id, slots[0]],
        ...['privacy_support', 'alert_owner', ...(classification === 'synthetic' ? deviceChecks : [])]
          .map((code): [string, string, string, null] => [code, 'manual', runId, null]),
      ];
      for (const [code, entityType, entityId, participantId] of checks) {
        const { snapshot } = await evidence(code, entityType, entityId, participantId);
        const check = snapshot.checks.find((row: { code: string }) => row.code === code);
        await ops(operator, { type: 'setManualCheck', id: check.id, expectedRevision: check.revision,
          status: 'pass', evidenceReference: 'ref:' + entityId,
          observedSummary: 'Synthetic operator attestation; no physical device or launch clearance.' });
      }
      snapshot = await api(operator, '/api/ops/pilot?runId=' + runId);
      if (classification === 'synthetic') {
        expect(snapshot.readiness.blockers.map((row: { code: string }) => row.code)).toEqual([]);
        ({ snapshot } = await ops(operator, { type: 'setRunStatus', id: runId, expectedRevision: snapshot.run.revision,
          status: 'completed', reason: 'Synthetic rehearsal only' }));
        rehearsal = runId;
      } else {
        expect(snapshot.run.status).toBe('running');
        expect(snapshot.readiness.executionComplete).toBe(false);
        expect(snapshot.readiness.blockers.map((row: { code: string }) => row.code).sort()).toEqual(deviceChecks.sort());
        for (const code of deviceChecks) {
          expect(snapshot.checks.find((row: { code: string }) => row.code === code)).toMatchObject({
            status: 'not_run', evidenceReference: null,
          });
        }
      }
      await operator.goto('/en/ops?view=pilot&id=' + runId);
      const download = operator.waitForEvent('download');
      await operator.getByRole('button', { name: 'Export acceptance summary', exact: true }).click();
      const stream = await (await download).createReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      const raw = Buffer.concat(chunks).toString('utf8');
      const exported = JSON.parse(raw);
      expect(Object.keys(exported).sort()).toEqual(['checks', 'exportedAt', 'readiness', 'run', 'schemaVersion']);
      expect(exported.run).toEqual({ id: runId, status: snapshot.run.status, dataClassification: classification });
      expect(exported.schemaVersion).toBe(1);
      expect(new Date(exported.exportedAt).toISOString()).toBe(exported.exportedAt);
      expect(Object.keys(exported.readiness).sort()).toEqual(['blockers', 'executionComplete', 'readyToBegin', 'stage']);
      expect(exported.readiness).toMatchObject({
        stage: classification === 'synthetic' ? 'completed' : 'executing',
        executionComplete: classification === 'synthetic', readyToBegin: false,
      });
      expect(exported.readiness.blockers.map((row: { code: string }) => row.code).sort())
        .toEqual(classification === 'synthetic' ? [] : [...deviceChecks].sort());
      for (const blocker of exported.readiness.blockers) {
        expect(blocker).toEqual({ code: blocker.code, category: 'manual', messageKey: 'pilot.readiness.' + blocker.code });
      }
      for (const check of exported.checks) {
        expect(Object.keys(check).sort()).toEqual(['code', 'derived', 'evidenceReference', 'status']);
        if (check.evidenceReference !== null) expect(check.evidenceReference).toMatch(/^ref:[0-9a-f-]{36}$/);
      }
      for (const privateValue of [label, 'Synthetic original work', 'Synthetic merchant', responseText, ...inviteCodes]) {
        expect(raw.includes(privateValue), 'export contains private fixture content').toBe(false);
      }
    } finally {
      await Promise.all(contexts.map(context => context.close()));
    }
  }
});
