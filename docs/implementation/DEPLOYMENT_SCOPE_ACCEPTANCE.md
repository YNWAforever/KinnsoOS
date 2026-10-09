# N18 deployment eligibility evidence

Code source: `416f94e8e315e0c19b7d9a1e38d5fd5da38c9650`.
Candidate starts at main `4db0c7a72379f73567ff90cd861e03f996573f08`.

The existing deployment workflows correctly skip events outside their selected surfaces, but those skipped jobs provide no artifact explaining applicability. A separate **Deployment scope (metadata only)** workflow now records each existing job's selection and reason. The original Journeys read-only and cutover workflows remain byte-for-byte unchanged. Their skipped conclusions remain skipped.

The recorder checks out `github.workflow_sha`, records that workflow source separately from the deployment SHA, and verifies fingerprints of the original selection conditions. A changed or missing condition produces `UNKNOWN_POLICY` and fails the metadata job. This avoids reporting a guessed selection after a guard changes. Updating a selection guard will require a corresponding reviewed policy update.

The artifact includes allowed SHA/condition/selection fields and a sanitized origin. It omits event payloads, credentials, URL paths and queries. The recorder performs no target requests and receives no secrets. `SELECTED` means a separate runtime check is required; every metadata artifact explicitly records `runtimeAcceptance=NOT_RUN_METADATA_ONLY` and `signedInAcceptance=NOT_RUN`. Dispatching the metadata workflow does not dispatch the runtime workflows. GitHub does not trigger `deployment_status` workflows for `inactive` events; no record is claimed for events it does not deliver.

## Verification at code source

- Native contracts: 20 PASS, 0 FAIL, 0 SKIP. They exercise the real CLI with controlled event files, including selected production, preview, failed/pending, manual refs, other targets, original guard changes, SHA validity and private-field redaction.
- Development evidence: 16 initial missing-CLI assertions failed before implementation; those are new-runner RED evidence, not 16 existing product defects. Independent boundary inspection added three failing cases (17 PASS / 3 FAIL), corrected to 20 PASS.
- Journeys unit tests: 339 PASS, 0 FAIL, 0 SKIP. Build and typecheck PASS.
- Windows source package: 6 collected, 5 PASS, 1 symlink-permission SKIP. The frontend manifest remains 318 explicit files. No frontend dependency or package runner was added.
- YAML parsing and diff checks PASS; source and existing workflow guards inspected. YAML parsing does not prove hosted execution.
- Native connected tests: NOT_RUN; the existing owned API host-binding block is retained. Current-head isolated Linux PUSH/PR unit/integration/browser/package and root artifacts must be verified before merge.

## Separate gates

Code is implemented. This increment is not merged at document creation. Hosted metadata execution is NOT_RUN until actual events after merge. Original read-only/cutover results, named-role hosted U06, mailbox/content/device acceptance and formal release acceptance remain separate. No production data, settings, provider activation, flags or manual deployment is changed.

The author performed a separate review; it has weaker independence than an external review. Configured GitHub Codex review and exact-head green CI are required before using the standing merge authorization. Public ledger status remains `partial`, and historical failed/skipped evidence is preserved.

References: [GitHub deployment-status events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#deployment_status), [workflow source context](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts).
