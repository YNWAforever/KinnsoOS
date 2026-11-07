# Kinnso Operator-Led Pilot Control Room Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an operations-only pilot control room and participant onboarding/content-intake flow that proves the complete real traveller and creator/merchant journeys without replacing Kinnso's existing authoritative workspaces.

**Architecture:** Add a narrow `pilot` capability backed by new `kinnso_internal` records and audited RPCs. Operations administers runs, participants, content rights, bindings and evidence; participants claim one-time invitations and complete role-specific intake; existing guide, campaign, submission, notification, trip and support records remain authoritative.

**Tech Stack:** Next.js 16.3.8 App Router, React 19.2.4, TypeScript 5.9.3, Supabase Postgres/Auth 2.108.1, `@supabase/ssr` 0.12.0, Node test runner, Playwright 1.58.2.

**Spec:** `docs/superpowers/specs/2026-11-07-kinnso-pilot-control-room-design.md` at approved commit `ddd864fbe05ae7a40d3aefb0c0512241dadd7b15`.

## Global Constraints

- Work from `C:\Users\laich\Documents\KinnsoOS\.worktrees\single-origin-design-20261105` on `codex/single-origin-design-20261105`.
- Read the root and app `AGENTS.md` files and the installed Next.js 16.3.8 documentation before changing Next.js code.
- Add no new external service, email sender, upload provider, payment provider, paid AI call, affiliate execution, booking or payout path.
- Keep `pilot` disconnected by default. Do not add it to production `KINNSO_ENABLED_CAPABILITIES` during implementation.
- Keep existing creator, merchant, operations, support, trip and notification workspaces authoritative.
- Store all new tables in unexposed `kinnso_internal`; enable RLS; revoke direct access from `public`, `anon`, `authenticated` and `service_role`.
- Authorization uses the current session and current database role. Never use editable `user_metadata`.
- All writes use bounded validation, same-origin checks, idempotent request IDs, optimistic revisions and same-transaction audit events.
- Never log or persist raw invitation codes, passwords, tokens, private trip text, support-message text, source-document bytes or credentials.
- Real-process evidence must be created after the run's `acceptance_started_at` and must involve the exact required participant/guide/campaign records.
- Synthetic rehearsal and real participation are separate runs. Synthetic records never satisfy real checks.
- Operations mutation requires active `admin` or `owner`; operations read requires active `moderator`, `admin` or `owner`.
- Participant reads and writes are scoped to the current verified Auth user and one active slot in the selected run.
- Content approval covers the exact guide draft revision and canonical digest. Any later content, source, language, cover or rights change invalidates it.
- A requested revision may pass only after the creator resubmits and the final submission status is `approved`.
- Privacy/support copy, owner references, alert routing, physical iOS, physical Android, VoiceOver and NVDA never pass by inference.
- Support EN and zh-HK copy; verify keyboard operation, 320px layout, 200% text and focus restoration.
- Do not create persistent production records in tests; use the ownership-verified isolated Supabase target.
- Do not push, deploy, apply production migrations or enable capabilities without a separate release approval.
- Update `apps/journeys/scripts/source-manifest.json` whenever adding/removing files included by the source package.

## Review Focus

- **Invitation claim race and secrecy:** Two users submit the same code concurrently, repeat a successful claim, submit after revocation/expiry, or inspect an unknown outcome. Exactly one verified user may claim; raw codes never reappear in API responses, logs, receipts or audit.
- **Exact content approval and publish race:** Guide text/structure/sources/language/cover/rights change after approval, or publication races with approval. Publication must atomically recheck the exact reviewed revision/digest and fail without mutating the guide or intake.
- **Cross-account and cross-run isolation:** A participant changes UUIDs, reuses a stale response, or requests another participant's content, trip, support case, campaign or evidence. The server returns only current-user/current-run data and invalidates private state after role/session loss.
- **Pause, consent and replacement semantics:** A paused run still permits claims/publication, a changed notice remains implicitly accepted, or a replacement inherits old evidence. Each must be blocked and explained.
- **State conflation:** Setup is shown as execution complete; stale/manual checks override database truth; missing values become zero; old links or another environment satisfy a required check. The API must return separate `readyToBegin`, `executionComplete` and `completed` states with blockers.

## File Structure

Create:

- `apps/journeys/lib/contracts/pilot.ts` — shared types, strict command parsers and readiness result contracts.
- `apps/journeys/lib/pilot/readiness.ts` — pure readiness/evidence-eligibility rules.
- `apps/journeys/lib/pilot/repository.ts` — client calls for operations and participant APIs.
- `apps/journeys/lib/pilot/telemetry.ts` — allowlisted aggregate pilot telemetry.
- `apps/journeys/app/api/ops/pilot/route.ts` — operations read/command BFF.
- `apps/journeys/app/api/pilot/route.ts` — participant read/command BFF.
- `apps/journeys/app/travel/pilot/PilotControlRoom.tsx` — operations overview.
- `apps/journeys/app/travel/pilot/PilotParticipants.tsx` — slots and invitation management.
- `apps/journeys/app/travel/pilot/PilotContentReview.tsx` — rights review and bindings.
- `apps/journeys/app/travel/pilot/PilotChecks.tsx` — derived/manual checks and completion.
- `apps/journeys/app/travel/pilot/PilotWorkspace.tsx` — participant onboarding and checklist.
- `apps/journeys/app/travel/pilot/PilotContentIntakeForm.tsx` — participant content-rights form.
- `apps/journeys/tests/pilot-contracts.test.mjs` — parser and readiness unit tests.
- `apps/journeys/tests/pilot-routes.test.mjs` — BFF route contract tests.
- `apps/journeys/tests/integration/pilot-control-room.test.mjs` — isolated database/RLS/state tests.
- `apps/journeys/tests/e2e/u26-pilot-control-room.spec.ts` — connected end-to-end browser journey.

Modify:

- `supabase/migrations/` — add two CLI-generated migrations, one for schema and one for RPCs/publish guard.
- `apps/journeys/lib/contracts/capabilities.ts:74` — add the `pilot` capability.
- `apps/journeys/app/[locale]/[[...route]]/page.tsx:102` — recognize `pilot` and pass the capability.
- `apps/journeys/app/travel/Workbench.tsx:257` — render the participant pilot workspace.
- `apps/journeys/app/travel/OpsWorkspace.tsx:11` — recognize `ops?view=pilot`.
- `apps/journeys/app/travel/OpsDashboardWorkspace.tsx:18` — add the pilot navigation item/read path.
- `apps/journeys/app/api/creator/guides/[id]/publish/route.ts:4` — call the pilot-aware publish RPC.
- `apps/journeys/scripts/source-manifest.json` — include all new source/test files and migrations.
- `apps/journeys/tests/capabilities.test.mjs` — assert `pilot` is disconnected unless enabled.
- `apps/journeys/tests/consolidated-origin-navigation.test.mjs` — assert canonical `/pilot` and ops nav behavior.

## Shared Type Contracts

All later tasks use these names from `apps/journeys/lib/contracts/pilot.ts`:

```ts
export type PilotRole = 'traveller' | 'creator' | 'merchant';
export type PilotCohortRole =
  | 'required_traveller'
  | 'required_creator'
  | 'required_merchant'
  | 'observer';
export type PilotRunStatus =
  | 'draft'
  | 'recruiting'
  | 'paused'
  | 'running'
  | 'completed'
  | 'cancelled';
export type PilotCheckStatus = 'not_run' | 'pass' | 'fail' | 'blocked';

export type OpsPilotCommand =
  | { type: 'createRun'; id: string; name: string; dataClassification: 'synthetic' | 'real'; candidateReleaseSha: string; environmentOrigin: string }
  | { type: 'configureRun'; id: string; expectedRevision: number; participationNoticeVersion: string; privacyNoticeVersion: string; contentConsentVersion: string; coordinatorReference: string; supportOwnerReference: string; privacyOwnerReference: string; alertOwnerReference: string; privateChannelReference: string; syntheticRehearsalRunId: string | null }
  | { type: 'setRunStatus'; id: string; expectedRevision: number; status: PilotRunStatus; reason: string }
  | { type: 'addParticipant'; id: string; runId: string; role: PilotRole; cohortRole: PilotCohortRole; displayLabel: string }
  | { type: 'setParticipantStatus'; id: string; expectedRevision: number; status: 'active' | 'paused' | 'withdrawn' | 'completed'; reason: string }
  | { type: 'createInvite'; id: string; participantId: string; expiresInHours: number }
  | { type: 'revokeInvite'; id: string; participantId: string; reason: string }
  | { type: 'reviewContentIntake'; id: string; expectedRevision: number; decision: 'approve' | 'reject'; reason: string }
  | { type: 'bindGuide'; intakeId: string; guideId: string; expectedRevision: number }
  | { type: 'bindCollaboration'; id: string; runId: string; merchantParticipantId: string; creatorParticipantId: string; missionId: string }
  | { type: 'setManualCheck'; id: string; expectedRevision: number; status: PilotCheckStatus; evidenceReference: string | null; observedSummary: string | null }
  | { type: 'addEvidenceReference'; runId: string; checkCode: string; entityType: PilotEvidenceEntityType; entityId: string; evidenceReference: string | null };

export type PilotParticipantCommand =
  | { type: 'claimInvite'; requestId: string; code: string }
  | { type: 'acceptConsent'; requestId: string; noticeVersion: string }
  | { type: 'submitContentIntake'; requestId: string; intake: PilotContentIntakeInput }
  | { type: 'updateOwnedContentIntake'; requestId: string; id: string; expectedRevision: number; intake: PilotContentIntakeInput }
  | { type: 'acknowledgeNotification'; requestId: string }
  | { type: 'acknowledgeSupportResponse'; requestId: string };

export type PilotReadinessStage =
  | 'setup_incomplete'
  | 'ready_to_begin'
  | 'executing'
  | 'execution_complete'
  | 'completed'
  | 'blocked';

export type OpsPilotSnapshot = {
  run: OpsPilotRunView | null;
  participants: OpsPilotParticipantView[];
  contentIntakes: OpsPilotContentIntakeView[];
  collaboration: OpsPilotCollaborationView | null;
  checks: OpsPilotCheckView[];
  readiness: PilotReadinessView;
};

export type OpsPilotRunView = {
  id: string;
  name: string;
  status: PilotRunStatus;
  revision: number;
  dataClassification: 'synthetic' | 'real';
  candidateReleaseSha: string;
  environmentOrigin: string;
  acceptanceStartedAt: string | null;
  minimumPublishedGuides: number;
  participationNoticeVersion: string | null;
  privacyNoticeVersion: string | null;
  contentConsentVersion: string | null;
};

export type OpsPilotParticipantView = {
  id: string;
  role: PilotRole;
  cohortRole: PilotCohortRole;
  displayLabel: string;
  status: 'invited' | 'joined' | 'active' | 'paused' | 'withdrawn' | 'completed';
  userLinked: boolean;
  consentAccepted: boolean;
  revision: number;
};

export type OpsPilotContentIntakeView = {
  id: string;
  creatorParticipantId: string;
  guideId: string | null;
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'published' | 'withdrawn';
  guideDraftRevision: number | null;
  reviewedGuideVersion: number | null;
  contentDigest: string | null;
  title: string;
  destination: string;
  authoredLocale: string;
  revision: number;
};

export type OpsPilotCollaborationView = {
  id: string;
  merchantParticipantId: string;
  creatorParticipantId: string;
  missionId: string | null;
  steps: Array<{ code: string; status: PilotCheckStatus }>;
};

export type OpsPilotCheckView = {
  code: string;
  category: string;
  status: PilotCheckStatus;
  evidenceReference: string | null;
  observedSummary: string | null;
  revision: number;
  derived: boolean;
};

export type PilotReadinessView = {
  stage: PilotReadinessStage;
  readyToBegin: boolean;
  executionComplete: boolean;
  blockers: Array<{
    code: string;
    category: string;
    messageKey: string;
    recordId?: string;
  }>;
};

export type PilotSelfSnapshot = {
  run: PilotSelfRunView | null;
  participant: PilotSelfParticipantView | null;
  nextStep: PilotParticipantNextStep | null;
  readiness: PilotReadinessView;
};

export type PilotSelfRunView = {
  id: string;
  name: string;
  status: PilotRunStatus;
};

export type PilotSelfParticipantView = {
  id: string;
  role: PilotRole;
  status: 'joined' | 'active' | 'paused' | 'withdrawn' | 'completed';
  consentVersion: string | null;
};

export type PilotParticipantNextStep = {
  code: string;
  href: string | null;
  messageKey: string;
};

export type PilotContentIntakeInput = {
  title: string;
  destination: string;
  authoredLocale: string;
  sourceSummary: string;
  sourceUrls: string[];
  rightsBasis: 'original' | 'licence' | 'permission';
  rightsEvidenceReference: string;
  authorConsentVersion: string;
  coverRightsConfirmed: boolean | null;
  coverRightsEvidenceReference: string | null;
};

export type OpsPilotMutationResult = {
  snapshot: OpsPilotSnapshot;
  inviteCode?: string;
};

export type PilotParticipantMutationResult = {
  snapshot: PilotSelfSnapshot;
};

export type PilotMetricAction =
  | 'pilot.run.created'
  | 'pilot.run.configured'
  | 'pilot.run.status_changed'
  | 'pilot.invite.created'
  | 'pilot.participant.joined'
  | 'pilot.participant.status_changed'
  | 'pilot.consent.accepted'
  | 'pilot.content.submitted'
  | 'pilot.content.reviewed'
  | 'pilot.content.published'
  | 'pilot.guide.bound'
  | 'pilot.collaboration.bound'
  | 'pilot.evidence.added'
  | 'pilot.notification.acknowledged'
  | 'pilot.support.acknowledged'
  | 'pilot.check.changed';

export type PilotMetricIdentifiers = {
  runId: string;
  participantId?: string;
  contentIntakeId?: string;
  checkCode?: string;
  status?: string;
};

export type PilotExportSummary = {
  schemaVersion: 1;
  exportedAt: string;
  run: {
    id: string;
    status: PilotRunStatus;
    dataClassification: 'synthetic' | 'real';
    candidateReleaseSha: string;
  } | null;
  readiness: PilotReadinessView;
  checks: Array<{
    code: string;
    status: PilotCheckStatus;
    derived: boolean;
    evidenceReference: string | null;
  }>;
};

export type PilotEvidenceEntityType =
  | 'guide'
  | 'trip'
  | 'mission'
  | 'mission_participant'
  | 'mission_submission'
  | 'notification'
  | 'support_case';

export function parseOpsPilotCommand(input: unknown): OpsPilotCommand;
export function parsePilotParticipantCommand(input: unknown): PilotParticipantCommand;
export function pilotExportSummary(snapshot: OpsPilotSnapshot): PilotExportSummary;
```

---

### Task 1: Strict Pilot Command Contracts

**Files:**
- Create: `apps/journeys/lib/contracts/pilot.ts`
- Create: `apps/journeys/tests/pilot-contracts.test.mjs`

**Interfaces:**
- Consumes: existing `uuid`/record validation conventions in `apps/journeys/lib/api/validation.ts`.
- Produces: all shared types above plus `parseOpsPilotCommand(input: unknown): OpsPilotCommand` and `parsePilotParticipantCommand(input: unknown): PilotParticipantCommand`.

- [ ] **Step 1: Write failing parser tests**

Assert that both parsers:

- accept every exact command variant;
- reject unknown keys, unknown command names, duplicate/invalid UUIDs, oversized text, non-HTTP source URLs, invalid statuses and missing reasons;
- reject `createRun` for `real` data without a lowercase 40-character commit SHA and HTTPS origin;
- reject real `running` configuration without three immutable notice versions,
  named owner references, a private channel reference and a passing synthetic
  rehearsal from the same release;
- reject an invite lifetime outside `1..168` hours;
- reject manual `pass` without evidence or observed summary; and
- reject participant commands containing `userId`, `runId`, decision, approval, role or evidence fields.

- [ ] **Step 2: Run parser tests to verify failure**

Run: `node --experimental-strip-types --test tests/pilot-contracts.test.mjs`

Expected: FAIL because the module and parser functions do not exist.

- [ ] **Step 3: Implement the exported types and strict parsers**

Use the existing `object`, `uuid`, `text` and URL validation helpers where their semantics fit. Return normalized values. Apply field-specific limits from the design. Do not use TypeScript assertions alone; runtime validation is required.

- [ ] **Step 4: Run parser tests to verify pass**

Run: `node --experimental-strip-types --test tests/pilot-contracts.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/journeys/lib/contracts/pilot.ts apps/journeys/tests/pilot-contracts.test.mjs
git commit -m "feat(pilot): define strict command contracts"
```

---

### Task 2: Pure Readiness, Evidence and Approval Rules

**Files:**
- Create: `apps/journeys/lib/pilot/readiness.ts`
- Modify: `apps/journeys/tests/pilot-contracts.test.mjs`

**Interfaces:**
- Consumes: types from Task 1.
- Produces:

```ts
export type PilotBeginReadinessInput = {
  run: OpsPilotRunView;
  capabilityConnected: boolean;
  ownersConfigured: boolean;
  noticesPinned: boolean;
  syntheticRehearsalPassed: boolean;
};

export type PilotExecutionReadinessInput = Omit<OpsPilotSnapshot, 'readiness'>;

export type PilotPublishEligibilityInput = {
  pilotLinked: boolean;
  runStatus: PilotRunStatus;
  intakeStatus: OpsPilotContentIntakeView['status'] | null;
  approvedDraftRevision: number | null;
  approvedContentDigest: string | null;
  currentDraftRevision: number | null;
  currentContentDigest: string | null;
  publishedVersion: number | null;
  creatorIsActive: boolean;
  guideIsWithdrawn: boolean;
};

export type PilotPublishBlockReason =
  | 'run_not_running'
  | 'intake_not_approved'
  | 'revision_changed'
  | 'digest_changed'
  | 'creator_inactive'
  | 'guide_withdrawn';

export function pilotBeginReadiness(input: PilotBeginReadinessInput): PilotReadinessView;
export function pilotExecutionReadiness(input: PilotExecutionReadinessInput): PilotReadinessView;
export function pilotCanPublish(
  input: PilotPublishEligibilityInput,
): { allowed: true } | { allowed: false; reason: PilotPublishBlockReason };
export function pilotEvidenceEligible(
  capturedAt: string,
  acceptanceStartedAt: string | null,
  runStatus: PilotRunStatus,
): boolean;
export function pilotExportSummary(snapshot: OpsPilotSnapshot): PilotExportSummary;
```

`PilotReadinessView` must include `readyToBegin`, `executionComplete`, `stage` and ordered blockers with stable `code`, bilingual `messageKey` and optional record ID.

- [ ] **Step 1: Add failing readiness tests**

Cover:

- setup is incomplete without source, release, owners, immutable notices or synthetic rehearsal;
- `readyToBegin` is separate from `executionComplete`;
- one missing required role blocks;
- duplicate Auth users block;
- pre-start evidence does not count;
- paused/completed/cancelled statuses never accept manual evidence changes;
- an exact reviewed guide revision/digest passes;
- a changed digest, later draft revision, wrong creator, withdrawal or wrong published version blocks;
- an initial revision request does not pass, while a later approved submission does; and
- exact `submission.approved` notification for the bound mission is required;
  and
- export omits participant display labels, invitation material, trip/support
  text, private evidence bodies and contact fields.

- [ ] **Step 2: Run tests to verify failure**

Run: `node --experimental-strip-types --test tests/pilot-contracts.test.mjs`

Expected: FAIL because the readiness module is absent.

- [ ] **Step 3: Implement pure readiness functions**

No network, database or React imports. Preserve stable blocker ordering and never map unknown/null state to success.

- [ ] **Step 4: Run tests to verify pass**

Run: `node --experimental-strip-types --test tests/pilot-contracts.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/journeys/lib/pilot/readiness.ts apps/journeys/tests/pilot-contracts.test.mjs
git commit -m "feat(pilot): define readiness and evidence rules"
```

---

### Task 3: Pilot Schema and Database Invariants

**Files:**
- Create: CLI-generated `supabase/migrations/<timestamp>_kinnso_pilot_control_room_schema.sql`
- Create: `apps/journeys/tests/ops-pilot-migration.test.mjs`
- Modify: `apps/journeys/scripts/source-manifest.json`

**Interfaces:**
- Consumes: current production ledger head `20261107020000`; existing `kinnso_internal` and RLS conventions.
- Produces: `pilot_runs`, `pilot_participants`, `pilot_invites`, `pilot_content_intakes`, `pilot_collaborations`, `pilot_checks` and `pilot_evidence`.

- [ ] **Step 1: Generate the migration with the confirmed CLI**

Run from `apps/journeys` only after confirming the linked local project is not production:

```bash
npx supabase migration new kinnso_pilot_control_room_schema
```

Record the generated file as `PILOT_SCHEMA_MIGRATION` in the task commit message.

- [ ] **Step 2: Write failing migration-contract tests**

The test reads `PILOT_SCHEMA_MIGRATION` and asserts:

- all seven tables are in `kinnso_internal`;
- RLS is enabled on each;
- default/direct privileges are revoked;
- one-active-run partial uniqueness exists;
- required participant-slot roles are constrained, with replacement allowed by
  uniqueness over non-withdrawn slots;
- foreign keys have indexes;
- invite hashes, revisions, notice versions, release SHA, data classification and timestamp columns exist;
- source URL/cover-rights/content-digest constraints exist; and
- no raw invitation/token/password column exists.

Run: `node --experimental-strip-types --test tests/ops-pilot-migration.test.mjs`

Expected: FAIL until the schema is written.

- [ ] **Step 3: Implement the schema migration**

Use typed UUID/text/timestamps, explicit check constraints and existing project naming patterns. Add comments documenting the one-active-run, exact-digest and no-private-content invariants. Do not add triggers for business transitions; RPCs will own them.

- [ ] **Step 4: Apply to an isolated local database and inspect constraints**

Run the repository's owned isolated Supabase reset/profile, then:

```bash
npx supabase migration list --local
npx supabase db advisors --local
```

Expected: the new migration is applied once, advisors show no new security findings, and direct `authenticated` access to pilot tables is denied.

- [ ] **Step 5: Run migration-contract tests**

Run: `node --experimental-strip-types --test tests/ops-pilot-migration.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/$PILOT_SCHEMA_MIGRATION apps/journeys/tests/ops-pilot-migration.test.mjs apps/journeys/scripts/source-manifest.json
git commit -m "feat(pilot): add control-room schema"
```

---

### Task 4: Audited Operations and Participant RPCs

**Files:**
- Create: CLI-generated `supabase/migrations/<timestamp>_kinnso_pilot_control_room_rpcs.sql`
- Modify: `apps/journeys/tests/ops-pilot-migration.test.mjs`
- Create: `apps/journeys/tests/integration/pilot-control-room.test.mjs`
- Modify: `apps/journeys/scripts/source-manifest.json`

**Interfaces:**
- Consumes: Task 3 tables; `kinnso_internal.actor()`, `kinnso_internal.requests`, `ops_audit_log_append`, active-ops helpers.
- Produces:

```sql
get_kinnso_ops_pilot(p_run_id uuid) returns jsonb
admin_apply_kinnso_pilot_command(p_request_id uuid, p_command jsonb) returns jsonb
get_kinnso_pilot_self() returns jsonb
apply_kinnso_pilot_participant_command(p_request_id uuid, p_command jsonb) returns jsonb
```

- [ ] **Step 1: Generate the RPC migration**

Run:

```bash
npx supabase migration new kinnso_pilot_control_room_rpcs
```

Record it as `PILOT_RPC_MIGRATION`.

- [ ] **Step 2: Add failing isolated integration tests**

Tests use the ownership-verified isolated target and cover:

- moderator can read, cannot mutate;
- admin/owner can mutate;
- suspended/expired session returns no private data;
- an idempotent retry returns the original result;
- reusing a request ID with a different digest fails;
- concurrent claims on one code produce one winner;
- revoked/expired/consumed claims fail;
- `real` run cannot be `running` without notices/owners/release/synthetic rehearsal;
- participating release, environment data classification and accepted notice
  versions are immutable after enrollment;
- one required traveller/creator/merchant slot and distinct users;
- a withdrawn required slot can be replaced without inheriting user/evidence;
- participant cannot read another slot;
- pause blocks claims, intake/acknowledgement commands, manual evidence and pilot-linked publish;
- content approval stores exact revision/digest;
- post-approval content changes invalidate it;
- manual `pass` requires in-window evidence;
- direct internal-table writes are denied;
- all successful mutations create one audit event;
- withdrawal retains history but removes readiness; and
- cross-run guide/mission/support references fail.

- [ ] **Step 3: Run integration tests to verify failure**

With `.env.test` pointed only at the approved isolated target:

```bash
node --experimental-strip-types --test tests/integration/pilot-control-room.test.mjs
```

Expected: FAIL because the RPCs are absent.

- [ ] **Step 4: Implement the RPC migration**

Use one transaction per command. Lock the narrow target row, validate current actor/role/session, compute a command digest including the action name, reserve/read the request receipt, apply the transition, append one redacted audit event and persist/return the result.

Ensure:

- operation/admin checks come from current database rows;
- raw invite codes are returned only for first `createInvite`;
- raw invite codes are not put in request results, receipts, audit or list APIs;
- participant and operations commands reject unknown keys/actions;
- participant commands never accept actor/user/role/run identifiers;
- run transitions reject impossible states;
- derived checks are never manually writable; and
- support/trip projections expose only authorized status references.

- [ ] **Step 5: Add and test the pilot-aware publish RPC**

In `PILOT_RPC_MIGRATION`, add:

```sql
publish_kinnso_pilot_guide_draft(
  p_draft_id uuid,
  p_expected_revision integer,
  p_request_id uuid
) returns jsonb
```

It delegates to existing `publish_kinnso_guide_draft` only when:

- no intake is linked; or
- the linked intake is approved for that exact draft revision/digest and the run is `running`.

On success, atomically link the published version and mark the intake `published`.

- [ ] **Step 6: Run focused DB tests**

Run:

```bash
node --experimental-strip-types --test tests/integration/pilot-control-room.test.mjs tests/ops-pilot-migration.test.mjs
```

Expected: PASS with no residual test records after cleanup.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/$PILOT_RPC_MIGRATION apps/journeys/tests/integration/pilot-control-room.test.mjs apps/journeys/tests/ops-pilot-migration.test.mjs apps/journeys/scripts/source-manifest.json
git commit -m "feat(pilot): add audited pilot RPCs"
```

---

### Task 5: API Repository and Operations BFF

**Files:**
- Create: `apps/journeys/lib/pilot/repository.ts`
- Create: `apps/journeys/lib/pilot/telemetry.ts`
- Create: `apps/journeys/app/api/ops/pilot/route.ts`
- Create: `apps/journeys/tests/pilot-routes.test.mjs`

**Interfaces:**
- Consumes: Task 1 commands and Task 4 RPCs.
- Produces:

```ts
export const opsPilot: {
  get(runId?: string): Promise<ApiResult<OpsPilotSnapshot>>;
  command(command: OpsPilotCommand): Promise<ApiResult<OpsPilotMutationResult>>;
};

export function emitPilotMetric(
  action: PilotMetricAction,
  ids: PilotMetricIdentifiers,
): Promise<void>;
```

- [ ] **Step 1: Write failing route tests**

Assert:

- GET accepts only one optional valid `runId`;
- POST accepts exactly one body object and a valid command;
- both use `apiContext(request, 'pilot', true/false)`;
- all responses use the existing `{ ok, data }`/failure contract;
- unknown fields and oversized bodies return 400;
- 401/403 clear no data;
- 409 surfaces revision conflict; and
- 503 remains retryable without changing the request ID;
- successful operations emit one allowlisted aggregate event; and
- identifiers/free text outside the event allowlist cannot enter telemetry,
  and telemetry failure cannot alter the command result.

- [ ] **Step 2: Run tests to verify failure**

Run: `node --experimental-strip-types --test tests/pilot-routes.test.mjs`

Expected: FAIL because the route/repository are absent.

- [ ] **Step 3: Implement repository and operations route**

Use `boundedBody`, `sameOrigin`, `apiContext`, `backendFailure` and `reply`. GET is read-only; POST calls `admin_apply_kinnso_pilot_command`. Emit the matching allowlisted operation event (`run.created`, `run.configured`, `run.status_changed`, `invite.created`, `participant.status_changed`, `content.reviewed`, `guide.bound`, `collaboration.bound`, `evidence.added` or `check.changed`) only after a confirmed result, using IDs/statuses only. Telemetry failure cannot alter the response. Do not add ad hoc authorization in the route beyond the common capability/session gate.

- [ ] **Step 4: Run route tests**

Run: `node --experimental-strip-types --test tests/pilot-routes.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/journeys/lib/pilot/repository.ts apps/journeys/lib/pilot/telemetry.ts apps/journeys/app/api/ops/pilot/route.ts apps/journeys/tests/pilot-routes.test.mjs
git commit -m "feat(pilot): add operations pilot API"
```

---

### Task 6: Participant BFF and Publish-Route Integration

**Files:**
- Modify: `apps/journeys/lib/pilot/repository.ts`
- Create: `apps/journeys/app/api/pilot/route.ts`
- Modify: `apps/journeys/app/api/creator/guides/[id]/publish/route.ts:4`
- Modify: `apps/journeys/tests/pilot-routes.test.mjs`
- Modify: `apps/journeys/tests/creator-editor.test.mjs`

**Interfaces:**
- Consumes: Task 4 participant RPC and pilot-aware publish RPC.
- Produces:

```ts
export const pilot: {
  get(): Promise<ApiResult<PilotSelfSnapshot>>;
  command(command: PilotParticipantCommand): Promise<ApiResult<PilotParticipantMutationResult>>;
};
```

The guide publish route calls `publish_kinnso_pilot_guide_draft` instead of `publish_kinnso_guide_draft`.

- [ ] **Step 1: Add failing route and editor tests**

Cover:

- `/api/pilot` rejects actor/user/run identifiers;
- wrong, expired, claimed and revoked codes return the same safe not-found/invalid class;
- participant PUT/PATCH methods are not exported;
- a pilot-linked unapproved guide returns explicit `PILOT_REVIEW_REQUIRED`;
- an exact approved guide publishes;
- a changed draft after approval returns the review-required code;
- ordinary non-pilot guide publishing still succeeds; and
- a failed pilot publish preserves the existing creator draft and idempotent retry UI.
- successful participant commands emit exactly one allowlisted aggregate event
  with no code, email, free text or private record content.
- a confirmed pilot guide publication emits `pilot.content.published`;
  non-pilot publication emits no pilot event.

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
node --experimental-strip-types --test tests/pilot-routes.test.mjs tests/creator-editor.test.mjs
```

Expected: FAIL.

- [ ] **Step 3: Implement participant route and publish switch**

Use the same request conventions as Task 5. Emit `pilot.participant.joined`,
`pilot.consent.accepted`, `pilot.content.submitted`,
`pilot.notification.acknowledged` or `pilot.support.acknowledged` only after a
confirmed result and only with allowlisted IDs/statuses. Add
`PILOT_REVIEW_REQUIRED` to the shared error vocabulary and editor messages. Do
not pre-check only in React; the database RPC is the authority.

- [ ] **Step 4: Run tests to verify pass**

Run:

```bash
node --experimental-strip-types --test tests/pilot-routes.test.mjs tests/creator-editor.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/journeys/lib/pilot/repository.ts apps/journeys/app/api/pilot/route.ts apps/journeys/app/api/creator/guides/[id]/publish/route.ts apps/journeys/tests/pilot-routes.test.mjs apps/journeys/tests/creator-editor.test.mjs
git commit -m "feat(pilot): enforce participant and publish boundaries"
```

---

### Task 7: Operations Pilot Control Room UI

**Files:**
- Create: `apps/journeys/app/travel/pilot/PilotControlRoom.tsx`
- Create: `apps/journeys/app/travel/pilot/PilotParticipants.tsx`
- Create: `apps/journeys/app/travel/pilot/PilotContentReview.tsx`
- Create: `apps/journeys/app/travel/pilot/PilotChecks.tsx`
- Modify: `apps/journeys/app/travel/OpsWorkspace.tsx:11`
- Modify: `apps/journeys/app/travel/OpsDashboardWorkspace.tsx:18`
- Create: `apps/journeys/tests/pilot-control-room-ui.test.mjs`

**Interfaces:**
- Consumes: `opsPilot.get()` and `opsPilot.command()` from Task 5.
- Produces: `PilotControlRoom({actorId, enabled, runId})`.

- [ ] **Step 1: Write failing component tests**

Cover:

- no signed-in user shows sign-in;
- non-ops access shows denial;
- moderator gets read-only controls;
- admin can create/configure/status participant/content/check commands;
- setup, ready-to-begin, executing, execution-complete, completed and blocked are distinct;
- blockers name the missing record and do not show zero;
- one-time code is visible once with copy fallback, then replaced with “cannot be retrieved; rotate”;
- content approve requires exact revision/digest and written reason;
- internal checks have no editable pass control;
- private trip/support contents are never rendered;
- acceptance-summary export contains only run IDs, statuses, timestamps and
  evidence references, with no invitation code, participant identity, trip
  text, support text or external contact;
- confirmation dialogs return focus; and
- 320px markup uses no fixed-width table that exceeds the viewport.

- [ ] **Step 2: Run tests to verify failure**

Run: `node --experimental-strip-types --test tests/pilot-control-room-ui.test.mjs`

Expected: FAIL.

- [ ] **Step 3: Implement the operations workspace**

Keep `OpsWorkspace` as the route coordinator. Add `pilot` to the dashboard views and render `PilotControlRoom` before the generic `OpsDashboardWorkspace` payload renderer. Keep components focused; do not append the whole workflow to `OpsWorkspace.tsx`.

Use existing `useApp`, `k-page`, `k-card`, `k-btn`, status/alert and modal patterns. Every mutation retains its exact command object and request ID until confirmed.

Generate the acceptance summary from `OpsPilotSnapshot` through a pure
`pilotExportSummary(snapshot)` helper. Use a downloadable JSON blob and visible
confirmation; do not include any field not explicitly allowlisted in the spec.

- [ ] **Step 4: Run tests and typecheck**

Run:

```bash
node --experimental-strip-types --test tests/pilot-control-room-ui.test.mjs
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/journeys/app/travel/pilot apps/journeys/app/travel/OpsWorkspace.tsx apps/journeys/app/travel/OpsDashboardWorkspace.tsx apps/journeys/tests/pilot-control-room-ui.test.mjs
git commit -m "feat(pilot): add operations control room"
```

---

### Task 8: Participant Onboarding, Consent and Content Intake UI

**Files:**
- Create: `apps/journeys/app/travel/pilot/PilotWorkspace.tsx`
- Create: `apps/journeys/app/travel/pilot/PilotContentIntakeForm.tsx`
- Create: `apps/journeys/tests/pilot-participant-ui.test.mjs`

**Interfaces:**
- Consumes: `pilot.get()`/`pilot.command()` from Task 6 and Task 1 commands.
- Produces: `PilotWorkspace({actorId, enabled})`.

- [ ] **Step 1: Write failing participant UI tests**

Cover:

- no slot shows a safe unavailable state;
- invitation code uses password-style masking but supports paste, and is submitted only in POST body;
- wrong/expired/claimed code provides no other participant details;
- consent shows exact version/digest before acceptance;
- creator can submit/revise only their own intake while draft/rejected;
- approved/published intake becomes read-only except a new revision flow;
- merchant/traveller see role-specific canonical task links only;
- unknown requests retain payload and show “retry same request”;
- revoked account/session removes private data immediately;
- one-time code is cleared from state after claim; and
- EN/zh-HK and 320px/200% content remain readable.

- [ ] **Step 2: Run tests to verify failure**

Run: `node --experimental-strip-types --test tests/pilot-participant-ui.test.mjs`

Expected: FAIL.

- [ ] **Step 3: Implement participant workspace**

Use controlled forms and the existing account-invalidation subscription/recovery pattern. Keep the invitation code out of URL/localStorage and clear it immediately after submission. Link participants to native `/studio`, `/merchant`, `/g/:id`, `/trips/:id` and `/support` flows.

Do not add generic public application forms or duplicate the guide editor.

- [ ] **Step 4: Run tests and typecheck**

Run:

```bash
node --experimental-strip-types --test tests/pilot-participant-ui.test.mjs
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/journeys/app/travel/pilot/PilotWorkspace.tsx apps/journeys/app/travel/pilot/PilotContentIntakeForm.tsx apps/journeys/tests/pilot-participant-ui.test.mjs
git commit -m "feat(pilot): add participant onboarding"
```

---

### Task 9: Capability and Route Integration

**Files:**
- Modify: `apps/journeys/lib/contracts/capabilities.ts:74`
- Modify: `apps/journeys/app/[locale]/[[...route]]/page.tsx:102`
- Modify: `apps/journeys/app/travel/Workbench.tsx:257`
- Modify: `apps/journeys/tests/capabilities.test.mjs`
- Modify: `apps/journeys/tests/consolidated-origin-navigation.test.mjs`
- Modify: `apps/journeys/scripts/source-manifest.json`

**Interfaces:**
- Consumes: `PilotWorkspace` and operations UI.
- Produces: canonical `/{locale}/pilot` and `/{locale}/ops?view=pilot` routes behind `pilot` capability.

- [ ] **Step 1: Add failing capability/navigation tests**

Assert:

- `pilot` is unavailable without the feature name;
- `pilot` is connected when enabled and backend configuration exists;
- `/en/pilot` and `/zh-HK/pilot` render the participant route;
- `/en/ops?view=pilot` renders the operations route;
- no pilot nav appears for ordinary participants;
- no old `remix-kinnso-web` link appears;
- disabled pilot route gives an honest service-not-connected state; and
- unknown `/pilot/*` paths return 404 rather than falling through to support.

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
node --experimental-strip-types --test tests/capabilities.test.mjs tests/consolidated-origin-navigation.test.mjs
```

Expected: FAIL.

- [ ] **Step 3: Wire the capability and routes**

Add `pilot` to the capabilities array. Pass it into both Workbench feature maps. Add `pilot` to the allowed connected paths and render `PilotWorkspace` only for exact `path==='pilot'`. Route `ops?view=pilot` through the operations control room. Add no public header link.

- [ ] **Step 4: Run tests and typecheck**

Run:

```bash
node --experimental-strip-types --test tests/capabilities.test.mjs tests/consolidated-origin-navigation.test.mjs
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/journeys/lib/contracts/capabilities.ts apps/journeys/app/[locale]/[[...route]]/page.tsx apps/journeys/app/travel/Workbench.tsx apps/journeys/tests/capabilities.test.mjs apps/journeys/tests/consolidated-origin-navigation.test.mjs apps/journeys/scripts/source-manifest.json
git commit -m "feat(pilot): connect canonical pilot routes"
```

---

### Task 10: Connected End-to-End and Security Acceptance

**Files:**
- Create: `apps/journeys/tests/e2e/u26-pilot-control-room.spec.ts`
- Modify: `apps/journeys/tests/integration/pilot-control-room.test.mjs`
- Modify: `apps/journeys/scripts/source-manifest.json`

**Interfaces:**
- Consumes: all previous tasks.
- Produces: browser and database evidence for the approved design.

- [ ] **Step 1: Add the connected browser journey**

Use isolated synthetic accounts and exact garbage-collected fixtures. The test must perform:

1. administrator creates a run and participant slots;
2. each account claims and consents once;
3. creator submits three rights intakes and publishes approved revisions;
4. merchant publishes a campaign;
5. administrator binds the campaign and creator;
6. creator applies, submits, receives revision, resubmits and receives approval;
7. creator observes the exact `submission.approved` notification;
8. traveller discovers and saves the exact guide, adopts it into a trip, records recovery evidence and creates the scoped support case;
9. administrator records external/manual checks and completes the run; and
10. export contains only references/statuses, no private content or invitation code.

Add negative cases for duplicate claim, paused run, expired/revoked session, suspension mid-flow, wrong record IDs, source/digest drift and direct authenticated table writes.

- [ ] **Step 2: Run the connected suite to expose failures**

Run only against the approved isolated test target:

```bash
npx playwright test --config=playwright.connected.config.ts tests/e2e/u26-pilot-control-room.spec.ts
node --experimental-strip-types --test tests/integration/pilot-control-room.test.mjs
```

Expected: first run identifies any missing interface or state transition. Preserve the failing output; do not point `.env.test` at production.

- [ ] **Step 3: Fix failures within this task’s owned pilot files**

Fix only reproducible pilot flows, authorization boundaries, validation or accessibility behavior. If a failure reveals an unrelated existing workflow defect, add a focused failing test and isolate the fix; do not weaken this suite.

- [ ] **Step 4: Re-run the connected suite**

Run the two commands from Step 2 plus:

```bash
npx playwright test --config=playwright.connected.config.ts tests/e2e/u26-ops-content-admin.spec.ts tests/e2e/u06-role-bundle.spec.ts
```

Expected: PASS with no residual pilot users, invites, runs, guides, campaigns, submissions, notifications, support cases, trips or audit rows.

- [ ] **Step 5: Commit**

```bash
git add apps/journeys/tests/e2e/u26-pilot-control-room.spec.ts apps/journeys/tests/integration/pilot-control-room.test.mjs apps/journeys/scripts/source-manifest.json
git commit -m "test(pilot): verify complete controlled journey"
```

---

### Task 11: Full Regression, Accessibility and Release Packet

**Files:**
- Create: `docs/implementation/PILOT_CONTROL_ROOM_RELEASE_2026-11-07.md`
- Create: `docs/implementation/PILOT_CONTROL_ROOM_RELEASE_2026-11-07.json`
- Modify: `apps/journeys/scripts/source-manifest.json`

**Interfaces:**
- Consumes: verified source, migrations, RPCs and browser evidence.
- Produces: exact disposable release envelope and user-review packet.

- [ ] **Step 1: Run full Journeys verification**

From `apps/journeys`:

```bash
npm test
npm run typecheck
npm run build
python -m unittest tests.source_package_test
```

Expected: all applicable checks pass; preserve any expected Windows-only skip. A failure is fixed before continuing.

- [ ] **Step 2: Run migration and security gates**

On the isolated database:

```bash
npx supabase migration list --local
npx supabase db advisors --local
node --experimental-strip-types --test tests/integration/pilot-control-room.test.mjs
```

Expected: exact ledger includes both pilot migrations once; no new advisor finding; RLS/RLS/function-ownership tests pass.

- [ ] **Step 3: Run connected browser matrix**

Run the new pilot journey plus existing creator, merchant, operations, support, recovery and public accessibility suites. Record exact counts; do not aggregate historical results into the new run.

- [ ] **Step 4: Write the release envelope**

Include:

- source SHA/tree SHA and branch;
- candidate migration names/hashes/envelope hash;
- capability list with `pilot` excluded from production until approval;
- exact isolated target and schema head;
- unit, TypeScript, build, source package, migration, RLS, browser and accessibility counts;
- known skipped/blocked items;
- rollback deployment ID;
- explicit statement that no production change, participant message, deployment or capability activation occurred;
- data-retention/privacy dependency and physical-device gates;
- exact next actions requiring user approval.

- [ ] **Step 5: Self-review the release against the spec**

Confirm every design section maps to a task/test and the packet contains no private content, raw invite code, support message, trip text, credentials or secrets.

- [ ] **Step 6: Commit**

```bash
git add docs/implementation/PILOT_CONTROL_ROOM_RELEASE_2026-11-07.md docs/implementation/PILOT_CONTROL_ROOM_RELEASE_2026-11-07.json apps/journeys/scripts/source-manifest.json
git commit -m "docs(pilot): prepare controlled pilot release"
```

---

## Final Whole-Suite Verification

Before presenting the branch:

```bash
git status --short
git diff --check
git log --oneline --decorate -15
```

Require:

- clean tracked and untracked state after all evidence is committed;
- all pilot commands reject malformed/foreign input;
- all private reads are participant/action scoped;
- exact content/version/digest and run window are enforced in the database;
- no pilot capability is enabled in production;
- no external message, provider, payment, upload or paid AI action exists;
- no direct wallet, settlement, booking or episode of private trip/support content enters the control room;
- release packet matches the exact source and migration bytes; and
- the public-launch decision remains `HOLD` until the explicitly external gates pass.

## Approval Boundary

This plan authorizes implementation in an isolated worktree and test environment after the user selects an execution method.

It does not authorize:

- pushing the implementation branch;
- applying either migration to production;
- deploying the application;
- adding `pilot` to production capabilities;
- generating real invitation codes;
- contacting real participants;
- enabling media, AI, offers/redemptions, booking, payments or payouts; or
- declaring public launch readiness.
