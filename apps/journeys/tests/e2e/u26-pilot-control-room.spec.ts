import { expect, test, type Page } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { verifiedConnectedArtifact } from '../../scripts/connected-build-identity.mjs';
import { connectedPilotFixture } from './helpers/connected-pilot-fixture';

const roles = ['traveller', 'creator', 'merchant'] as const;
const fixture = connectedPilotFixture('task10a');
const { origin, suiteLabel, runIds, guides, missions, signIn, api, ops, participant } = fixture;

test('pilot rehearsal completes; real-classified replay retains the four manual gates', async ({ browser, request }) => {
  test.setTimeout(240_000);
  const expectedBuild = verifiedConnectedArtifact(process.cwd());
  const health = await request.get(origin + '/api/health', { maxRedirects: 0 });
  const served = health.headers()['x-kinnso-local-build'];
  expect(served && JSON.parse(served)).toEqual(expectedBuild);
  console.log('Task10A expected and served build:', expectedBuild);
  let rehearsal: string | null = null;
  for (const classification of ['synthetic', 'real'] as const) {
    if (classification === 'real') {
      // Allow the isolated Docker Auth-to-Postgres sockets from the first scope
      // to leave TIME_WAIT before creating a second set of browser sessions.
      await test.step('Let isolated Auth connections drain between pilot scopes', async () => {
        await new Promise<void>(resolve => setTimeout(resolve, 65_000));
      });
    }
    const runId = randomUUID();
    runIds.unshift(runId);
    const label = suiteLabel + '-' + classification;
    const firstGuide = guides.length;
    const contexts = await Promise.all([0, 1, 2, 3].map(() => browser.newContext()));
    try {
      const [operator, ...members] = await Promise.all(contexts.map(context => context.newPage()));
      const operatorId = await signIn(operator, 'operator', label);
      const membership = await fixture.admin.from('kinnso_ops_members').insert({
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
      async function forbid(page: typeof operator, path: string, method: string, data: object, codes = [403, 404], readback?: string) {
        const before = readback ? fixture.sql(readback) : '';
        const requestId = randomUUID();
        const response = await page.request.fetch(origin + path, {
          method, data: { ...data, requestId }, headers: { Origin: origin }, maxRedirects: 0,
        });
        const status = response.status();
        expect(codes, method + ' ' + path.split('/').slice(0, 4).join('/')).toContain(status);
        const body = await response.json();
        expect(body.ok === false && body.code === ({403:'FORBIDDEN',404:'NOT_FOUND',409:'CONFLICT'} as Record<number,string>)[status]).toBe(true);
        expect(Object.keys(body).every(key => ['ok','code','retryable','requestId'].includes(key))).toBe(true);
        expect(fixture.sql(`select count(*) from kinnso_internal.requests where request_id='${requestId}'`)).toBe('0');
        if (readback) expect(fixture.sql(readback)).toBe(before);
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
        const intakeInput = {
          title, destination: 'Kyoto', authoredLocale: 'en', sourceSummary: 'Synthetic original work',
          sourceUrls: [], rightsBasis: 'original', rightsEvidenceReference: 'ref:' + guideId,
          authorConsentVersion: notices.contentConsentVersion, authorConsentDigest: notices.contentConsentDigest,
          coverRightsConfirmed: null, coverRightsEvidenceReference: null,
        };
        const intake = (await participant(creator, { type: 'submitContentIntake', intake: intakeInput })).snapshot.intake;
        if (classification === 'synthetic' && index === 1) {
          const duplicate = randomUUID();
          const before = fixture.sql(`select count(*) from kinnso_internal.pilot_content_intakes where run_id='${runId}'`);
          const response = await creator.request.post(origin + '/api/pilot', { headers: { Origin: origin },
            data: { requestId: duplicate, command: { type: 'submitContentIntake', requestId: duplicate, intake: intakeInput } } });
          expect(response.status()).toBe(409);
          expect((await response.json()).code).toBe('CONFLICT');
          expect(fixture.sql(`select count(*) from kinnso_internal.pilot_content_intakes where run_id='${runId}'`)).toBe(before);
          expect(fixture.sql(`select count(*) from kinnso_internal.requests where request_id='${duplicate}'`)).toBe('0');
        }
        if (classification === 'synthetic' && index === 2) {
          await forbid(operator, '/api/ops/pilot', 'POST', { command: { type: 'bindGuide', intakeId: intake.id,
            guideId: guides[firstGuide], expectedRevision: intake.revision } }, [409], `select count(*),
            (select count(*) from public.ops_audit_log where entity_id='${intake.id}') from kinnso_internal.pilot_content_intakes
            where run_id='${runId}' and guide_id='${guides[firstGuide]}'`);
        }
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
        if (classification === 'synthetic' && index === 1) {
          await forbid(members[0], path + '/publish', 'POST', { expectedRevision: draft.revision }, [403, 404],
            `select count(*) from public.guide_versions where guide_id='${guideId}'`);
          const drift = [
            { sourceUrls: ['https://example.test/source'] },
            { coverRightsConfirmed: true, coverRightsEvidenceReference: 'ref:' + guideId },
            { authoredLocale: 'zh-HK' },
            { rightsBasis: 'permission' },
          ];
          let nextInput: Record<string, unknown> = { ...intakeInput };
          const current = async () => (await api(operator, '/api/ops/pilot?runId=' + runId))
            .contentIntakes.find((item: { id: string }) => item.id === intake.id);
          for (const change of drift) {
            const approved = await current();
            await ops(operator, { type: 'reviewContentIntake', id: intake.id,
              expectedRevision: approved.revision, decision: 'reject', reason: 'Synthetic rights change' });
            const rejected = await current();
            nextInput = { ...nextInput, ...change };
            await participant(creator, { type: 'updateOwnedContentIntake', id: intake.id,
              expectedRevision: rejected.revision, intake: nextInput });
            const revised = await current();
            expect(revised.status).toBe('submitted');
            const deniedPublication = await creator.request.post(origin + path + '/publish', {
              headers: { Origin: origin }, data: { expectedRevision: draft.revision, requestId: randomUUID() },
            });
            expect(deniedPublication.status()).toBe(409);
            expect((await deniedPublication.json()).code).toBe('PILOT_REVIEW_REQUIRED');
            expect(fixture.sql(`select count(*) from public.guide_versions where guide_id='${guideId}'`)).toBe('0');
            await ops(operator, { type: 'reviewContentIntake', id: intake.id, expectedRevision: revised.revision,
              decision: 'approve', expectedDraftRevision: revised.currentDraftRevision,
              expectedContentDigest: revised.currentContentDigest, reason: 'Reviewed changed synthetic rights' });
          }
        }
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
      if (classification === 'synthetic') {
        const absentMission = randomUUID();
        await forbid(creator, '/api/creator/missions/' + absentMission, 'POST',
          { command: { type: 'join', applicationNote: 'Synthetic scope probe' } }, [403, 404],
          `select count(*) from public.mission_participants where mission_id in ('${missionId}', '${absentMission}')`);
        const foreignCampaign = await campaignDetail();
        await forbid(traveller, '/api/merchant/campaigns', 'POST', { merchantId,
          command: { type: 'close', id: missionId, expectedUpdatedAt: foreignCampaign.updatedAt,
            reason: 'Synthetic scope probe' } }, [403, 404],
          `select status,updated_at,(select count(*) from kinnso_internal.merchant_audit where merchant_id='${merchantId}')
            from public.missions where id='${missionId}'`);
      }
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
      if (classification === 'synthetic') {
        await forbid(merchant, '/api/merchant/campaigns', 'POST', { merchantId, command: {
          type: 'reviewSubmission', id: randomUUID(), expectedUpdatedAt: resubmitted.updatedAt,
          action: 'approve', feedback: 'Synthetic scope probe', reason: 'Synthetic scope probe',
        } }, [403, 404], `select status,updated_at,
          (select count(*) from kinnso_internal.merchant_audit where merchant_id='${merchantId}')
          from public.mission_milestone_submissions where id='${resubmitted.id}'`);
      }
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
      if (classification === 'synthetic') {
        await forbid(creator, '/api/trips/' + trip.id + '/commands', 'POST', {
          expectedRevision: edited.revision, command: { type: 'updateStop', id: adopted.days[0].stops[0].id,
            patch: { travellerNote: 'Synthetic scope probe' } },
        }, [403, 404], `select count(*) from public.trip_revisions where trip_id='${trip.id}'`);
      }
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
      if (classification === 'synthetic') {
        await forbid(creator, '/api/support', 'POST', { command: { type: 'reply', id: supportId,
          expectedRevision: opened.revision, message: 'Synthetic scope probe' } }, [403, 404],
          `select count(*),(select count(*) from kinnso_internal.support_audit where case_id='${supportId}')
            from kinnso_internal.support_messages where case_id='${supportId}'`);
      }
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
