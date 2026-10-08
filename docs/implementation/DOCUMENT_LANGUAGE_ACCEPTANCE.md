# Document language navigation checkpoint

N13/N14 remains PARTIAL. Source `76114b6998818f274a2213a4c962761aec44ce71` fixes a confirmed language-navigation defect from main `093c93799fa93c4e297f917fba311d9bb12d1952`; original18 N IDs/53 requirement mappings remain unchanged.

With real client navigation, the interface and URL switched between English and zh-HK but the shared root layout retained its initial `<html lang>`. Both directions failed the browser regression. A root client component now synchronizes the document language from the committed supported pathname. Initial server language remains correct; unsupported paths do not invent a locale. Existing cream/green layout and draft/Auth/account/RPC/ownership/revision/idempotency/private-cache boundaries are unchanged.

Actual RED→GREEN covers both directions, keyboard activation, browser back/forward, the same browser document, preserved query/route, and unchanged original author wording. Synthetic catalog display data proves UI behavior only; no real authored-language metadata, author verification, mail delivery or production role result is claimed. The corresponding-source manifest explicitly includes the new component and has317 unique reviewed files; private packs/evidence remain excluded.

Exact clean source333unit/41integration/84connected browser PASS,0fail0skip; build/typecheck PASS. Native Windows source-package5PASS/1symlink-permissionSKIP remains separate from required exact-review-head Linux6/extracted install/build/typecheck and root/Journeys/Vercel merge gates. Native author review is weaker than independent review; original failed/skipped evidence is preserved.

Physical iOS/Android, actual200% settings, NVDA/VoiceOver versions, named hosted role UAT and rights-reviewed real content remain NOT_RUN. The app locale does not declare or translate an author's content language; that metadata is unavailable in the current DTO.

Rollback: revert the isolated root-language component/import and its manifest entry; retain existing data, drafts, sessions, source versions, receipts and SQL history. No database operation is required for this source rollback.
