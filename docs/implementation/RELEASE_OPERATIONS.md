# Release operations

Owner: `platform_operations`. This document describes the release controls implemented by the repository. It does not approve a deployment, database change, provider call or payment.

## Bind a release

Keep a private release record containing the frontend/backend commit, applied schema head, reviewed SQL hashes, enabled capabilities, corresponding-source archive hash, test runs, limitations and last-good application deployment. Bind test evidence to the actual source bytes. A previous green commit does not validate a newer candidate. Keep credentials, backups, customer data and audit exports out of the public repository and source archive.

Run the Journeys unit, build, typecheck, isolated integration and connected browser checks, plus the mature application's required regression checks. The connected runner verifies an owned local Supabase project before creating synthetic fixtures. Preserve unknown records; never reset an unrecognized target. Record skipped and unavailable checks separately from passing checks.

Review a scoped live schema delta before applying SQL. Historical migrations are not a deploy command. Rehearse the exact candidate against an authorized isolated restore, verify provider prerequisites and inspect data preservation. DDL followed by ROLLBACK proves that rehearsal only; it does not prove a production write succeeded. Inspect an uncertain outcome before considering a retry.

## Enable capabilities in stages

Verify independent-origin login and durable catalog, bookmarks, trip commands and import first. Verify creator publication, summary-versus-structured adoption and withdrawal next. Photo/storage and revocable sharing require their cleanup schema, server credential and scheduler checks. Then expose only the merchant, Ops, inbox, reconciliation and agent capabilities that passed their own role and state-transition acceptance.

`KINNSO_ENABLED_CAPABILITIES` controls product availability, while every protected request still requires current session and database authority. Preserve the existing onboarding, notification and financial audit contracts. Booking, payments, refunds and financial dispute decisions remain unavailable until their separately approved contracts and provider configuration exist.

The agent can return source-only previews with an explicit unconfigured-provider state. That state is not generated content or a saved trip. Paid generation/scan/maps require approved numeric budgets, pricing-unit conversion and actual-cost settlement before activation. Media storage accounting and notification provider/scheduler wiring also require explicit validation; a generic budget or job API does not establish those integrations.

Keep indexing disabled until the actual original-site URL inventory and canonical/redirect decisions are verified. A sitemap from another hostname cannot establish migration parity. Preserve the original application's availability throughout a controlled rollout.

## Application rollback

Record the exact last-good deployment before release. For an approved incident, disable the reviewed capability scope or promote that recorded application through the authorized provider process. Verify authenticated disabled requests return an explicit unavailable state, durable trip revisions and idempotency receipts survive, and restoring the capability reads the same stored state.

Preserve database data and immutable history. Do not drop newly populated tables, replay old financial functions, clear request receipts or reset production as an application rollback. Prefer a reviewed forward schema fix when reversal would lose new data. Local capability rollback evidence does not prove a cloud deployment rollback.

## Restore and monitoring

An authorized logical database backup must be hash-bound and tested on an isolated target. Record the precise coverage: database metadata/data and migration history are separate from Storage object bytes, role passwords, Auth/OAuth/SMTP configuration and Vault decryption recovery. Never replace provider-managed Auth or Storage schemas with synthetic test schemas.

Configure the actual provider schedules and alert owner according to [metrics and alerts](METRICS_AND_ALERTS.md). A missing job outcome remains unknown. Failed attempts preserve previous success timestamps. Insufficient production p75 samples remain insufficient; local viewport and keyboard checks do not establish physical-device or screen-reader acceptance.

Record controlled post-release results on the deployed commit using explicitly approved accounts, content and cleanup. Keep the release partial until its outstanding provider, commercial-rule, accessibility and operational gates pass.
