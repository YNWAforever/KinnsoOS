import { expect, test, type APIResponse, type Page, type Route } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { verifiedConnectedArtifact } from '../../scripts/connected-build-identity.mjs';
import { connectedPilotFixture } from './helpers/connected-pilot-fixture';

const fixture = connectedPilotFixture('task10b');
const { origin, suiteLabel, runIds, signIn, api, ops } = fixture;
const opsPath = '/api/ops/pilot';
const participantPath = '/api/pilot';

async function denied(response: APIResponse, status: number, code: string, privateValues: string[] = []) {
  const raw = await response.text();
  expect(response.status()).toBe(status);
  const envelope = JSON.parse(raw);
  expect(envelope?.ok === false && envelope?.code === code).toBe(true);
  expect(Object.keys(envelope).every(key => ['ok', 'code', 'requestId', 'retryable'].includes(key))).toBe(true);
  expect(privateValues.some(value => raw.includes(value))).toBe(false);
}

function claim(page: Page, code: string, requestId = randomUUID()) {
  return page.request.post(participantPath, {
    headers: { Origin: origin },
    data: { requestId, command: { type: 'claimInvite', requestId, code } },
  });
}

test('pilot invitation errors are opaque and exact claim replay writes once', async ({ browser, request }) => {
  test.setTimeout(120_000);
  const build = verifiedConnectedArtifact(process.cwd());
  const health = await request.get('/api/health');
  expect(JSON.parse(health.headers()['x-kinnso-local-build'] || 'null')).toEqual(build);

  const contexts = await Promise.all([0, 1, 2].map(() => browser.newContext()));
  try {
    const [operator, member, outsider] = await Promise.all(contexts.map(context => context.newPage()));
    const operatorId = await signIn(operator, 'operator', suiteLabel);
    const membership = await fixture.admin.from('kinnso_ops_members').insert({
      user_id: operatorId, display_name: suiteLabel, role: 'admin', status: 'active',
    });
    expect(Boolean(membership.error)).toBe(false);
    await signIn(member, 'member', suiteLabel);
    const outsiderId = await signIn(outsider, 'outsider', suiteLabel);
    const id = randomUUID();
    runIds.push(id);
    const created = await ops(operator, { type: 'createRun', id, name: suiteLabel,
      dataClassification: 'synthetic', candidateReleaseSha: build.head, environmentOrigin: origin });
    const digest = (label: string) => createHash('sha256').update(suiteLabel + label).digest('hex');
    let { snapshot } = await ops(operator, { type: 'configureRun', id,
      expectedRevision: created.snapshot.run.revision, syntheticRehearsalRunId: null,
      participationNoticeVersion: suiteLabel + '-participation', participationNoticeDigest: digest('participation'),
      privacyNoticeVersion: suiteLabel + '-privacy', privacyNoticeDigest: digest('privacy'),
      contentConsentVersion: suiteLabel + '-rights', contentConsentDigest: digest('rights'),
      coordinatorReference: suiteLabel + ':coordinator', supportOwnerReference: suiteLabel + ':support',
      privacyOwnerReference: suiteLabel + ':privacy', alertOwnerReference: suiteLabel + ':alerts',
      privateChannelReference: suiteLabel + ':channel' });
    const slots = new Map<string, string>();
    for (const role of ['traveller', 'creator', 'merchant']) {
      const slot = randomUUID();
      slots.set(role, slot);
      ({ snapshot } = await ops(operator, { type: 'addParticipant', id: slot, runId: id, role,
        cohortRole: 'required_' + role, displayLabel: suiteLabel + ':' + role }));
    }
    for (const status of ['recruiting', 'running']) {
      ({ snapshot } = await ops(operator, { type: 'setRunStatus', id, status,
        expectedRevision: snapshot.run.revision, reason: 'Synthetic security acceptance' }));
    }
    function postOps(page: Page, command: object) {
      return page.request.post(opsPath, {
        headers: { Origin: origin }, data: { requestId: randomUUID(), command },
      });
    }
    const invite = async (role: string) => {
      const participantId = slots.get(role)!;
      const slot = snapshot.participants.find((item: { id: string }) => item.id === participantId);
      const inviteId = randomUUID();
      const result = await ops(operator, { type: 'createInvite', id: inviteId, participantId,
        expectedRevision: slot.revision, expiresInHours: 1 });
      return { ...result, inviteId };
    };
    const wrong = randomUUID();
    const sensitive = [suiteLabel, id, ...slots.values(), wrong];
    await denied(await claim(member, wrong), 404, 'NOT_FOUND', sensitive);
    await denied(await member.request.get(opsPath + '?runId=' + id), 403, 'FORBIDDEN', sensitive);
    const forged = { type: 'setRunStatus', id, status: 'paused',
      expectedRevision: snapshot.run.revision, reason: 'Synthetic authorization probe' };
    await denied(await postOps(member, forged), 403, 'FORBIDDEN', sensitive);
    const operatorOnlyRequest = randomUUID();
    await denied(await operator.request.post(participantPath, {
      headers: { Origin: origin },
      data: { requestId: operatorOnlyRequest, command: { type: 'acknowledgeNotification', requestId: operatorOnlyRequest } },
    }), 403, 'FORBIDDEN', sensitive);

    const evidence = { type: 'addEvidenceReference', runId: id, checkCode: 'physical_ios',
      entityType: 'manual', entityId: id, evidenceReference: 'https://untrusted.example.test/private' };
    await denied(await postOps(operator, { ...evidence, private: { label: suiteLabel } }), 400, 'INVALID', sensitive);
    await denied(await postOps(operator, evidence), 400, 'INVALID', [...sensitive, evidence.evidenceReference]);

    const { inviteCode } = await invite('traveller');
    const requestId = randomUUID();
    const first = await claim(member, inviteCode, requestId);
    expect(first.status()).toBe(200);
    const replay = await claim(member, inviteCode, requestId);
    expect(replay.status()).toBe(200);
    const firstBody = await first.json(), replayBody = await replay.json();
    expect(firstBody.data.snapshot.participant.id).toBe(slots.get('traveller'));
    expect(replayBody.data.snapshot.participant.id).toBe(slots.get('traveller'));
    expect(replayBody.data.snapshot.participant.revision).toBe(firstBody.data.snapshot.participant.revision);
    await denied(await claim(member, wrong, requestId), 409, 'CONFLICT', [...sensitive, inviteCode]);
    await denied(await claim(outsider, inviteCode), 404, 'NOT_FOUND', [...sensitive, inviteCode]);

    expect(fixture.sql(`select count(*) from kinnso_internal.pilot_participant_audit
      where run_id='${id}' and participant_id='${slots.get('traveller')}' and command_type='claimInvite'`)).toBe('1');

    // Hold a real browser request before dispatch, then commit withdrawal.
    const gate = () => {
      let open!: () => void;
      const wait = new Promise<void>(resolve => { open = resolve; });
      return { wait, open };
    };
    const started = gate(), dispatch = gate(), delivered = gate();
    let consentRequestId = '';
    let consentStatus = 0;
    await member.goto('/en/pilot');
    const accept = member.getByRole('button', { name: 'Accept these notices', exact: true });
    await expect(accept).toBeVisible();
    const consentRoute = async (route: Route) => {
      if (route.request().method() !== 'POST') return route.continue();
      try {
        consentRequestId = route.request().postDataJSON().requestId;
        started.open();
        await dispatch.wait;
        const response = await route.fetch({ maxRedirects: 0 });
        consentStatus = response.status();
        await route.fulfill({ response });
      } finally { delivered.open(); }
    };
    await member.route('**/api/pilot', consentRoute);
    try {
      await accept.click();
      await started.wait;
      expect(consentRequestId).toMatch(/^[a-f0-9-]{36}$/);
      snapshot = await api(operator, opsPath + '?runId=' + id);
      const joined = snapshot.participants.find((slot: { id: string }) => slot.id === slots.get('traveller'));
      await ops(operator, { type: 'setParticipantStatus', id: joined.id, expectedRevision: joined.revision,
        status: 'withdrawn', reason: 'Synthetic in-flight withdrawal' });
      dispatch.open();
      await delivered.wait;
      expect(consentStatus).toBe(403);
      await expect(accept).toHaveCount(0);
      expect(fixture.sql(`select count(*) from kinnso_internal.requests where request_id='${consentRequestId}'`)).toBe('0');
      expect(fixture.sql(`select count(*) from kinnso_internal.pilot_participant_audit
        where participant_id='${joined.id}' and command_type='acceptConsent'`)).toBe('0');
      const self = await api(member, participantPath);
      expect(self.participant.status).toBe('withdrawn');
      expect(self.workflowLinks).toBeNull();
      expect(self.intake).toBeNull();
      expect(self.nextStep).toBeNull();
    } finally {
      dispatch.open();
      await member.unroute('**/api/pilot', consentRoute);
    }

    snapshot = await api(operator, opsPath + '?runId=' + id);
    const revoked = await invite('merchant');
    snapshot = await api(operator, opsPath + '?runId=' + id);
    const merchantSlot = snapshot.participants.find((item: { id: string }) => item.id === slots.get('merchant'));
    await ops(operator, { type: 'revokeInvite', id: revoked.inviteId, participantId: merchantSlot.id,
      expectedRevision: merchantSlot.revision, reason: 'Synthetic invite revocation' });
    await denied(await claim(outsider, revoked.inviteCode), 404, 'NOT_FOUND', [...sensitive, revoked.inviteCode]);

    snapshot = await api(operator, opsPath + '?runId=' + id);
    const pending = await invite('creator');
    snapshot = await api(operator, opsPath + '?runId=' + id);
    ({ snapshot } = await ops(operator, { type: 'setRunStatus', id, status: 'paused',
      expectedRevision: snapshot.run.revision, reason: 'Synthetic security acceptance' }));
    {
      const correlation = randomUUID();
      const response = await outsider.request.post(participantPath, {
        headers: { Origin: origin, 'X-Kinnso-Local-Correlation': correlation },
        data: { requestId: correlation, command: { type: 'claimInvite', requestId: correlation, code: pending.inviteCode } },
      });
      expect(response.status(), 'Claim correlation ' + correlation).toBe(404);
      await denied(response, 404, 'NOT_FOUND', [...sensitive, pending.inviteCode]);
    }
    ({ snapshot } = await ops(operator, { type: 'setRunStatus', id, status: 'cancelled',
      expectedRevision: snapshot.run.revision, reason: 'Synthetic security acceptance' }));
    await denied(await claim(outsider, pending.inviteCode), 404, 'NOT_FOUND', [...sensitive, pending.inviteCode]);

    const late = gate(), releaseRead = gate(), readDelivered = gate();
    let capturedStatus = 0;
    const signout = await member.context().newPage();
    await member.route('**/api/pilot', async route => {
      try {
        const response = await route.fetch({ maxRedirects: 0 });
        capturedStatus = response.status();
        late.open();
        await releaseRead.wait;
        await route.fulfill({ response }).catch(() => {});
      } finally { readDelivered.open(); }
    });
    try {
      await member.goto('/en/pilot', { waitUntil: 'commit' });
      await late.wait;
      expect(capturedStatus).toBe(200);
      await signout.goto('/en/me');
      await signout.getByRole('button', { name: 'Sign out', exact: true }).click();
      await signout.waitForURL('**/en/sign-in*');
      await expect(member.getByRole('link', { name: 'Sign in to continue', exact: true })).toBeVisible();
      releaseRead.open();
      await readDelivered.wait;
      await expect(member.getByRole('link', { name: 'Sign in to continue', exact: true })).toBeVisible();
      await expect(member.getByRole('heading', { name: suiteLabel, exact: true })).toHaveCount(0);
    } finally {
      releaseRead.open();
      await signout.close();
    }

    const suspended = await fixture.admin.from('kinnso_ops_members').update({ status: 'paused' }).eq('user_id', operatorId);
    expect(Boolean(suspended.error)).toBe(false);
    await denied(await operator.request.get(opsPath + '?runId=' + id), 403, 'FORBIDDEN', sensitive);
    await denied(await postOps(operator, forged), 403, 'FORBIDDEN', sensitive);
    expect(fixture.sql(`with expired as (update auth.sessions set not_after=now()-interval '1 minute'
      where user_id='${outsiderId}' returning id) select count(*) from expired`)).toBe('1');
    await denied(await claim(outsider, wrong), 401, 'AUTH_REQUIRED', sensitive);
  } finally {
    await Promise.all(contexts.map(context => context.close()));
  }
});
