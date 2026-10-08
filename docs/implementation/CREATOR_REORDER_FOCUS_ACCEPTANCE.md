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
