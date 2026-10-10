# Next manifest diagnostics for root browser CI

Root push run `38031718457` at `84e775007606b0165dd3a3ec690ebda9f1483b4b`
failed the profile enquiries journey. Next dev reported a JSON parse error on
multiple routes; its retry returned HTTP 500 on the public creator page. The
artifact contained the browser failure but no Next manifest snapshot. The
failing input and the underlying cause remain unconfirmed. Later green runs
are separate observations and do not repair that historical failure.

The root CI now collects an independent snapshot immediately after each
executed Booking OFF, profile enquiries and Booking ON fixture suite, before
the next suite starts. Each existing browser artifact includes its own
`next-manifest-evidence/next-manifests-<phase>.json`. Local output lives under
`apps/e2e/next-manifest-evidence`, keeping the existing artifact common root
and browser report paths. Collection and upload run after both
success and failure. A skipped suite creates no executed-suite artifact.
Existing test commands, retries, local targets, fixture guards and Booking ON
conditions are unchanged; a failed browser step still fails the job.

The collector records actual Git HEAD, the matching workflow SHA, working-tree
dirty state, run ID, run attempt, phase and the original suite outcome. It
inspects 24 fixed global JSON manifest paths under `apps/web/.next` and its
`dev` directory. It emits only relative allowlisted paths, byte counts, SHA-256
and status. Manifest values, environment values, route-specific filenames,
parser error text, traces and source maps are excluded. Reads are bounded to
2 MiB per file. Linked paths, non-files and changing files are not read as valid
manifest evidence; existing receipts cannot be overwritten.

| Snapshot | Meaning |
| --- | --- |
| `JSON_PARSED_FOR_OBSERVED_FILES` | The files found at collection time parsed; missing files are listed separately. |
| `INVALID_JSON_OBSERVED` | At least one collected file failed JSON parsing. |
| `NO_MANIFESTS_OBSERVED` | All allowlisted paths were absent. |
| `INCOMPLETE_SNAPSHOT` | A path was unsafe, unreadable, oversized, changing or a non-file. |
| `NOT_RUN` | The suite was skipped or cancelled; no manifest reads are claimed. |

This is a snapshot after Playwright exits. Transient corruption may disappear
before collection, and JSON validity does not establish manifest semantics.
Neither a valid snapshot nor successful collection proves browser, Auth,
database, signed-in role or production acceptance. The receipt explicitly
keeps `runtimeAcceptance=NOT_RUN_DIAGNOSTIC_ONLY`.

Local controls reproduce an invalid JSON input and missing output before the
collector exists (2 RED), then verify 11 behaviors, including bounded reads,
linked-path refusal, source/run binding, redaction and exclusive receipts.
An additional artifact-layout regression reproduced a shifted common root
(1 RED); its correction and the existing controls pass as 12 diagnostic tests.
The configured review also identified the existing contract's immediate-upload
assumption (3 RED). Its replacement accepts only the ordered suite, matching
collector and matching upload, retaining failure/skip guards and exact receipt
paths. All 15 artifact contracts, including 12 mutation controls, pass with the
26 existing product-state contracts. The initial scalar parser's three failures
on inline action-pin comments are retained separately.
The initial sandbox Git-fixture setup error and the initial eight lint errors
remain historical failures; neither is counted as the functional RED result.

N01 and N18 remain partial. Current-head CI must retain the diagnostic JSON
with the correct checkout/run/phase binding; the configured review must cover
the current head before integration. Formal U06 remains a separate gate.

Rollback: revert this workflow/collector increment. Keep historical failure
artifacts and existing browser evidence; no production settings or data change.
