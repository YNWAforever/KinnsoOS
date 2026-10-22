# KinnsoOS audit and continuation — 22 October 2026

## Scope and baseline

Audit the current repository and production public journeys, review recently merged creator/merchant work, and implement a bounded follow-up. This is not a production launch or a completion claim for the full master plan.

- Repository main: `0e9fd552f6e6270da23c8ebc25ec7487524850d6` (PR #80 merge).
- Production: `https://kinnso-os.vercel.app/`, READY deployment `dpl_KgvDWZVstbzx7Y18uaU2T3mXjZqg`, exact same main SHA.
- PRs #77–80 are already merged. Do not repeat the old October 13 branch-integration plan. PR #81 is an independent Dependabot change and is outside this slice.
- Git transport was unavailable in this runtime. The public corresponding-source archive was recovered and all **454 packaged file blobs** independently matched the exact GitHub tree, including the three mapped SQL inputs. Archive SHA-256: `e45eb254613ac64b3a8f6b3f4091227acc90cf89428f18311bcded35cf5cae1e`. Its metadata says `dirty: true`; that fact is retained. Local work uses an isolated source snapshot, not a claimed full Git checkout.
- Canonical SQL input files were restored from those verified packaged bytes for read-only contract tests. No SQL was executed.
- Existing `NEXT_PHASE_TRACEABILITY.csv` retains A01–A20, G01–G18 and U01–U06 as partial. This additive report does not close or renumber those requirements.

## Findings and changes

| ID | Priority | Evidence / impact | Change or remaining acceptance |
|---|---|---|---|
| OCT22-01 | P1 | Actual MerchantWorkspace harness: an initial workspace GET denies access, but an earlier owner's POST acknowledgement can replace the denial with “Saved” and start another GET. Source-level reproduction; no claim of a live backend authorization bypass. | Advance `workspaceEpoch` immediately on initial AUTH_REQUIRED/FORBIDDEN. Four regressions cover both codes and acknowledgement before/after React commits. A separate transient-read test preserves exact uncertain-request retry. Local PASS; remote CI required. |
| OCT22-02 | P1 | Live `help`, `legal/privacy`, `for-business`, `credits` all show the generic workspace hub. The connected fallback overrides selected page content. | Dedicated lazily loaded public information component and explicit four-path routing. Real Next HTTP: eight bilingual destinations correct, two unknown legal routes still 404. Browser client-navigation checks added but locally blocked. |
| OCT22-03 | P2 | Live workspace hub makes the old site primary, labels native creator/merchant pages “demo”, and states that published guides await configuration while the live catalog is populated. | Native creator/merchant/ops entries, separately labelled original-site links, explicit `/demo/` links, and separately supplied catalog/trips/role capability booleans. Enabled service never implies actor authorization. Six real component rendering checks PASS. |
| OCT22-04 | P2 | Live creator collaborations say to wait for connectivity even though the service is disabled. Disabled missions and earnings have no in-panel public next step. | Disabled-first status and localized Explore guides link. Zero private reads and no sign-in/retry prompt. Existing 503/auth/permission/replay behavior preserved. |
| OCT22-05 | P1 | Latest nightly `39697060646` has failed jobs with zero steps and no runner. The GitHub job annotation explicitly reports failed account payments or a spending limit requiring attention. | Owner must resolve GitHub billing/spend eligibility, then rerun and inspect exact-head checks. No billing changes, limit increases or automatic reruns performed. Do not label this an application test failure. |
| OCT22-06 | P1 | Current public creator/merchant entries report services not connected. The latest checked-in hosted UAT checklist remains NO_GO. Source, old CI and production deployment are separate facts. | Named-role hosted acceptance remains open: creator, merchant owner/staff, outsider and ops; persistence, permissions, approval, drafts, uncertain submissions and recovery. Do not turn on flags merely to remove unavailable UI. |
| OCT22-07 | P1 | No approved full privacy policy or dedicated privacy-request contact found in this audited source. Demo SupportPage contains browser-only data claims unsuitable for connected services. | New privacy destination explicitly states the policy/contact gap and explains account versus demo modes. **Routing is repaired; privacy-policy approval remains open.** |
| OCT22-08 | P2 | Historical controlled performance evidence is not a fresh field measurement. Remaining retained informational/commercial paths still fall back to the hub. | Re-establish CI, then set explicit latency budgets and measure production journeys after authorized activation. Inventory remaining retained routes and provide truthful content/availability handling without exposing demo transactions. |

## Recent-function review

The October 14 source already includes scoped creator/merchant initial server snapshots, mandatory fresh permission reads, held-read and account/company invalidation protections, preserved uncertain command payloads, and reminder-context navigation. The initial-GET/late-ACK case above was an uncovered ordering; it does not justify replacing the established lifecycle architecture.

The historical ledger records 664 unit, 97 owned DB, 220 native browser and four auth tests for the earlier qualification. Those are historical, not this patch's results. Original main runs `38507530026` (Journeys), `38507530105` (root CI), and `38507570200` (production read-only) were successful. Four recent nightly failures are recorded; the latest job's billing annotation is directly verified. No root cause is invented for an uninspected earlier job.

Performance scope: the new public page stays in its own dynamic chunk and introduces no backend read. No framework/package upgrade, database index, global cache or feature activation is included. No new LCP/INP/latency improvement percentage is claimed.

## Validation for this source patch

| Check | Outcome | Boundary |
|---|---|---|
| Merchant regression RED → GREEN | Four intended failures before the epoch fix; 28 focused tests passed after it | Actual component handlers with controlled transports; no external DB |
| Disabled creator RED → GREEN | Old outage wording failed the new contract; 32 focused tests passed | Existing permission/replay/uncertain-write controls retained |
| Workspace directory RED → GREEN | Six intended failures before the directory correction; six passed | Actual component rendering with framework/context boundaries only |
| `npm test` | **675 passed, 0 failed, 0 skipped** | Pure unit/component/contracts; initial capsule run had two missing canonical SQL inputs, restored without executing SQL |
| `npm run build` | PASS | Optimized Next build |
| `npm run typecheck` | PASS | Includes both new browser spec and config |
| Python corresponding-source package suite | **10 passed** | Manifest, packaging and input safety |
| Real Next HTTP routing | **10 passed** | Four public routes × two locales; two unknown routes remain 404; no backend configured |
| Independent review | No blocking source issue; 16 focused tests passed | Separate read-only reviewer |
| Native browser checks | **BLOCKED locally** | The u18 runner reports 12 launch failures before assertions because Chromium is absent; official downloads returned a 195-byte “Site Unavailable” HTML response instead of an archive. The new u20 spec is not run. Added tests are not counted as passed. |
| Hosted roles, DB integration, physical devices, screen reader, external providers | NOT RUN for this patch | Require the designated authorized target and existing acceptance gates |

Reproduction commands from `apps/journeys`:

```sh
npm ci
npm test
npm run build
npm run typecheck
python -m unittest discover -s tests -p 'source_package_test.py'
npx playwright install --with-deps chromium
npx playwright test --config=playwright.service-state.config.ts tests/e2e/u18-workspace-entry.spec.ts
npx playwright test --config=playwright.public-entry.config.ts
```

The public-entry config explicitly disables backend target/capabilities and starts its own server. It needs no account, seed, SQL migration or cleanup. Existing owned-stack suites remain separate and must pass their target identity gate before any client is initialized.

## Ordered continuation

| Task | Depends on | Acceptance | Status / owner |
|---|---|---|---|
| T01 Reconcile latest main/production/source | — | Exact revision and source-file hashes, old merged work not repeated | COMPLETE for the baseline above |
| T02 Close the four bounded source defects | T01 | Regression behavior, source/package/build/type checks, explicit limitations | IMPLEMENTED locally; draft PR and exact-head CI required |
| T03 Restore CI execution eligibility | — | Billing owner resolves GitHub annotation; jobs actually obtain runners and execute | BLOCKED on account owner; no financial settings changed |
| T04 Qualify the candidate | T02, T03 | Exact head: root/Journeys CI, native browser checks, source verification and configured review pass; retain all failures | REQUIRED before merge |
| T05 Complete public policy/support content | T02 | Approved full privacy policy, valid request contact, retention/deletion and provider disclosures; bilingual review | OPEN; product/content owner |
| T06 Hosted creator/merchant pilot | T04, T05 | Authorized staging target; named role journey records with save/reload, outsider denial, approval, unknown-result recovery, support and cleanup evidence | NOT RUN; follow existing hosted UAT checklist |
| T07 Operational activation | T06 | Provider/scheduler ownership, secrets and consent, alert delivery and recovery drills on approved target | NOT RUN; no activation in this patch |
| T08 Release and field performance | T04–T07 | Authorized merge/deployment, verify exact SHA, production read-only smoke, explicit budgets and field metrics | NOT RUN; source acceptance is not release acceptance |
| T09 Remaining retained routes | T02 | Inventory every non-demo footer/info/commercial alias; intentional destination or honest unavailable page, no fictional records | OPEN; next bounded UI slice |

Related existing workstreams include N03, N06, N09, N13, N14, N16 and N18. This patch improves their source evidence only; original U01–U06 and broader requirement closures still require their full mapped acceptance.

## Delivery and rollback

The patch changes source and tests only. It neither changes a production capability nor performs a database migration, provider call, message send, scheduler change, merge or production deployment. Submit as a draft PR based on the exact audited main and retain the owner's current branch work. Rollback is a normal revert of this patch; no data rollback is needed. Privacy-content limitations and existing operational NO_GO gates remain explicit.
