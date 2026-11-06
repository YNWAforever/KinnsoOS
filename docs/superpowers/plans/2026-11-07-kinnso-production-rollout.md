# Kinnso Production Database and Application Rollout Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the exact five reviewed database migrations to Kinnso production, stage and verify source commit `950d08b2011f1c23265a193b8f7adc377a44eb26`, then promote it only if every database and application check passes.

**Architecture:** The production application stays on the currently served deployment while the database transactions commit first. This is compatible because commit `42be3ce4c7207b6ec11ec8c4bd85a5feaa6588ef` does not use the operations table-write paths revoked by the fifth migration. The new application is then deployed as an unaliased production-targeted build, tested through Vercel’s protected access path, and promoted atomically. The current production deployment is retained as the application rollback target.

**Tech Stack:** GitHub, Vercel CLI, Next.js 16.3.8 on Node 26, PostgreSQL 17, Supabase PostgREST, `psql`, repository migration guards.

**Spec:** `docs/implementation/PRODUCTION_DB_ENVELOPE_2026-11-07.json`

## Global Constraints

- Production is unchanged until the user explicitly approves the exact scope below.
- Apply exactly five SQL files in the order fixed by the envelope.
- Do not replay `20261104195741_active_merchant_mission_writes.sql`; production represents it with the reviewed `20261105123750` envelope.
- Preserve production-only migrations `20261025140000` and `20261105123750`.
- Use one database transaction, one advisory lock, and no automatic retry.
- Any uncertain client outcome requires read-only reconciliation and a forward fix, never a replay.
- Keep paid AI, uploads/media, affiliate execution, offers/redemptions, booking, payments and payouts disabled.
- Keep `kinnso-os.vercel.app` on the current deployment until the staged candidate passes all checks.
- Record `dpl_8fVAPaBpULzeF4WCg8s2CHQ2V2Cs` as the application rollback target.
- Backup and restore are explicitly waived; do not claim rollback-to-point-in-time recovery.
- Physical iOS/Android and actual VoiceOver/NVDA remain separate launch gates and are not performed by this rollout.

## Review Focus

- **Changed baseline:** if production's ledger or security objects differ from the envelope before execution, abort before the first write.
- **Mixed migration history:** the production-only reviewed envelopes must remain present and must not be recreated from repository filenames.
- **Unknown commit outcome:** a lost psql acknowledgement must never trigger an automatic second transaction.
- **Database-first compatibility:** the old app must stop receiving operations table writes before migration 204; verify that assumption remains true.
- **Application rollback after policy hardening:** rolling back only the app must retain the additive hardened database and must not silently restore permissive policies.

---

### Task 1: Freeze and re-verify local artifacts

**Files:**
- Read: `docs/implementation/PRODUCTION_DB_ENVELOPE_2026-11-07.json`
- Read: the five named files under `supabase/migrations/`
- Read: `apps/journeys/public/source/kinnsoos-source.zip`
- Test: `tooling-tests/migration-release.test.mjs`

**Interfaces:**
- Consumes: approved source commit, five migration files and source archive.
- Produces: a local candidate with envelope SHA-256 `33897aba413aaf1a6344176ff6a8e4f56316d7f441cdb6feb89a1fa001cbdb40`.

- [ ] **Step 1: Verify the exact source worktree and commits**

Run:

```powershell
git rev-parse HEAD
git status --porcelain
```

Expected: HEAD is `950d08b2011f1c23265a193b8f7adc377a44eb26`; status is empty.

- [ ] **Step 2: Verify the source archive**

Run:

```powershell
Get-FileHash apps/journeys/public/source/kinnsoos-source.zip -Algorithm SHA256
```

Expected: `C3AAC23FF7FF4228E9261B5C99C6684B7F3DD65E9A4C1B5AF593C229873CA2F8`; embedded revision is `950d08b…`, `dirty=false`.

- [ ] **Step 3: Re-freeze the five files**

Run the repository `freezeCandidate()` guard with the manifest from the envelope.

Expected: five files, 49,250 SQL bytes, envelope SHA-256 `33897aba413aaf1a6344176ff6a8e4f56316d7f441cdb6feb89a1fa001cbdb40`.

- [ ] **Step 4: Run guard tests**

Run:

```powershell
node --test tooling-tests/migration-release.test.mjs
```

Expected: PASS; transaction controls, approval scope, stale catalog, replay and recovery-negative cases remain green.

### Task 2: Capture current production and create the exclusive claim

**Files:**
- Read: Vercel production deployment `dpl_8fVAPaBpULzeF4WCg8s2CHQ2V2Cs`
- Read: Supabase project `scryfkefedzuetfdtrvl`
- Create: private execution claim outside the repository

**Interfaces:**
- Consumes: approved envelope and current provider state.
- Produces: fresh baseline receipt and exclusive execution claim.

- [ ] **Step 1: Confirm current deployment and rollback state**

Run:

```powershell
vercel inspect kinnso-os.vercel.app --non-interactive --format=json
vercel rollback status kinnso-os --non-interactive
```

Expected: production is READY at `dpl_8fVAPaBpULzeF4WCg8s2CHQ2V2Cs`; no rollback is pending.

- [ ] **Step 2: Capture the database baseline within five minutes of apply**

Read only and record:

```sql
select count(*), max(version)
from supabase_migrations.schema_migrations;

select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and policyname in (
    'community_sessions_ops_all',
    'partner_perks_ops_all',
    'testimonials_ops_all'
  );

select has_function_privilege(
  'authenticated',
  'public.ops_audit_log_append(text,uuid,text,text,jsonb)',
  'EXECUTE'
);
```

Expected: ledger `204 / 20261105123750`; all three legacy policies exist; authenticated audit append is `true`; all six content RPCs are absent.

- [ ] **Step 3: Confirm preserved production-only entries**

Run:

```sql
select version, name
from supabase_migrations.schema_migrations
where version in ('20261025140000','20261105123750')
order by version;
```

Expected: exactly `grant_ops_audit_log_select` and `active_merchant_mission_writes_reviewed_envelope`.

- [ ] **Step 4: Persist the claim before any write**

Create one private receipt containing:

```text
envelopeSha256=33897aba413aaf1a6344176ff6a8e4f56316d7f441cdb6feb89a1fa001cbdb40
sourceHead=950d08b2011f1c23265a193b8f7adc377a44eb26
target=scryfkefedzuetfdtrvl
rollbackDeployment=dpl_8fVAPaBpULzeF4WCg8s2CHQ2V2Cs
```

Expected: exclusive create succeeds once. A claim file that already exists is a stop condition.

### Task 3: Apply the five migrations in one transaction

**Files:**
- Apply in order:
  1. `20261106090000_kinnso_public_inventory_suspension.sql`
  2. `20261106110000_fix_redeem_perk_ambiguity.sql`
  3. `20261106123312_harden_ops_team_lifecycle.sql`
  4. `20261106135230_harden_ops_team_security.sql`
  5. `20261107020000_kinnso_ops_content_audit.sql`

**Interfaces:**
- Consumes: frozen candidate and fresh baseline receipt.
- Produces: committed production schema with ledger count 209 and head `20261107020000`.

- [ ] **Step 1: Start one transaction with release guards**

Set:

```sql
BEGIN;
SET LOCAL ROLE postgres;
SET LOCAL search_path = pg_catalog;
SET LOCAL standard_conforming_strings = on;
SET LOCAL lock_timeout = '2000ms';
SET LOCAL statement_timeout = '120000ms';
SELECT pg_advisory_xact_lock(1885432935, 25);
```

Expected: transaction and advisory lock acquire successfully.

- [ ] **Step 2: Re-check the frozen baseline**

Abort and `ROLLBACK` if the count, head, preserved entries, legacy policies, function absence or audit grant differs from Task 2.

- [ ] **Step 3: Execute the five files in the exact order**

Do not terminate, annotate or reorder them.

Expected: all five SQL files complete without error.

- [ ] **Step 4: Write the five migration-ledger entries in the same transaction**

Insert versions and names exactly as listed in the envelope. Use conflict only to detect pre-existing entries; an unexpected pre-existing version aborts the transaction.

Expected: five new ledger rows staged before commit.

- [ ] **Step 5: Run postconditions before COMMIT**

Require:

```text
ledger count = 209
head = 20261107020000
preserved production-only entries remain
six content RPCs exist
authenticated audit append = false
three moderator read policies exist
three legacy operations write policies are absent
direct perk/testimonial writes for authenticated = false
destination view checks creator public profile
```

Any mismatch executes `ROLLBACK`.

- [ ] **Step 6: COMMIT and classify the client result**

Only a zero exit, `COMMIT` output and exact acknowledgment count as a committed client result. Any timeout, lost output or unknown status requires read-only reconciliation and no replay.

### Task 4: Stage the exact production application without alias change

**Files:**
- Deploy: source commit `950d08b2011f1c23265a193b8f7adc377a44eb26`
- Runtime code: `9947e97fd0b9b8692e81628c2af7dcf90c1a5953`
- Rollback target: `dpl_8fVAPaBpULzeF4WCg8s2CHQ2V2Cs`

**Interfaces:**
- Consumes: successful database postconditions.
- Produces: READY production-targeted deployment with no production alias change.

- [ ] **Step 1: Build the exact staged production deployment**

Run from the clean release worktree:

```powershell
vercel deploy --prod --skip-domain --yes --format=json `
  --meta codexApplicationCommit=950d08b2011f1c23265a193b8f7adc377a44eb26
```

Expected: new deployment is READY, target is production, all 71 routes build, and `kinnso-os.vercel.app` still resolves to the old deployment.

- [ ] **Step 2: Verify the unaliased staged deployment**

Using the returned deployment URL:

```powershell
vercel curl /api/health --deployment $STAGED_URL --yes
vercel curl /en --deployment $STAGED_URL --yes
vercel logs $STAGED_DEPLOYMENT_ID --no-follow
```

Expected: health returns `{ok:true,db:"up"}`; public shell is 200; recent logs contain no release-blocking error.

- [ ] **Step 3: Verify authorization and capability boundaries**

Confirm `admin/analytics` remains protected, operations-content writes require an active moderator/admin session, and disabled AI/media/financial capabilities remain unavailable.

- [ ] **Step 4: Stop before promotion on any failure**

Do not promote. Retain the staged deployment, logs and exact failing response for forward-fix review.

### Task 5: Promote and verify production

**Files:**
- Promote: verified staged deployment
- Preserve: `dpl_8fVAPaBpULzeF4WCg8s2CHQ2V2Cs`

**Interfaces:**
- Consumes: staged deployment and all database checks.
- Produces: canonical production alias on the exact release.

- [ ] **Step 1: Promote the tested deployment without rebuilding**

Run:

```powershell
vercel promote $STAGED_DEPLOYMENT_ID --yes
```

Expected: canonical alias moves to the staged deployment; no rebuild occurs.

- [ ] **Step 2: Verify production identity and health**

Run:

```powershell
vercel inspect kinnso-os.vercel.app --non-interactive --format=json
vercel curl /api/health --deployment kinnso-os.vercel.app --yes
```

Expected: deployment ID and commit metadata match the staged release; health returns HTTP 200 and `db=up`.

- [ ] **Step 3: Verify authenticated no-write workflows**

Using the already approved production test account, verify creator studio, merchant workspace and operations directories without creating persistent production records. Record role, route, response and saved-state visibility.

- [ ] **Step 4: Scan logs and alerts**

Inspect bounded production errors for the release window and confirm the alert owner/binding. If metrics or external alerting remain unavailable, record the rollout as technically deployed but launch monitoring incomplete.

### Task 6: Rollback and closeout

**Files:**
- Application rollback target: `dpl_8fVAPaBpULzeF4WCg8s2CHQ2V2Cs`
- Database strategy: forward fix only

**Interfaces:**
- Consumes: promotion result or any post-promotion failure.
- Produces: published incident decision and retained evidence.

- [ ] **Step 1: For an application-only failure, restore the known-good deployment**

Run:

```powershell
vercel rollback dpl_8fVAPaBpULzeF4WCg8s2CHQ2V2Cs --yes
```

Expected: canonical alias returns to `42be3ce`; hardened database objects remain intact.

- [ ] **Step 2: Do not replay or destructively reverse the database**

Use a reviewed forward fix if database behavior is wrong. Preserve ledger history, additive tables/functions and audit records.

- [ ] **Step 3: Close the release**

Record:

```text
sourceHead
runtimeCodeCommit
database envelope SHA-256
pre/post ledger
staged deployment
promoted deployment or rollback deployment
health and role results
retained production error logs
monitoring/alert limitations
```

## Approval Gate

Approval authorizes exactly:

1. applying the five migration files whose aggregate SHA-256 is `33897aba413aaf1a6344176ff6a8e4f56316d7f441cdb6feb89a1fa001cbdb40`;
2. staging source commit `950d08b2011f1c23265a193b8f7adc377a44eb26` with `--prod --skip-domain`;
3. promoting that staged deployment only if every database and staged-application check passes; and
4. retaining `dpl_8fVAPaBpULzeF4WCg8s2CHQ2V2Cs` as rollback.

Approval does not authorize paid providers, media activation, offers/redemptions, bookings, payments, payouts, or a second automatic database attempt.

This approval permits the controlled production rollout only. It does not approve public launch: real author-consented structured content, physical iOS/Android and VoiceOver/NVDA acceptance, external alert binding and launch-owner acceptance remain open.
