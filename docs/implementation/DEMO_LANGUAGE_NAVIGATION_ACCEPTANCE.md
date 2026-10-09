# Explicit demo language navigation

N13 remains PARTIAL. Code commit `77b6859693b3bc1e6c3fdecd372e9a1d1943c4ac` fixes a reproduced demo navigation defect from main `29aecea6827fb5ce635e6385f2243ef3ca12dd14`.

Switching language on `/en/demo/explore?q=Kyoto&page=2` previously targeted `/zh-HK/explore?q=Kyoto&page=2`. The explicit demo segment was lost. Demo guide slugs similarly moved to the public account-service route and could become unavailable. The language link now retains the existing mode segment, route and query. Connected language targets are unchanged. The cream/green layout, existing three primary navigation items and all Auth/draft/RPC ownership/revision/idempotency/cache boundaries are retained.

Four actual browser cases reproduced the missing segment, then passed at the clean code commit. Both directions cover exploration and the existing labelled demo guide, keyboard activation, document language, real back/forward and readable guide content. Browser account API requests remain zero; the cases create no Auth/database fixture. These results validate explicit-demo navigation, not traveller persistence, content rights, real mail delivery or production roles.

Full current-code339 unit tests, build and typecheck PASS. Windows source-package5PASS/1symlink-permissionSKIP remains separate. The four cases are added to the existing connected CI collection without changing its target, retries, timeout or original test matches. The explicit corresponding-source manifest now includes318 unique files, with the new browser regression; private packs, credentials, reports and audit material remain excluded.

Before merge, current review-head Root/Journeys checks, Linux6 source-package/extracted rebuild and actual isolated connected browser evidence must be independently verified. Native author review is weaker than the configured independent review. N13/N14 physical devices, actual200% text settings, NVDA/VoiceOver, named hosted roles and author-verified content-language metadata remain NOT_RUN.

Rollback: revert this language-link change, its additional CI test match and manifest entry. Existing demo data, device drafts, account trips, versions, receipts and SQL history are preserved. No schema/configuration operation is needed.
