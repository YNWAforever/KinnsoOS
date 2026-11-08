# Pilot Control Room — PR #115 main merge remediation

**BLOCKED_EXTERNAL_VALIDATION. Production unchanged; deployment unverified. Public launch HOLD. Backup/restore waived.**

Tested commit `5ccab1e3cb108619681f2eaa2acfdcc2777ce326`, tree `f3149c839ce8427b0066a8a3c9da54f3daec4df7`, default Journeys build `nqKrCkw2NrvTqQaLUsN_Y`. The branch retains the two-parent merge `0e11273cd38a30894fdb27806d638ef7f26e5fca`. The remediation restores public summary planning and bookmark recovery, corrects synthetic fixtures and local target configuration, and retains the original product and security assertions.

| Check | Result |
|---|---|
| Exact connected Chromium | 384 passed, 0 failed, 0 skipped, 0 not run; 384 selected; 2 pilot cases passed; identity verified: True; fresh server/target, no retries or reuse |
| Hosted CI-only share recovery | 2 blocked; excluded from local execution and never counted as passes |
| Focused browser | 47 passed, 0 failed, 0 skipped, 0 not run |
| Journeys unit | 1978 passed, 0 failed, 2 skipped |
| Full web | 3316 passed, 0 failed, 44 skipped |
| Root and workspace tests | 110 passed, 0 failed, 2 skipped; 427 workspace tests passed |
| Typecheck, Journeys build and source package | unit=0 typecheck=0 package=0; source package 11 passed and 1 Windows symlink skip; 921 inputs |
| Web build | Default Turbopack rejected a Windows pnpm junction; supported Webpack: webWebpack=0 on unchanged web and shared dependency inputs |
| Database | 234 migrations through `20261108134500`; 74 passed, 0 failed, 0 skipped integrations; 68 advisor warnings |
| Native, Studio transport, presentation | 152 passed, 0 failed, 0 skipped, 0 not run; 13 passed, 0 failed, 0 skipped, 0 not run; 77 passed, 0 failed, 0 skipped, 0 not run |
| Cleanup | 0 residue across 44 tables; 0 across 25 additional tables; Storage 0; Auth restored: True; no reset after final browser execution |

The RLS advisor policy is byte-identical on main `cb35e38`. This remediation keeps the 234 migration chain unchanged. The default Web failure is isolated by the exact Turbopack panic log and the Windows junction readback; the Next configuration is identical to main. The two hosted cases require an owned GitHub Actions stack on port 58421 and cannot run against the local pilot target.

| Artifact | SHA-256 | Byte basis |
|---|---|---|
| Runtime source ZIP | `ae90c713c3379404a44baeda494d49162d620d3a1eba40798b5e95c479d3b8e0` | Saved ZIP bytes; exact build checkout members |
| Canonical source ZIP | `8adb28cd4a207060ad879bbb58799db097939390f7ea0416252ee760417e1a71` | Saved ZIP bytes; exact Git blob members |
| Git tree ZIP | `3471a8bc57c5acf918b20585e223f2c83f0a7531a4d832d279b7e79bd5306af6` | Exact Git archive bytes |
| Migration ZIP | `b5ba7d77735a9f38831b5fc61bab7b0f6ae4f5f5ec7342d111d5d7f2ec8fd4d2` | Exact Git archive bytes |
| Manifest | `6cf0fc2f6f69b4b9477f645405ed4a8855460d3bd62780f625bd77fb7af1c7af` | Exact Git blob |
| All migrations | `51f2b32fc36c45ec60c9a6f028e34bd22c57c4d461fd63cf297b281ac2750786` | Version, name and SHA-256 separated by spaces, LF per row |

Open evidence gates: hostedShareRecovery. Real participation, physical devices and assistive technology remain blocked. Nothing was pushed, deployed or changed in production.

## Original 386-case failure ledger

Original exact merge run: 349 passed, 36 failed, one did not run. Cases 1–35 passed in the corrected 47-case focused run. Cases 36–37 remain hosted-CI only.

| # | Test | First observed cause |
|---|---|---|
| 1 | agent-workspace.spec.ts:23:1 › owned source-only trip preview requires explicit confirmation, saves once, rejects stale CAS and denies another actor | Global network-idle wait timed out after sign-in; the local runner also lacked CI’s canonical source origin. |
| 2 | public-creator.spec.ts:8:1 › real public creator SSR and hydration show bounded published guides; withdrawing the profile removes public content | Correct page-two DOM, but the page-one public content remained in the original RSC hydration payload. Check active DOM and fresh page-two HTML separately. |
| 3 | seo-migration.spec.ts:25:1 › published summary with a legacy database UUID survives API, SSR and hydration while owner drafts remain absent | Synthetic author lacked a handle and public profile required by the merged public reader. The summary SSR lacked the language notice and its new client action hydrates through the session request. |
| 4 | seo-migration.spec.ts:63:1 › authored published guide renders without JavaScript; withdrawing versions removes structured adoption and preserves the published summary | Synthetic author lacked a handle and public profile required by the merged public reader. After withdrawing versions, the native summary omitted its no-structured-itinerary guidance. |
| 5 | u01-guide-import.spec.ts:40:1 › late trip creation acknowledgement cannot replace a different open trip  | Readiness: global networkidle after released mutation response |
| 6 | u01-guide-import.spec.ts:57:1 › late trip deletion acknowledgement cannot close a different open trip  | Readiness: global networkidle after released mutation response |
| 7 | u01-guide-import.spec.ts:72:1 › late trip creation acknowledgement cannot navigate an invalidated account tab  | Readiness: global networkidle after released mutation response |
| 8 | u01-guide-import.spec.ts:140:1 › guide picker reaches a third page and persists adoption with private notes retained | Synthetic author lacked a handle and public profile required by the merged public reader. |
| 9 | u01-guide-import.spec.ts:162:1 › guide picker page failure retains selection and retries the same cursor once | Synthetic author lacked a handle and public profile required by the merged public reader. |
| 10 | u01-guide-import.spec.ts:172:1 › guide picker late page cannot append the previous account options | Synthetic author lacked a handle and public profile required by the merged public reader. |
| 11 | u01-guide-import.spec.ts:191:1 › guide bookmark status failure stays unknown and retries the real saved state | Synthetic author lacked a handle and public profile required by the merged public reader. Native summary treated read failure as an unconfirmed write; restored status-only retry. |
| 12 | u01-guide-import.spec.ts:195:42 › guide bookmark delayed status cannot overwrite acknowledged save | Synthetic author lacked a handle and public profile required by the merged public reader. Native summary blocked the resumed save on its held status response; generation and ticket checks now reject stale reads. |
| 13 | u01-guide-import.spec.ts:195:42 › guide bookmark delayed status cannot overwrite acknowledged removal | Synthetic author lacked a handle and public profile required by the merged public reader. Native summary blocked resumed save and therefore the removal; a stale status read no longer owns mutation state. |
| 14 | u01-guide-import.spec.ts:203:1 › guide bookmark lost acknowledgement retries the original committed intent | Synthetic author lacked a handle and public profile required by the merged public reader. Exact request ID and desired state remain pending until the write is acknowledged. |
| 15 | u01-guide-import.spec.ts:207:1 › bookmark pagination crosses100 tied timestamps and older guide remains saved | Synthetic author lacked a handle and public profile required by the merged public reader. |
| 16 | u01-guide-import.spec.ts:223:1 › bookmark pagination late page cannot append the previous account bookmarks | Global network-idle wait timed out after releasing the held bookmark page; wait for delivery/render and verify account isolation. |
| 17 | u01-guide-import.spec.ts:228:36 › guide original text and unknown metadata en | Synthetic author lacked a handle and public profile required by the merged public reader. Native summary was missing original-text and unknown metadata notices. |
| 18 | u01-guide-import.spec.ts:228:36 › guide original text and unknown metadata zh-HK | Synthetic author lacked a handle and public profile required by the merged public reader. Native summary was missing original-text and unknown metadata notices. |
| 19 | u01-guide-import.spec.ts:236:1 › anonymous bookmark returns once; summary never offers invented itinerary | Synthetic author lacked a handle and public profile required by the merged public reader. Restore summary-only guidance; sign-in is a semantic link, and bookmark remains exactly once. |
| 20 | u01-guide-import.spec.ts:237:1 › saved guest copy survives reload, a new guide version and cancelled sign-in before explicit import | Synthetic author lacked a handle and public profile required by the merged public reader. |
| 21 | u01-guide-import.spec.ts:273:1 › a saved device draft can be repaired anonymously and after sign-in when its source is withdrawn | Synthetic author lacked a handle and public profile required by the merged public reader. |
| 22 | u01-guide-import.spec.ts:295:50 › device repair retains unsaved notes through account invalidation and a failed save | Synthetic author lacked a handle and public profile required by the merged public reader. |
| 23 | u01-guide-import.spec.ts:295:50 › device repair retains pending-save notes through account invalidation and a failed save | Synthetic author lacked a handle and public profile required by the merged public reader. |
| 24 | u01-guide-import.spec.ts:326:1 › large bounded device notes save and reload while the account import size gate stays closed | Synthetic author lacked a handle and public profile required by the merged public reader. |
| 25 | u01-guide-import.spec.ts:342:1 › guest edits import once, original stays, server adoption has real source, second context conflicts without losing input | Synthetic author lacked a handle and public profile required by the merged public reader. |
| 26 | u01-guide-import.spec.ts:349:1 › published v2 is reviewed before appending; conflict requires review and lost response replays once | Synthetic author lacked a handle and public profile required by the merged public reader. |
| 27 | u01-guide-import.spec.ts:372:36 › summary inspiration leads to manual trip planning (en) | Synthetic author lacked a handle and public profile required by the merged public reader. Main’s native summary lacked the manual trip-planning link. |
| 28 | u01-guide-import.spec.ts:372:36 › summary inspiration leads to manual trip planning (zh-HK) | Synthetic author lacked a handle and public profile required by the merged public reader. Main’s native summary lacked the manual trip-planning link. |
| 29 | u02-photo-lifetime.spec.ts:57:2 › cancel en upload after prepare preserves the file and retries one owned photo  | Media: client rejects verified 59721 loopback gateway before PUT |
| 30 | u02-photo-lifetime.spec.ts:57:2 › cancel en upload after bytes preserves the file and retries one owned photo  | Media: client rejects verified 59721 loopback gateway before PUT |
| 31 | u02-photo-lifetime.spec.ts:57:2 › cancel zh-HK upload after prepare preserves the file and retries one owned photo  | Media: client rejects verified 59721 loopback gateway before PUT |
| 32 | u02-photo-lifetime.spec.ts:57:2 › cancel zh-HK upload after bytes preserves the file and retries one owned photo  | Media: client rejects verified 59721 loopback gateway before PUT |
| 33 | u02-travel-share.spec.ts:6:1 › private photo persists, anonymous readonly share excludes notes and media stops after revoke | The browser denied the approved local upload gateway before PUT. After fixing it, the runner needed an ephemeral receipt key and the test needed to recover the same durable URL before revoking. |
| 34 | u04-merchant-invitations.spec.ts:18:1 › U04 invitation is persisted once, privately reviewed/cancelled, accepted once and revoked membership loses same-session access | The server-rendered control could look enabled before the live membership reads finished; this recurred in the first 384-case run. Wait for the confirmed clerk membership and workspace responses, then require the same-session refresh to return 403 and clear controls. Scope the localized recipient field to the visible textbox. |
| 35 | u06-role-bundle.spec.ts:137:1 › U06 deferred role panels retain server headings, language and private cache after local sign-in | Global network-idle wait and Chromium eviction of response bodies across navigation. Capture the browser-observed immutable chunk URLs and read their exact bytes independently; preserve all route, language, cache and bundle assertions. |
| 36 | u23-share-receipt-recovery.spec.ts:17:45 › PD06 durable lost-ACK share recovers the same URL in a second authenticated context: en  | Target gate: requires fresh owned GitHub Actions CI stack on 58421; local run is not eligible |
| 37 | u23-share-receipt-recovery.spec.ts: PD06 zh-HK | Did not run after the same beforeAll target gate failed for English. |
