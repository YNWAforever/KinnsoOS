import { expect, test, type Page } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { verifiedConnectedArtifact } from '../../scripts/connected-build-identity.mjs';
import { connectedPilotFixture } from './helpers/connected-pilot-fixture';

const roles = ['traveller', 'creator', 'merchant'] as const;
const fixture = connectedPilotFixture('task10a');
const { origin, suiteLabel, runIds, guides, missions, signIn, api, ops, participant } = fixture;

test('pilot rehearsal completes; real-classified replay retains the four manual gates', async ({ browser, request }) => {
  test.setTimeout(420_000);
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
    for (const context of contexts) {
      context.setDefaultTimeout(30_000);
      context.setDefaultNavigationTimeout(30_000);
    }
    let workflowFailed = false;
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
        expect(fixture.sql(`select
          (select count(*) from kinnso_internal.requests where request_id='${requestId}')+
          (select count(*) from kinnso_internal.workspace_requests where request_id='${requestId}')+
          (select count(*) from kinnso_internal.creator_requests where request_id='${requestId}')+
          (select count(*) from kinnso_internal.trip_requests where request_id='${requestId}')`)).toBe('0');
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
      async function submitIntakeUI(input: any, existing?: string) {
        await creator.goto('/en/pilot');
        if (existing) await creator.getByLabel('Your content intakes',{exact:true}).selectOption(existing);
        else await creator.getByRole('button',{name:'New content intake',exact:true}).click();
        await creator.getByLabel('Title',{exact:true}).fill(input.title);
        await creator.getByLabel('Destination',{exact:true}).fill(input.destination);
        await creator.getByLabel('Content language code',{exact:true}).fill(input.authoredLocale);
        await creator.getByRole('textbox',{name:'Source summary',exact:true}).fill(input.sourceSummary);
        await creator.getByRole('textbox',{name:'Source URLs (one per line, up to 20)',exact:true}).fill(input.sourceUrls.join('\n'));
        await creator.getByRole('combobox',{name:'Rights basis',exact:true}).selectOption(input.rightsBasis);
        await creator.getByLabel('Rights evidence reference',{exact:true}).fill(input.rightsEvidenceReference);
        await creator.getByRole('combobox',{name:'Cover rights',exact:true}).selectOption(input.coverRightsConfirmed===null?'':String(input.coverRightsConfirmed));
        if(input.coverRightsConfirmed)await creator.getByLabel('Cover rights evidence reference',{exact:true}).fill(input.coverRightsEvidenceReference);
        await creator.getByLabel('I agree to this content consent notice.',{exact:true}).check();
        const result=creator.waitForResponse(r=>r.url().endsWith('/api/pilot')&&r.request().method()==='POST');
        await creator.getByRole('button',{name:existing?'Resubmit intake':'Submit intake',exact:true}).click();
        const response=await result;expect(response.status()).toBe(200);
        const self=(await response.json()).data.snapshot;
        expect(self.intakes.some((i:any)=>i.title===input.title)).toBe(true);
        return self.intake;
      }
      async function reviewUI(id:string,decision:'approve'|'reject',reason:string) {
        await operator.goto('/en/ops?view=pilot&id='+runId);
        const card=operator.locator('article').filter({has:operator.getByRole('heading',{name:'Intake record '+id,exact:true})});
        await expect(card.getByRole('region',{name:'Exact draft review',exact:true})).toBeVisible();
        await card.getByText('Read bound draft preview',{exact:true}).click();
        await expect(card.locator('pre')).toContainText('Synthetic');
        if(decision==='approve'){
          await card.getByLabel('I reviewed this exact draft revision and digest.',{exact:true}).check();
          await card.getByLabel('Written approval reason',{exact:true}).fill(reason);
        } else await card.getByLabel('Written review reason',{exact:true}).fill(reason);
        await card.getByRole('button',{name:decision==='approve'?'Approve exact draft':'Reject intake',exact:true}).click();
        const response=operator.waitForResponse(r=>r.url().endsWith('/api/ops/pilot')&&r.request().method()==='POST');
        await operator.getByRole('dialog').getByRole('button',{name:'Confirm',exact:true}).click();
        expect((await response).status()).toBe(200);
        await expect(operator.getByRole('dialog')).toHaveCount(0);
      }
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
        const intake = await submitIntakeUI(intakeInput);
        await expect(creator.getByLabel('Title',{exact:true})).toBeDisabled();
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
        await reviewUI(intake.id,'approve','Reviewed synthetic original work');
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
          const stored = () => JSON.parse(fixture.sql(`select jsonb_build_object(
            'sourceUrls',source_urls,'coverRightsConfirmed',cover_rights_confirmed,
            'coverRightsEvidenceReference',cover_rights_evidence_reference,'authoredLocale',authored_locale,
            'rightsBasis',rights_basis,'consentDigest',consent_digest,'draftRevision',guide_draft_revision,
            'contentDigest',content_digest,'reviewedVersion',reviewed_guide_version,'reviewer',reviewed_by_ops_member_id,
            'reviewedAt',reviewed_at,'reviewReason',review_reason) from kinnso_internal.pilot_content_intakes where id='${intake.id}'`));
          for (const change of drift) {
            await current();
            const prior = stored();
            expect(prior.draftRevision).toBe(draft.revision);
            expect(prior.contentDigest).toMatch(/^[a-f0-9]{64}$/);
            expect(prior.reviewer && prior.reviewedAt && prior.reviewReason).toBeTruthy();
            for (const [field, value] of Object.entries(change)) expect(prior[field]).not.toEqual(value);
            await reviewUI(intake.id,'reject','Synthetic rights change');
            await current();
            nextInput = { ...nextInput, ...change };
            await submitIntakeUI(nextInput,intake.id);
            const revised = await current();
            expect(revised.status).toBe('submitted');
            const persisted = stored();
            expect(persisted).toMatchObject({ ...change, draftRevision: null, contentDigest: null,
              reviewedVersion: null, reviewer: null, reviewedAt: null, reviewReason: null });
            expect(persisted.consentDigest).not.toBe(prior.consentDigest);
            const deniedPublication = await creator.request.post(origin + path + '/publish', {
              headers: { Origin: origin }, data: { expectedRevision: draft.revision, requestId: randomUUID() },
            });
            expect(deniedPublication.status()).toBe(409);
            expect((await deniedPublication.json()).code).toBe('PILOT_REVIEW_REQUIRED');
            expect(fixture.sql(`select count(*) from public.guide_versions where guide_id='${guideId}'`)).toBe('0');
            await reviewUI(intake.id,'approve','Reviewed changed synthetic rights');
            expect(stored()).toMatchObject({ draftRevision: draft.revision, contentDigest: revised.currentContentDigest,
              reviewReason: 'Reviewed changed synthetic rights', consentDigest: persisted.consentDigest });
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
      let otherMerchant: { page: Page; id: string } | undefined;
      if (classification === 'synthetic') {
        const context = await browser.newContext();
        contexts.push(context);
        const other = await context.newPage();
        const otherUser = await signIn(other, 'other-merchant', label);
        const profile = await fixture.admin.from('creators').update({ status: 'active' }).eq('id', otherUser);
        expect(Boolean(profile.error)).toBe(false);
        const application = await api(other, '/api/merchant/application', 'POST', { requestId: randomUUID(),
          input: { companyName: label + '-other', contactName: 'Synthetic merchant',
            contactEmail: label + '-other@example.test', websiteUrl: '', pitch: 'Synthetic scope test' } });
        await api(operator, '/api/ops/merchant-applications', 'POST', {
          id: application.id, action: 'approve', reason: 'Synthetic foreign merchant',
        });
        const otherMembership = await api(other, '/api/merchant');
        expect(otherMembership).toHaveLength(1);
        otherMerchant = { page: other, id: otherMembership[0].merchantId };
        expect(otherMerchant.id).not.toBe(merchantId);
        const foreignCampaign = await campaignDetail();
        await forbid(other, '/api/merchant/campaigns', 'POST', { merchantId: otherMerchant.id,
          command: { type: 'close', id: missionId, expectedUpdatedAt: foreignCampaign.updatedAt,
            reason: 'Synthetic scope probe' } }, [403, 404],
          `select md5(to_jsonb(m)::text),(select count(*) from kinnso_internal.merchant_audit
            where merchant_id in ('${merchantId}','${otherMerchant.id}')) from public.missions m where id='${missionId}'`);
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
      if (otherMerchant) {
        const targetState = `select md5(to_jsonb(s)::text),
          (select count(*) from public.mission_participants where mission_id='${missionId}'),
          (select count(*) from public.mission_milestone_submissions where mission_participant_id='${application.id}'),
          (select count(*) from kinnso_internal.merchant_audit where merchant_id in ('${merchantId}','${otherMerchant.id}'))
          from public.mission_milestone_submissions s where id='${resubmitted.id}'`;
        await forbid(otherMerchant.page, '/api/creator/missions/' + missionId, 'POST', { command: {
          type: 'submitEvidence', milestoneId, submissionId: resubmitted.id, expectedUpdatedAt: resubmitted.updatedAt,
          proofUrls: ['https://example.test/scope-probe'], notes: 'Synthetic scope probe',
        } }, [403, 404], targetState);
        await forbid(otherMerchant.page, '/api/merchant/campaigns', 'POST', { merchantId: otherMerchant.id, command: {
          type: 'reviewSubmission', id: resubmitted.id, expectedUpdatedAt: resubmitted.updatedAt,
          action: 'approve', feedback: 'Synthetic scope probe', reason: 'Synthetic scope probe',
        } }, [403, 404], targetState);
      }
      await review(resubmitted, 'approve');
      const inbox = await api(creator, '/api/inbox');
      expect(inbox.items).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'submission.approved', entityId: missionId }),
      ]));
      await creator.goto('/en/pilot');
      const acknowledged=creator.waitForResponse(r=>r.url().endsWith('/api/pilot')&&r.request().method()==='POST');
      await creator.getByRole('button',{name:'Acknowledge pilot notification',exact:true}).click();
      expect((await acknowledged).status()).toBe(200);
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
      await traveller.goto('/en/pilot');
      await expect(traveller.getByRole('link',{name:'Open support',exact:true})).toHaveAttribute('href','/en/support?mission='+missionId);
      await traveller.getByRole('link',{name:'Open support',exact:true}).click();
      await expect(traveller.getByLabel('Case subject', { exact: true })).toHaveValue('Collaboration: Pilot support');
      const supportSubject = label + '-private-subject';
      await traveller.getByLabel('Case subject', { exact: true }).fill(supportSubject);
      await traveller.getByLabel('Message to support', { exact: true }).fill(label + '-private-message');
      const creation = traveller.waitForResponse(r => r.url().endsWith('/api/support') && r.request().method() === 'POST');
      await traveller.getByRole('button', { name: 'Create support case', exact: true }).click();
      const createdCase = await creation;
      expect(createdCase.status()).toBe(200);
      const opened = (await createdCase.json()).data;
      const supportId = opened.id;
      await expect(traveller.getByRole('article').filter({ has: traveller.getByRole('heading', { name: supportSubject, exact: true }) })).toContainText(label + '-private-message');
      if (classification === 'synthetic') {
        await forbid(creator, '/api/support', 'POST', { command: { type: 'reply', id: supportId,
          expectedRevision: opened.revision, message: 'Synthetic scope probe' } }, [403, 404],
          `select count(*),(select count(*) from kinnso_internal.support_audit where case_id='${supportId}')
            from kinnso_internal.support_messages where case_id='${supportId}'`);
      }
      const responseText = label + '-private-response';
      await operator.goto('/en/ops/support');
      const supportCard = operator.getByRole('article').filter({ has: operator.getByRole('heading', { name: supportSubject, exact: true }) });
      await supportCard.getByLabel('Case decision', { exact: true }).selectOption('resolved');
      await supportCard.getByLabel('Internal decision reason', { exact: true }).fill('Synthetic support review');
      await supportCard.getByLabel('Response visible to the customer', { exact: true }).fill(responseText);
      const reviewedCase = operator.waitForResponse(r => r.url().endsWith('/api/support') && r.request().method() === 'POST');
      await supportCard.getByRole('button', { name: 'Assign to me and apply decision', exact: true }).click();
      expect((await reviewedCase).status()).toBe(200);
      await expect(supportCard).toContainText(responseText);
      expect((await api(traveller, '/api/support/' + supportId + '/messages')).items).toEqual(
        expect.arrayContaining([expect.objectContaining({ message: responseText })]));
      const evidence = (checkCode: string, entityType: string, entityId: string, participantId: string | null) =>
        ops(operator, { type: 'addEvidenceReference', runId, checkCode, entityType, entityId,
          participantId, evidenceReference: 'ref:' + entityId });
      await operator.goto('/en/ops?view=pilot&id='+runId);
      const supportCheck=operator.locator('article').filter({has:operator.getByRole('heading',{name:'support resolved',exact:true})});
      await supportCheck.getByLabel('Support case ID',{exact:true}).fill(supportId);
      await supportCheck.getByLabel('Opaque evidence reference (ref: followed by an ID)',{exact:true}).fill('ref:'+supportId);
      await supportCheck.getByRole('button',{name:'Attach evidence reference',exact:true}).click();
      const evidenceResponse=operator.waitForResponse(r=>r.url().endsWith('/api/ops/pilot')&&r.request().method()==='POST');
      await operator.getByRole('dialog').getByRole('button',{name:'Confirm',exact:true}).click();
      expect((await evidenceResponse).status()).toBe(200);
      await traveller.goto('/en/pilot');
      const supportAck=traveller.waitForResponse(r=>r.url().endsWith('/api/pilot')&&r.request().method()==='POST');
      await traveller.getByRole('button',{name:'Acknowledge support response',exact:true}).click();
      expect((await supportAck).status()).toBe(200);
      await traveller.getByRole('button',{name:'Withdraw from pilot',exact:true}).click();
      await expect(traveller.getByRole('dialog')).toBeVisible();
      await traveller.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();
      await expect(traveller.getByRole('dialog')).not.toBeVisible();
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
      if(classification==='real'){
        await traveller.goto('/en/pilot');
        await traveller.getByRole('button',{name:'Withdraw from pilot',exact:true}).click();
        const withdrawn=traveller.waitForResponse(r=>r.url().endsWith('/api/pilot')&&r.request().method()==='POST');
        await traveller.getByRole('button',{name:'Confirm withdrawal',exact:true}).click();
        expect((await withdrawn).status()).toBe(200);
        await expect(traveller.getByRole('button',{name:'Withdraw from pilot',exact:true})).toHaveCount(0);
        expect((await api(traveller,'/api/pilot')).participant.status).toBe('withdrawn');
        expect((await api(traveller,'/api/trips/'+trip.id)).id).toBe(trip.id);
      }
    } catch (error) {
      workflowFailed = true;
      throw error;
    } finally {
      const closed = await Promise.allSettled(contexts.map(context => context.close()));
      // Preserve the workflow error if timeout teardown has already closed a page.
      if (!workflowFailed) {
        const failure = closed.find(result => result.status === 'rejected');
        if (failure?.status === 'rejected') throw failure.reason;
      }
    }
  }
});
