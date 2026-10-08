# Finance and agent acceptance

N17 remains **partial**. Existing application contracts were verified at clean rebased source `9ebeb68128beec2a2bdfe7d65aea48354985100c` after merged main `21898df946bd3e59037630ed475d7486496b8309` on 2026-10-08; this increment records evidence and does not replace the financial or agent services. The relevant finance/agent source is unchanged from the earlier clean `2551fd1` verification. Formal hosted U04/U05, business-rule approval and paid-provider acceptance are **NOT_RUN**.

## Executed evidence

The owned local target was `kinnsoos-b1-20261002`, API `http://127.0.0.1:58421`. Its running container and project label passed the existing target guard. The target also contained the isolated notification acceptance candidate; notification behavior is outside this finance/AI verification. Fixtures use synthetic identities, receipts and status records, with existing scoped cleanup.

| Check | Actual result | Scope |
|---|---|---|
| Finance units and fixed agent evaluation | 25 PASS, 0 FAIL/SKIP | Exact smallest-unit arithmetic and private/session-scoped transport; six evaluation groups |
| Finance integration | 2 PASS, 0 FAIL/SKIP | Real local Auth/RPC, currency aggregates, keyset pages, authority, idempotency and reconciliation history |
| Agent accounting integration | 1 PASS, 0 FAIL/SKIP | Real local reservation/settlement RPCs and monthly aggregate; synthetic provider transport |

Reproduce from `apps/journeys` with the existing owned `.env.test` and target guard:

```sh
node --experimental-strip-types --test --test-concurrency=1 tests/finance-reconciliation.test.mjs tests/agent.evaluation.test.mjs
node --env-file=.env.test --experimental-strip-types --test tests/integration/finance-reconciliation.test.mjs
node --env-file=.env.test --experimental-strip-types --test tests/integration/agent-accounting.test.mjs
```

Run the two RPC files sequentially; preserve unrelated monthly configuration. Full private logs and SHA/target receipts are retained outside the source archive. These counts are scoped checks, not the complete application regression or production role acceptance.

## Financial result and limits

The integration exercises 1,207 settlement records above the service row limit: 603 HKD and 602 USD records plus unsupported/unknown-currency records. Totals are calculated by the server across pages and remain separate by currency and basis. Unsupported or missing currency is an exception, not a silently converted amount. Cross-branch, marketing, outsider, changed-cursor, offboarding and ownership-transfer boundaries remain enforced.

Real local claim, redemption, receipt submission and review RPCs verify replay and concurrent redemption produce one obligation. Claim attribution, approved receipt, creator obligation, settlement progress and payout promise remain distinct. A recorded payout promise cannot allocate itself to unrelated obligations. Historical receipt linkage remains unknown when its FK is absent; the service does not guess a link or count the predecessor twice. Reconciliation review keeps source IDs, reasons, revisions, replay receipts and immutable history; it cannot settle a payment or choose a refund policy. Raw claim tokens and private receipt URLs are excluded from the financial projection.

Synthetic local `paid` and settlement statuses are exercised to verify those distinctions. No bank, Stripe, webhook, actual redemption, refund or transfer was invoked. Refund/adjustment execution and duplicate-receipt business decisions remain blocked pending owner-approved rules; a `waiting_business_rules` history entry is not that approval.

## Agent result and limits

The fixed inventory has 20 cases plus its inventory check: grounded, no-data, stale, conflicting, hostile-source and timeout/unavailable groups. The fixed verification dates are test inputs, not evidence that live sources are current. Source-only results use bounded evidence and canonical links, identify unknown/stale/conflicting information, and require confirmation before the permitted owned-trip proposal. They do not claim a save, booking, payment or notification.

The accounting integration charges rejected fabricated output 7 synthetic USD micro-units while successful-flow credit remains zero. Accepted contract-valid output costs another 3 micro-units, leaving total spent 10, reserved 0 and exactly one successful flow. Costs incurred by rejected work remain visible; rejection does not erase spend or earn successful-flow credit. The application validates provider output before accepting that credit. A trusted `successful` transport flag alone is insufficient.

The approved cap is **US$5 total per calendar month across AI, scan, maps, storage and jobs**, not US$5 per service. Actual provider rates, conversions, execution authority and operational ownership remain separate gates. No paid provider is configured by this increment. The deterministic cases and synthetic transport do not establish external provider quality, privacy or live-source correctness.

## Release and rollback

This evidence-only increment adds no SQL, flags, provider settings, payment capability, content or indexing. Revert its documentation commit to correct the record; preserve application data and history. Before commercial rollout, bind current hosted schema/flags and source SHA, approve refund/duplicate-receipt rules and rates, and execute named Finance/Ops U04/U05 with the approved identities and cleanup. Keep booking/payment and unapproved paid providers unavailable until their own gates pass.
