# Journeys route bundle measurement

Code candidate `4a5df3b5d783d7fded486730119ff7a521176c69`; baseline `e1977805202748ea9a93c477e2812783885133b5`. This is an owned local lab measurement. Source, merge, runtime and acceptance have separate gates.

Six existing private route panels now load on selection: merchant workspace, invitation recipient, operations queue, financial reconciliation, task preview and creator studio. Top-level named next/dynamic imports preserve default SSR, route selection, context, bilingual loading status and the cream/green shell. The eager shell retains account invalidation until fresh server-verified actor props arrive. No query, capability, cache, API, schema, provider, dependency or lockfile change.

The actual public search browser regression failed on private-panel JavaScript before each increment and passed afterward. Selected role routes retain server headings, bilingual rendering, private/no-store, noindex and signed-out boundaries. Existing signed-in authority, revision, idempotency and draft regressions remain in the full suite.

One fresh final reviewer found that a delayed task-preview module could miss a completed cross-tab logout. A real browser regression held the actual chunk, completed logout, observed broadcasts and canonical API 401, then released it: controls incorrectly remained enabled (RED). Eager shell invalidation retention fixed this for all six panels. The same test now verifies sign-in replacement and same-account reauthentication (GREEN). API authorization remains authoritative. Earlier test setup failures are retained separately and are not counted as product RED.

## Fixed conditions

Chrome 145.0.7632.6 / Lighthouse 13.5.0 / Node 24.18.0, same Windows host and isolated loopback database; 390×844 mobile emulation, 4× CPU slowdown, 150 ms latency, 1,600/750 Kbps applied throttling. Each of home, explore, explicitly authored one-day/one-stop guide and persisted signed-in trip has three cold/warm pairs: 24 navigation samples per version. Cold clears browser HTTP cache in a fresh context; login cookies are retained; server/database stay warm. External HTTP requests are blocked. No concurrent local regression or second lab runs.

All versions used the unchanged existing runner. Each completed four real interaction assertions, twelve equivalent backend reads and independently checked owned-fixture cleanup. Global catalog row volume was not pinned separately; the authored guide/trip shape was fixed. No fixture identity, raw trace or private audit is distributed here.

## Results

The predeclared goal was at least 20 KiB less median cold JavaScript on all four routes, plus the existing median LCP≤2,500 ms / CLS≤0.1 limits for all eight route/cache groups. The first three-panel candidate saved only 10,697 bytes on each cold route and FAILED the JS goal. The second five-panel candidate saved 16,306 bytes per cold route and also FAILED the same goal. Both complete results are retained; the threshold was not changed.

The six-panel candidate saved 22,591 bytes before the review fix; the unchanged lab was repeated on the exact clean post-fix SHA. Its engineering goal is **PASS**. Values below are median [minimum, maximum] from three measured samples; JS is the existing runner's sum of Lighthouse network-request transferSize for Script resources. Local transfer sizes do not establish production compressed delivery sizes. Warm JS bytes were zero in the original run; this is browser cache behavior, not a zero-size bundle.

| Route / cache | Before JS bytes | After JS bytes | JS delta | Before LCP ms | After LCP ms | After CLS | Before TBT ms | After TBT ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| home / cold | 239523 | 216990 | -22533 | 1404.766 [1279.536, 1724.246] | 1212.282 [1109.112, 1547.201] | 0.036 [0.036, 0.036] | 294.449 [216.474, 304.402] | 144.178 [125.373, 175.717] |
| home / warm | 0 | 0 | 0 | 360.302 [348.982, 448.886] | 354.269 [346.427, 375.858] | 0.036 [0.036, 0.036] | 220.980 [216.071, 497.316] | 130.199 [93.807, 135.730] |
| explore / cold | 242552 | 220019 | -22533 | 1241.623 [1219.280, 1298.844] | 1305.447 [1255.144, 1416.776] | 0.000 [0.000, 0.000] | 172.382 [158.183, 336.553] | 208.256 [183.315, 210.260] |
| explore / warm | 0 | 0 | 0 | 361.118 [312.303, 409.325] | 405.904 [382.588, 426.005] | 0.000 [0.000, 0.000] | 197.644 [187.381, 204.739] | 264.266 [127.318, 272.088] |
| guide / cold | 239523 | 216990 | -22533 | 1274.317 [1258.965, 1313.141] | 1275.872 [1204.980, 1534.485] | 0.000 [0.000, 0.000] | 182.241 [180.142, 233.285] | 358.371 [148.224, 376.946] |
| guide / warm | 0 | 0 | 0 | 345.846 [337.861, 417.052] | 384.032 [310.877, 674.718] | 0.000 [0.000, 0.000] | 204.896 [193.406, 215.612] | 183.836 [121.394, 524.807] |
| trip / cold | 239523 | 216990 | -22533 | 1002.756 [962.247, 1075.509] | 1186.724 [1040.965, 2366.992] | 0.003 [0.003, 0.003] | 196.331 [191.196, 445.878] | 525.192 [237.109, 655.919] |
| trip / warm | 0 | 0 | 0 | 366.761 [311.525, 556.195] | 387.489 [346.284, 517.649] | 0.003 [0.003, 0.003] | 226.743 [195.049, 264.334] | 287.349 [207.213, 512.019] |

Required audits and metrics are finite/present and navigation/interaction traces were retained privately. Optional trace-engine/Lantern diagnostics were retained; optional insight processing is not claimed verified. The first after run had a warm-trip TBT increase of 139.077 ms and a 1,310 ms outlier. Timing improvements are not claimed for every group.

The current trip cold median TBT increased by 328.861 ms. The timing rows show mixed results; the predeclared gate covers JS reduction and LCP/CLS limits, and does not establish a TBT or field-INP improvement.

## Regression and remaining acceptance

Exact clean code candidate: 331 unit / 39 integration / 80 connected browser PASS, zero skipped or failed; build/typecheck PASS. Windows source packaging: 5 PASS / 1 symlink-permission SKIP. Linux packaging and exact review-head CI remain separate merge gates.

A previous full-browser run had 78 PASS / 1 FAIL because the bookmark test read an unfinished asynchronous response-body observer. A controlled delayed observer reproduced the failure; captured promises and a bounded wait fixed the test without weakening cursor, 100/103/102-item, account-isolation or persistence assertions. Controlled GREEN and three ordinary repeats passed. Original failures remain evidence.

This does not establish field p75/INP, cloud API/query p95, real image delivery, physical iOS/Android, assistive technology or named-role UAT. The synthetic guide has no cover; zero image bytes are not image-performance proof. Current serving production was independently observed at 586f2bb while merged main558 awaited a runtime release. No manual deployment or production SQL/configuration change is included.

## Field verification plan — not executed

The existing consent-gated TelemetryConsent collector reports LCP/INP/CLS only when its existing field flag and current user consent allow it. Keep it disabled until the release owner approves the exact serving SHA, privacy/retention configuration and the combined US$5 monthly operating limit. First verify decline/withdrawal and private/no-store behavior in the approved environment; then collect a bounded seven-day window, retain observation counts and missing values, and report p75 only when the owner-approved cohort has enough observations. Current payloads do not carry route/device/release segmentation; no segmented field claim may be made without a separately reviewed privacy-safe contract. No URLs, tokens, trip text or messages may enter measurements. Mailboxes, named actors and real devices remain external acceptance inputs.

Rollback: revert the route-loading changes and the new delivery-boundary regression if required; preserve all existing data, permissions, receipts and audits. No database rollback is needed for this source-only increment.
