# Kinnso Operator-Led Pilot Control Room

Status: **PROPOSED_FOR_USER_APPROVAL**

Date: 2026-11-07

This document is a design proposal. It does not authorize implementation,
database changes, production deployment, participant invitations, external
messages, media upload, payment, paid AI, or public launch.

## Intent

The first controlled pilot must prove both sides of the product through one
connected, real-data journey:

1. A traveller discovers a real structured guide, saves it, adopts it into a
   private trip, recovers from an interrupted save or session, and receives a
   support response.
2. A creator joins a real merchant campaign, submits the requested work,
   receives merchant or operations review, and finds the resulting in-product
   notification.

Real participants and content do not yet exist. The next phase therefore adds
an operator-led onboarding and content-intake workflow around the authoritative
creator, merchant, operations and support workflows already running in
KinnsoOS.

The control room is an orchestration and evidence layer. It does not replace the
native guide editor, trip workspace, merchant campaign workspace, operations
review queue, inbox or support cases.

## Why This Shape

### Current state

- The last verified production release serves the combined creator, merchant
  and operations source `950d08b2011f1c23265a193b8f7adc377a44eb26`.
- Its recorded production database ledger is `209 / 20261107020000`.
- Guide authoring already supports structured drafts, publication and
  withdrawal.
- Merchant campaigns already support publishing, creator applications,
  milestones, submissions and review.
- Operations already has review queues, directory views, role enforcement and
  audited content administration.
- Traveller save, guide adoption, local recovery and support cases already have
  durable contracts.
- Real consented content, named pilot participants, approved privacy/support
  ownership, external alert ownership and physical device acceptance are
  missing.

These are the recorded release findings, not a new production acceptance claim.
Implementation and release must recheck the exact source and target. This
design continues on branch `codex/single-origin-design-20261105` from the pushed
evidence commit `7f75b5e0887c3f1367b45e8d740d3e518707b134`.

### Approaches considered

#### Manual runbook over existing workspaces

Operators would invite people and track onboarding, consent, content rights and
acceptance in an external document while using the existing product for the
actual work.

This has the least implementation cost, but it fragments evidence, hides blocked
participants, cannot enforce that pilot content received rights review before
publication, and makes recovery or handoff dependent on one operator's notes.

#### Standalone pilot CRM

A new system would own participant records, content intake, campaign workflow,
support, metrics and acceptance.

This is too broad. It duplicates authoritative records, creates new permission
and privacy surfaces, and risks pilot-specific logic diverging from the product
it is supposed to validate.

#### Thin pilot control room

**Chosen.** Add a bounded operations workspace and participant checklist that:

- stores only pilot orchestration data;
- links to authoritative users, guides, trips, campaigns, submissions,
  notifications and support cases;
- derives progress from those records;
- requires explicit evidence for external/manual checks; and
- prevents pilot-linked guide publication until rights intake is approved.

## Goals

- Onboard one traveller, one creator and one merchant without enabling an
  external email provider.
- Track each participant from invitation through consent, account linkage,
  role-specific onboarding, pilot readiness and completion.
- Collect and review provenance, authorship consent, source references,
  original language and cover-asset rights for at least three real structured
  guides.
- Bind one real merchant campaign to one accepted creator collaboration and
  observe application, delivery, review and notification states.
- Link the traveller journey to real saved, adopted, recovered and support
  evidence.
- Present one readiness view with derived internal checks and manually evidenced
  operational, alerting and physical-accessibility checks.
- Produce an exportable acceptance summary without exposing trip contents,
  support message bodies or credentials.
- Preserve all existing access controls, idempotency, auditability and failure
  recovery behavior.

## Non-Goals

- Public self-service pilot enrollment.
- General-purpose CRM, sales pipeline, ticketing replacement or marketing
  automation.
- Sending email, SMS or third-party messages.
- Uploading identity documents, contracts, receipts, photos or other source
  files.
- Activating media upload, paid AI, affiliate execution, offers/redemptions,
  booking, payments or payouts.
- Editing or reading private trip contents through the control room.
- Reading support message bodies through the control room.
- Automatically declaring public launch readiness.
- The three-author-consent content itself. Real content enters through the
- The real authored content itself. Real content enters through the
  approved intake workflow after the owners provide it.
- A custom Auth provider or new role system.

## Anti-Goals

- Treating a manually clicked checkbox as proof of a record the database can
  verify.
- Treating the existence of an acceptance record as a promise of payment or
  settlement.
- Leaving pilot-linked content publishable before rights review.
- Giving operations access to private traveller or support content merely
  because the account participates in the pilot.
- Creating a second notification store or support case system.
- Storing raw invitation secrets, source-document contents or external contact
  details in audit metadata or public logs.
- Automatically deleting completed records without an approved retention
  policy.
- Allowing analytics consent to become a prerequisite for using ordinary Kinnso.

## Confirmed Scope and Proposed Defaults

The user chose an operator-led control room and asked for onboarding and content
intake before the real pilot. Both traveller and collaboration journeys belong
in this design.

The following are the designer's proposed defaults for approval, rather than
additional user decisions already obtained: one traveller, one creator and one
merchant as the required cohort; three structured guides; a maximum of 20 slots
per run; admin/owner mutation authority; seven-day claim codes; no new email or
upload provider; fixed consent versions per run; and operator-observed recovery
and physical accessibility evidence. Their rationale is to keep the first run
small while testing the complete existing loop.

## Pilot Composition

A pilot run represents one controlled acceptance journey in production.

Required participants:

- one traveller;
- one creator; and
- one merchant.

The three participant accounts must be distinct. The merchant account must not
own the creator application, matching the application's existing self-campaign
restriction.

The operator explicitly designates the traveller, creator and merchant slots
that make up the acceptance cohort. Extra slots do not silently change which
accounts or evidence satisfy the required journey. A person acting as operator
does not stand in for any of these three participant accounts.

One operations admin or owner coordinates the run. A moderator may read the
control room for operational visibility but cannot change it.

The initial run targets English and Traditional Chinese. Additional authored
locales may appear in content, but they do not expand the pilot UI beyond the
currently supported product locales.

Each run records the exact candidate release and environment. Synthetic
rehearsal and real production participation are separate runs, with a
`synthetic` or `real` data classification that cannot be changed after
enrollment. No synthetic evidence satisfies a real acceptance check.

The default target is:

- at least three approved and published structured guides;
- one published merchant campaign;
- one creator application;
- at least one milestone submission; and
- one completed review and visible notification.

Required named operational responsibilities are the run coordinator, support
owner, privacy/data-request owner and alert recipient. One eligible operator may
hold several responsibilities. Store account references and a private channel
reference, not public contact information or an invented response-time promise.
Missing owners or approved notices block real enrollment.

## Participant Onboarding

### Invitation without an email provider

The operator creates a participant slot with a role and a neutral display label.
The system returns a high-entropy, one-time invitation code and shows it once.
The operator distributes the locale-specific `/{locale}/pilot` link and code through the participant
channel already agreed for the pilot.

No email address or external channel is added to pilot tables. Supabase Auth
continues to own login identity.

The code:

- is at least 128 bits of random entropy;
- is stored only as a keyed or cryptographic hash;
- expires after seven days by default;
- becomes unusable after a successful claim;
- can be revoked and regenerated; and
- never appears in audit metadata or logs.

The capability stores no raw secret in request receipts either. An unconfirmed
invite-creation response can be reconciled by its request ID, but cannot recover
the code; the operator revokes/rotates that invitation to display a replacement
once. The old code becomes unusable atomically. Codes are entered in a POST body,
not query strings, path segments or analytics. Failed claims are rate-limited
without revealing which slot or account exists.

### Claim and consent

The participant signs in or creates a normal Kinnso account, then enters the
code on the no-index `/{locale}/pilot` page. The run must already have approved,
immutable participation and privacy notices available to read before this
claim collects their account linkage.

Claiming requires:

- a current, non-anonymous Auth session;
- a verified email identity through the existing Auth flow;
- exact code verification under a row lock;
- an unclaimed, non-expired participant slot;
- successful account linkage; and
- acceptance of the current pilot participation and privacy-notice version.

Account linkage is permanent for the run. If a participant loses or changes
accounts, operations creates a replacement slot; it does not transfer private
history between Auth users.

Possessing a code creates a joined slot, not pilot clearance or application
privileges. The operator confirms that the claimant matches the invited person
through the already agreed channel before activating the slot. The participant
completes ordinary creator/merchant onboarding; pilot enrollment never grants
operations access, bypasses merchant approval or activates a suspended account.

### Role-specific onboarding

After joining, the participant sees only their own role checklist and canonical
links into existing Kinnso workflows.

- Creator: complete the creator profile, create a structured guide draft, submit
  content-rights intake, and wait for operations review.
- Merchant: complete the merchant application/profile, then create and publish a
  campaign using the existing merchant workspace.
- Traveller: review the pilot privacy and support notice, then wait until at
  least one guide is published before starting save, adoption, recovery and
  support steps.

The participant page never lists other participant identities or private
records. It remains available after completion in read-only form so the
participant can see what evidence was accepted.

### Consent changes, withdrawal and replacement

The run pins immutable participation, privacy and content-consent notice
versions. Consent records refer to the exact text digest and version shown,
not a mutable "current" label. Analytics consent remains a separate existing
choice.

Policy text, processors, contact procedures and retention commitments must come
from the real service owners before real enrollment. Store approved notice
snapshots and their approver; the software does not invent those terms.

A material change to pinned notices pauses the run and requires a successor run
with renewed participant acceptance. Completed historical evidence is not
relabelled with new consent. Minor wording changes likewise create a new
version, but do not silently replace the version accepted by an existing run.

Participants may withdraw their own pilot participation. That immediately
blocks further pilot contribution, invitation claims and acknowledgements for
their slot, but preserves ordinary account access and private trips. It does
not automatically grant permission to delete content, revoke public
publication rights or erase audit history; those separate requests go to the
existing creator withdrawal and approved privacy/support procedure.

Withdrawn/replaced slots and their evidence remain historical. They cease to
satisfy current cohort readiness or completion. A replacement starts a new slot
and repeats its assigned acceptance journey; records from the prior person
cannot be silently rebound. Public guides may remain public under their
separate rights agreement, but no longer count for the withdrawn creator's
current pilot target.

## Content Intake

Creator-authored guide content remains in `guides`, `guide_versions` and the
existing studio editor. The pilot intake records only the rights and provenance
needed to review that content.

For each proposed guide, the creator supplies:

- title;
- destination;
- authored language;
- source summary and up to 20 HTTP(S) source links or written provenance;
- rights basis: original authorship, licence, or documented permission;
- a private rights-evidence reference, not the evidence file itself;
- author-consent version and timestamp;
- whether a cover image is intended; and
- if a cover is intended, a confirmation that rights have been obtained and an
  operator-reviewed evidence reference.

The creator then binds the intake to a guide they own. The server verifies guide
ownership, locale and structured-publication eligibility.

A pilot-linked guide cannot publish until its intake is approved by an active
operations admin or owner. Approval covers an exact guide draft revision plus a
digest of the title, destination, locale, cover, structured content, source
summary/links, rights basis and rights reference. Normal guides not linked to a
pilot are unaffected. Pilot-linked content may still be saved as a private draft
while review is pending.

After publication, the control room verifies:

- guide status is published;
- a current `guide_versions` row exists;
- the published version equals the exact revision that operations reviewed;
- the guide/version digest and creator consent digest still match the approval;
- the creator is active and has a public profile;
- the public guide URL resolves; and
- intake approval still matches the guide and creator.

Withdrawal is allowed under the existing creator contract. It immediately marks
the pilot content check as no longer ready while retaining the intake, audit and
traveller copies.

Text, structure, sources, language, cover or rights-reference changes after
approval invalidate pilot eligibility atomically. The creator saves a new draft
revision and operations approves that exact revision before another pilot
publication. Published versions remain immutable. A post-publication change
creates a future draft/version; it cannot alter the page the traveller used
until a newly approved pilot version is explicitly published.

## Collaboration Target

The control room binds one existing campaign to:

- the merchant participant;
- the creator participant; and
- the published `missions.id`.

The binding is orchestration data because the existing campaign, application,
milestone, submission, review and notification records remain authoritative.

Derived collaboration steps:

1. The merchant participant's `merchant_profiles.status` is `active` and its
   `merchant_applications.status` is `approved`.
2. `missions.status` is `published`.
3. Campaign is bound to the run.
4. A `mission_participants` row names the bound creator and was created after
   the run's acceptance start.
5. That row has `status='active'`, proving application approval. A cancelled or
   merely applied row does not pass.
6. A `mission_milestone_submissions` row exists for the bound participant and
   was submitted after the acceptance start.
7. The current submission status is `approved`. If a revision was requested,
   the creator must resubmit and the final resulting status must be `approved`.
8. A `notifications` row exists with `creator_id` equal to the creator
   participant user, `entity_type='mission'`, `entity_id=missions.id`, and a
   `notification_type` of `submission.approved`.
9. The creator participant acknowledges the notification in the UI.

Displaying `approved` never creates a payment, payout or settlement.

## Traveller Journey

The control room does not read private trip data. It derives limited booleans
and timestamps through a dedicated participant-owned projection:

- guide discovery event exists;
- guide save exists for the traveller and selected guide;
- an adopted trip exists with `trip_stops.source_guide_id` equal to that guide;
- the trip has at least one revision after adoption;
- recovery verification is recorded by an operator with evidence;
- a support case was created after the acceptance start with
  `recipient_id=traveller user` and `linked_event_id=run.id`, and its final
  state is `resolved`; and
- the traveller confirms the support response in the participant checklist.

The operator sees references, statuses and timestamps, not trip titles, stop
notes, private support messages or raw location data.

Evidence eligibility is fixed:

- a real run cannot pass on records created before its `acceptance_started_at`;
- every action must involve the exact required participant slots;
- a save, adoption, application, submission, notification or support case from
  another run, participant, guide or campaign does not count;
- the support case must be explicitly scoped to the run through its
  `linked_event_id`;
- the adopted trip must remain readable by the traveller at completion; and
- the guide must remain published with the exact reviewed version through the
  acceptance window, even if it is changed later.

Existing privacy-preserving pilot metrics that cannot be tied to this run do
not prove discovery. The first release records discovery as an operator-observed
check with a private evidence reference, or adds a run-scoped event only after a
separate design confirms its privacy and retention behavior. It does not
backfill anonymous telemetry into participant evidence.

## Operations Control Room

The existing operations dashboard gains one `Pilot` view at:

`/{locale}/ops?view=pilot`

The control room contains:

- run summary and status;
- participants and role-specific readiness;
- copy-once invitation codes;
- content intakes and rights-review state;
- bound campaign and collaboration progress;
- traveller journey progress;
- support/privacy/alert/device gates;
- a grouped readiness explanation; and
- a bounded acceptance-summary export that contains references, timestamps and
  statuses without private content.

Filters are bounded to run status, participant role and blocked readiness.
Results use keyset pagination. The initial implementation shows one selected run
at a time and supports at most 20 participants per run.

The operator can:

- create or configure a draft run;
- add, pause, replace or withdraw participant slots;
- generate or revoke invitation codes;
- approve or reject content intakes with a written reason;
- bind content and collaboration records;
- record manual check results with evidence references;
- begin, pause, complete or cancel the run; and
- export the acceptance summary.

Creation, state changes and evidence changes are audited.

### Run lifecycle and pause

The run lifecycle is:

`draft -> recruiting -> running -> completed`

`paused` may be entered from `recruiting` or `running`; `cancelled` is terminal.

Entering `running` requires:

- an exact candidate release and environment;
- a data classification;
- immutable approved notice versions;
- required operational owner references; and
- a prepared but not yet completed acceptance checklist.

Pausing:

- disables invitation claims;
- disables participant intake and acknowledgement commands;
- disables operations pilot mutations except resume and cancel;
- blocks publication of pilot-linked guides until resumed; and
- emits an audit event and alert-visible status.

Ordinary non-pilot Kinnso workflows remain available while the pilot run is
paused; the control room cannot freeze the platform. Existing source records
remain readable, and actions taken in ordinary workflows keep their normal
status. When the run resumes, an action created after the original acceptance
start remains eligible if it still belongs to the exact run participants and
passes all current mappings. A new invitation claim remains disabled until an
operator explicitly enables recruiting again.

## Data Model

All new tables belong in the unexposed `kinnso_internal` schema. RLS is enabled
on every table. Direct access is revoked from `public`, `anon`, `authenticated`
and `service_role`; application access is through narrow RPCs.

### `pilot_runs`

- `id uuid primary key`
- `name text` with bounded length
- `status text`: `draft`, `recruiting`, `paused`, `running`, `completed`, `cancelled`
- `data_classification text`: `synthetic`, `real`
- `candidate_release_sha text`
- `environment_origin text`
- `acceptance_started_at timestamptz null`
- `minimum_published_guides integer default 3`
- `participation_notice_version text null`
- `privacy_notice_version text null`
- `content_consent_version text null`
- `coordinator_reference text null`
- `support_owner_reference text null`
- `privacy_owner_reference text null`
- `alert_owner_reference text null`
- `private_channel_reference text null`
- `created_by_ops_member_id uuid`
- `revision integer`
- `created_at`, `updated_at`

Only one non-terminal run may be `recruiting`, `paused` or `running` at a time.
The transactional command verifies this under an advisory lock. `running` is
rejected until its release, owners, immutable notice versions and pre-pilot
checks are complete.

### `pilot_participants`

- `id uuid primary key`
- `run_id uuid`
- `role text`: `traveller`, `creator`, `merchant`
- `display_label text`
- `user_id uuid null`
- `pilot_cohort_role text`: `required_traveller`, `required_creator`, `required_merchant`, `observer`
- `status text`: `invited`, `joined`, `active`, `paused`, `withdrawn`, `completed`
- `consent_version text null`
- `consented_at timestamptz null`
- `revision integer`
- `created_at`, `updated_at`

Constraints and indexes:

- unique `(run_id, role, display_label)`;
- partial unique `(run_id, user_id)` when `user_id` is not null;
- one required traveller, creator and merchant slot per run;
- index on `run_id, status`; and
- index on `user_id`.

### `pilot_invites`

- `id uuid primary key`
- `participant_id uuid`
- `code_hash bytea`
- `status text`: `active`, `claimed`, `revoked`, `expired`
- `expires_at timestamptz`
- `claimed_at timestamptz null`
- `created_by_ops_member_id uuid`
- `created_at`

The raw code is never stored. The insert RPC returns the raw code once to the
operations UI and stores no raw code in the request receipt.

### `pilot_content_intakes`

- `id uuid primary key`
- `run_id uuid`
- `creator_participant_id uuid`
- `guide_id uuid null`
- `guide_draft_revision integer null`
- `reviewed_guide_version integer null`
- `content_digest text null`
- `title text`
- `destination text`
- `authored_locale text`
- `source_summary text`
- `source_urls text[]`
- `rights_basis text`: `original`, `licence`, `permission`
- `rights_evidence_reference text`
- `author_consent_version text`
- `author_consented_at timestamptz`
- `consent_digest text`
- `cover_rights_confirmed boolean null`
- `cover_rights_evidence_reference text null`
- `status text`: `draft`, `submitted`, `approved`, `rejected`, `published`, `withdrawn`
- `review_reason text null`
- `reviewed_by_ops_member_id uuid null`
- `reviewed_at timestamptz null`
- `revision integer`
- `created_at`, `updated_at`

Constraints and indexes:

- unique `guide_id` when not null;
- approval and published states require `guide_draft_revision`, `content_digest`
  and the matching operations review tuple;
- published state requires one exact reviewed `reviewed_guide_version`;
- maximum 20 source links;
- HTTP(S)-only source links;
- coherent cover-rights fields;
- index on `run_id, status`; and
- index on `creator_participant_id`.

### `pilot_collaborations`

- `id uuid primary key`
- `run_id uuid`
- `merchant_participant_id uuid`
- `creator_participant_id uuid`
- `mission_id uuid null`
- `revision integer`
- `created_at`, `updated_at`

There is at most one collaboration target per run in the initial release.
Distinct-user and participant-role checks occur in the command RPC.

### `pilot_checks`

- `id uuid primary key`
- `run_id uuid`
- `code text`
- `category text`
- `status text`: `not_run`, `pass`, `fail`, `blocked`
- `evidence_reference text null`
- `observed_summary text null`
- `revision integer`
- `updated_by_ops_member_id uuid null`
- `updated_at`

Default checks are created with the run. Internal checks are computed and cannot
be manually passed. Manual checks require a non-empty evidence reference before
they can be set to `pass`.

Manual checks include:

- privacy/support copy approved;
- support owner and handoff procedure confirmed;
- alert recipient and routing confirmed;
- physical iOS;
- physical Android;
- VoiceOver; and
- NVDA.

Internal checks include participant readiness, content, collaboration,
notification and traveller state.

Manual pass changes are rejected before `acceptance_started_at`, during
`paused`, or after `completed`/`cancelled`. A manual evidence reference must
point to an operator-managed private record with a capture time inside the
run's acceptance window.

### `pilot_evidence`

- `id uuid primary key`
- `run_id uuid`
- `check_code text`
- `entity_type text`
- `entity_id uuid`
- `evidence_reference text null`
- `captured_by_ops_member_id uuid`
- `captured_at`

This table stores references to already-authoritative records. The mutation RPC
validates that referenced records belong to the run and participant. It never
copies private trip notes, support messages, source documents or credentials.

Allowed entity types are `guide`, `trip`, `mission`, `mission_participant`,
`mission_submission`, `notification` and `support_case`. Validation for each
type resolves the actual row and verifies the required run participant, guide,
campaign or submission relationship. A UUID alone is not accepted as evidence.

## API and Read Models

The new capability key is `pilot`. The server checks the capability and then the
current Auth session and database authority.

### Operations read

`GET /api/ops/pilot?runId=<uuid>`

Requires an active operations moderator, admin or owner. Returns:

- run summary;
- participant role/status/readiness, without email;
- content intake summaries;
- campaign/collaboration derived steps;
- traveller journey booleans;
- checks and evidence references; and
- a readiness explanation.

### Operations commands

`POST /api/ops/pilot`

Requires an active operations admin or owner. Supported bounded commands:

- `createRun`;
- `setRunStatus`;
- `addParticipant`;
- `setParticipantStatus`;
- `createInvite`;
- `revokeInvite`;
- `reviewContentIntake`;
- `bindGuide`;
- `bindCollaboration`;
- `setManualCheck`; and
- `addEvidenceReference`.

Every command includes `requestId` and `expectedRevision` when updating an
existing row.

### Participant read and commands

`GET /api/pilot`

Returns only the current user's participant slot, role checklist, consent
version, links to the user's canonical workflows and a safe readiness summary.

`POST /api/pilot`

Supports:

- `claimInvite`;
- `acceptConsent`;
- `submitContentIntake`;
- `updateOwnedContentIntake`;
- `acknowledgeNotification`; and
- `acknowledgeSupportResponse`.

The participant cannot approve their own content, bind a guide, bind a
collaboration, set an operations check or view another participant.

### Response contract

All routes use the existing API response/error conventions:

- `AUTH_REQUIRED`;
- `FORBIDDEN`;
- `INVALID`;
- `NOT_FOUND`;
- `CONFLICT`;
- `REQUEST_ID_REUSED`; and
- `UNAVAILABLE`.

Unknown outcomes retain the original request ID and payload and expose retry of
the same command.

## Database Functions

New public RPCs:

- `get_kinnso_ops_pilot(p_run_id uuid)`
- `admin_apply_kinnso_pilot_command(p_request_id uuid, p_command jsonb)`
- `get_kinnso_pilot_self()`
- `apply_kinnso_pilot_participant_command(p_request_id uuid, p_command jsonb)`
- `get_kinnso_pilot_publish_permission(p_guide_id uuid)`

Implementation requirements:

- `security definer` with `set search_path = ''`;
- explicit `kinnso_internal.actor()`/`is_active_ops_role` checks inside every
  function;
- revoke default execution before granting only to `authenticated`;
- advisory lock plus digest/replay lookup from the existing request receipts;
- row locks only around short state transitions;
- no external calls inside a transaction;
- bounded text, array and JSON inputs;
- reason required for state changes and rights decisions;
- all mutations call `ops_audit_log_append` in the same transaction; and
- internal table reads remain inaccessible outside the RPCs.

## Readiness Rules

The control room exposes three different states so setup cannot be confused
with completed acceptance.

### Ready to begin real participation

- exact source, environment and `real` data classification are recorded;
- immutable participation/privacy/content notices and named responsible owners
  are recorded;
- one required traveller, creator and merchant slot exist;
- the pilot capability is connected;
- data classification and source are immutable for the run; and
- synthetic rehearsal has passed for the same source and migration candidate.

Real enrolment remains blocked if privacy/support terms or named owners are
missing.

### Execution complete

- the three required participant accounts are joined, consented, distinct and
  active;
- the creator is active with a public profile;
- the merchant profile and application are active/approved;
- at least three content intakes are approved against exact guide draft
  revisions;
- each approved intake maps to the exact published structured guide version
  reviewed, owned by the creator;
- no linked guide is withdrawn or has drifted from its approved digest;
- one campaign is bound and the exact creator's participant row is `active`;
- at least one milestone submission was created during the run;
- the current submission status is `approved`, after resolving any requested
  revision;
- the exact `submission.approved` notification exists;
- the required guide view, save, adoption, post-adoption revision, scoped support
  case and participant acknowledgements exist after acceptance start;
- privacy/support and alert-owner checks pass; and
- physical iOS, physical Android, VoiceOver and NVDA checks pass.

### Completed

`completed` is permitted only after execution checks pass and the run
coordinator explicitly records completion. A terminal run remains read-only and
retains its evidence. The UI reports every unmet condition. It never replaces
missing values with zero or infers a pass from another environment.

Completing a run does not activate services, publish unfinished content, alter
capabilities or declare public launch readiness.

## Security and Privacy

- No raw invitation code, session token, password, private trip content, support
  message, source-document bytes, contact book or credential is stored in pilot
  tables or audit metadata.
- Participant display labels and UI copy must not expose email addresses.
- Admin/owner access is required for all pilot mutations. Moderator access is
  read-only.
- Participant data is row-scoped by `user_id`.
- Cross-participant access returns `NOT_FOUND`, not a list of authorised IDs.
- Suspended operations members lose access in the same transaction through the
  existing active-session and current-role checks.
- Rights decisions and operator check changes are audited.
- The export contains references and statuses only.
- Existing support and trip RLS remains authoritative.
- No automatic retention or deletion period is introduced. A completed run is
  marked complete and retained. Any redaction/retention action requires a
  separately approved policy.

## Reliability and Concurrency

- Invitation claim is idempotent by request ID and serialized per invite row.
- A code cannot be claimed by two users.
- A user cannot occupy two slots in one run.
- Duplicate content intake or duplicate guide binding is rejected.
- Stale revision updates return `CONFLICT` without clearing editor input.
- Run-level status changes take a short advisory lock.
- Suspended or expired sessions fail before returning private data.
- Late responses cannot restore data after account invalidation, participant
  withdrawal or run cancellation.
- Derived checks are recalculated from authoritative records on every read.
- Manual evidence entries are append-only; a changed check result creates a new
  revision and audit event.

## User Experience and Accessibility

The operations view extends the existing Ops navigation and visual language. The
participant view uses the existing app shell and bilingual copy.

Both surfaces must:

- support keyboard-only operation;
- retain focus across dialogs and state updates;
- announce loading, success, blocked and error states;
- work at 320px and 200% text without horizontal scrolling;
- distinguish unknown, not run, blocked, failed and passed;
- provide copy-to-clipboard with a visible non-secret fallback for invitation
  codes;
- keep every primary workflow behind a canonical link to its existing workspace;
  and
- avoid nested dashboards or duplicate forms.

Invitation-code display is one-time and masked by default. Operationally
sensitive emails and support details are not rendered.

## Metrics and Alerts

Emit aggregate pilot events without identity or free text:

- run created/started/paused/completed;
- participant joined/ready/withdrawn;
- content intake submitted/approved/published/withdrawn;
- campaign bound/application accepted/submission reviewed/notification observed;
- traveller save/adopt/recover/support acknowledged; and
- check status changes.

No participant email, support text, trip text or invitation code enters
telemetry.

External alert routing remains an operator check. The implementation cannot mark
that check passed without a recorded evidence reference and named operational
owner.

## Testing and Acceptance

### Unit and contract

- command parsing and bounded inputs;
- readiness calculation;
- one-active-run invariant;
- participant distinctness;
- invitation lifecycle;
- content approval/publish blocking;
- conflict and request replay;
- safe export shape; and
- bilingual labels and status meanings.

### Database integration

- clean migration from the current production ledger head;
- participant claim race;
- duplicate invite and duplicate participant;
- concurrent content approval and publication;
- stale revision updates;
- suspension before a read or write;
- revoked/expired session;
- cross-account isolation;
- moderator read/write separation;
- direct internal-table access denial;
- evidence-reference ownership validation; and
- no private rows removed on run completion.

### Backend-connected browser journeys

1. Operations creates a run and three participant slots.
2. Each test account claims one code and accepts consent.
3. Creator submits three rights intakes and creates/publishes three guides.
4. Merchant publishes a campaign.
5. Operations binds the campaign and creator.
6. Creator applies and submits a milestone.
7. Merchant or operations completes review.
8. Creator observes the notification.
9. Traveller discovers and saves a guide, adopts it into a trip, completes a
   recovery check and receives a support response.
10. Operations reaches readiness without any manually asserted internal pass
    that disagrees with the linked records.

Negative browser cases include wrong/expired invitation code, duplicate claim,
suspension mid-flow, cross-run identifiers, unpublished guide, wrong creator,
foreign campaign, untrusted evidence URL and attempted direct API writes.

### Release checks

- Journeys unit, TypeScript, production build and source-package tests;
- full new migration chain on an isolated database;
- RLS/function advisors;
- Preview/staging browser suite with the `pilot` capability;
- zero new production error/fatal/HTTP 500 logs during approved rehearsal; and
- review of the exact source and migration hashes before production.

## Rollout and Rollback

The pilot control room is disabled by default through the `pilot` capability.

1. Implement and verify locally against an isolated database.
2. Deploy code and migration to an approved non-production target.
3. Run synthetic end-to-end and negative browser acceptance.
4. Present the exact source, migration, capability and rollback packet for
   approval.
5. Apply the additive migration and deploy the application without changing
   other production capabilities.
6. Enable `pilot` only after health, authorization and UI checks pass.
7. Populate the run only after real role owners, support owner and evidence path
   are confirmed.

Rollback disables the `pilot` capability or redeploys the prior application.
New tables, evidence and audit rows remain for forward inspection. No migration
history is replayed and no participant or acceptance record is deleted.

External email, media upload, paid AI, affiliate execution, offers/redemptions,
booking, payment and payouts remain disabled throughout this phase.

## Decisions Made in This Design

- One connected pilot proves both traveller and creator/merchant journeys.
- The pilot remains operator-led; there is no public enrollment product.
- Existing product workspaces remain authoritative.
- Participant onboarding uses one-time operator-distributed codes because
  external email is not connected.
- Pilot content requires rights/provenance approval before publication.
- Real content minimum is three published structured guides.
- Participant identities are distinct and isolated.
- Manual checks require evidence; derived checks cannot be overridden.
- Private trip and support content stay outside the control room.
- The first implementation does not add retention automation.

## Builder Handoff

The implementation planner may decide exact component names, extracted helper
modules, accessible presentation details, query-key naming and test fixture
organization without changing the product behavior above.

The plan must not weaken RLS, expose internal tables, add direct browser writes,
send external messages, activate disabled providers, infer physical-device
passes, or implement public self-service onboarding.

## Approval Criteria

Approval of this design authorizes the next step: creating an implementation
plan for the operator-led pilot control room. It does not authorize code,
migration, push, deployment, production writes, participant invitations or
capability changes.
