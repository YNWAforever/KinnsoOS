import { expect, test, type APIResponse, type Page } from '@playwright/test';
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
  expect(JSON.parse(raw)).toMatchObject({ ok: false, code });
  expect(Object.keys(JSON.parse(raw)).every(key => ['ok', 'code', 'requestId', 'retryable'].includes(key))).toBe(true);
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
    await signIn(outsider, 'outsider', suiteLabel);
    const id = randomUUID();
    runIds.push(id);
    const created = await ops(operator, { type: 'createRun', id, name: suiteLabel,
      dataClassification: 'synthetic', candidateReleaseSha: build.head, environmentOrigin: origin });
    const digest = (label: string) => createHash('sha256').update(suiteLabel + label).digest('hex');
    let { snapshot } = await ops(operator, { type: 'configureRun', id,
      expectedRevision: created.snapshot.run.revision,
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
    const invite = async (role: string) => {
      const participantId = slots.get(role)!;
      const slot = snapshot.participants.find((item: { id: string }) => item.id === participantId);
      return ops(operator, { type: 'createInvite', id: randomUUID(), participantId,
        expectedRevision: slot.revision, expiresInHours: 1 });
    };
    const wrong = randomUUID();
    const sensitive = [suiteLabel, id, ...slots.values(), wrong];
    await denied(await claim(member, wrong), 404, 'NOT_FOUND', sensitive);
    await denied(await member.request.get(opsPath + '?runId=' + id), 403, 'FORBIDDEN', sensitive);

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

    snapshot = await api(operator, opsPath + '?runId=' + id);
    const pending = await invite('creator');
    snapshot = await api(operator, opsPath + '?runId=' + id);
    await ops(operator, { type: 'setRunStatus', id, status: 'paused',
      expectedRevision: snapshot.run.revision, reason: 'Synthetic security acceptance' });
    await denied(await claim(outsider, pending.inviteCode), 404, 'NOT_FOUND', [...sensitive, pending.inviteCode]);
  } finally {
    await Promise.all(contexts.map(context => context.close()));
  }
});
