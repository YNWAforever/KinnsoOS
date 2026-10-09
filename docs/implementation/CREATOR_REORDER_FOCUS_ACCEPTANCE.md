# Creator reorder focus acceptance

When an author moves a day or stop and immediately selects another field, a delayed focus callback could move typing into the moved item's title. The editor keeps its normal keyboard focus transfer while the author remains on the initiating control, including when that control becomes disabled and the browser returns focus to the document body. Explicitly choosing a different field takes precedence.

Code commit: `657fedfdda8ce90f819cae8d416f3c1c057559a5`. Existing save acknowledgements, draft revisions, idempotency, Undo, account invalidation and authored stop identity remain unchanged.

The main workflow [37811689185](https://github.com/YNWAforever/KinnsoOS/actions/runs/37811689185) retained its actual333 unit/41 integration PASS and83 browser PASS/1 FAIL/0 SKIP. Its failed held-save case showed the new Guide title text in Day title. The normal-focus component controls pass, both controlled next-field choices reproduce RED, and all8 focused component cases pass after the guard. The existing held-save/publication/keyboard assertions were preserved.

At the clean code commit,337 unit tests, build and typecheck pass with0 unit fail/skip. Windows source-package has5 PASS/1 symlink-permission SKIP. The owned local API port is currently excluded by Windows, so local connected browser/RPC runs are blocked during setup; those failures are not product RED or acceptance PASS. No global networking setting was changed.

Two actual-browser cases hold the reorder frame, explicitly select Guide title, then release the frame. They check focus, subsequent typing, the owned RPC snapshot, original day/stop content and reload. Exact review-head isolated connected CI, including the existing save regressions, is required before merge. Linux packaging covers the separately retained Windows skip.

N06/N18 remain partial. Hosted named-role/mail/content/device/assistive-technology acceptance and the editing-draft SQL gate remain separate. This change does not authorize production data/provider/settings changes or a manual deployment.

## Disabled-control correction

The first PR41 isolated connected runs retained85 browser PASS/1 FAIL/0 SKIP. The existing keyboard test caught a regression when moving a stop to the last position disabled its initiating button. The held-save and both explicit-next-field cases passed in that attempt. The failed evidence remains retained.

Correction code: `7afab2e856d8500bf4e2f78c8dcc8b4851c4f360`. Two actual-component cases reproduced this boundary (8 PASS/2 RED), then all10 focused cases passed. At the clean correction code SHA,339 unit/build/typecheck PASS with0 unit fail/skip; Windows source-package5 PASS/1 permission SKIP. Local connected setup remains blocked; fresh isolated CI at the corrected review head is required before merge. Existing keyboard, held-save, publication, ownership and reload assertions remain unchanged.

## Deletion and Undo focus

Keyboard activation of Delete day or Delete stop removed the focused control and left focus on the document body. Undo also removed its own focused button without returning the author to the restored item. The editor now offers focus on Undo after deletion and returns to the original restored day or stop title after Undo. The existing session-local item key identifies duplicate titles, stays out of saved payloads and published snapshots, and is kept through save acknowledgements. An explicitly chosen next field takes precedence over a delayed callback; a closed editor cannot transfer focus.

Code commit: `f9c62f8f2446d2a7af1a90cc1d125579be823f71`. Four English/Traditional Chinese browser cases reproduce the missing deletion focus before implementation, then pass the deletion, Undo, typing, persisted RPC snapshot and reload checks. Two delayed-frame cases verify that choosing Guide title keeps subsequent typing there and saves the correct remaining source offsets/stops. All17 creator cases plus those2 cases pass against the owned isolated local API `http://127.0.0.1:58421`; all fixtures are synthetic local-only.

Clean-code339 unit/build/typecheck PASS. Windows source-package5PASS/1 symlink-permission SKIP remains recorded. Initial local API-listener and disabled-profile setup failures are separate environment evidence, not product RED or acceptance passes. Only the positively identified existing local gateway was restarted; the established capability profile was set for the local test process. Current review-head Linux packaging, full connected CI and configured review are required before merge.

N06/N14 remain partial. Named hosted creator/content/mailbox, real iOS/Android, 200% text and NVDA/VoiceOver acceptance are NOT_RUN. No schema/provider/production-settings/flags/payment changes or manual deployment are part of this increment. Rollback is a revert of this UI/test increment; existing stored drafts and published versions need no data rollback.
