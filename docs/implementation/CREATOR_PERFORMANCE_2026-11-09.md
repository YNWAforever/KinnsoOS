# Creator guide activity (Phase 6, first slice)

**Status:** deployed and verified in production. Release `3063ac4`, ledger **248 → 249**, deployment `dpl_JAaCBu8ci7A6J9ge7uJksNreJScY`.

## 1. Why

Creators had no view of how their catalogue is doing. The product already records some activity (guide saves, creator contribution events) but nothing surfaced it. This slice adds an honest activity panel: aggregates for the creator's own guides only, with explicit small-sample caveats, and no invented metrics.

## 2. Delivered

**Migration `20261109200000_creator_performance.sql`**
`kinnso_creator_guide_performance()` — creator-required, own guides only, aggregate-only:
per guide `{id,title,status,synthetic,verified,saves,saves30d,contributions,points}` plus totals and honesty notes. `verified` uses the same derivation as the public badge (attestation + source + place date, not synthetic, published). No traveller identities are exposed.

**API** `GET /api/creator/performance` — creator session required; 401 anonymous, 403 non-creator.

**UI** `CreatorPerformance` panel on the studio home: totals line, per-guide table with verified/sample/unverified chip, saves, last-30-day saves, contributions and points, and the notes:
- counts are aggregates for your own guides only;
- saves are bookmarks, contributions are your creator events, and **traveller analytics is not yet populated, so view metrics are deliberately not reported** rather than shown as zero;
- small numbers are activity, not performance.

## 3. Local verification (10/10)

anonymous 401 · non-creator 403 · creator receives 3 guides with true verified flags · per-guide saves and 30-day saves · per-guide contributions/points · totals sum correctly · honesty notes present · studio panel renders 3 rows · totals text renders · no leaked identities.

Seeded local-only rows (2 saves, 2 contribution events) were used to prove aggregation; production has its own real rows.

## 4. Production verification (as the KinnsoOS Editorial creator)

- anonymous `/api/creator/performance` → **401**
- creator API → **200**: **8 guides, 8 verified, 1 save, 0 contributions / 0 points**
- studio panel → **1 panel, 8 rows**, totals text 「8 篇攻略 · 8 篇已核實 · 1 次收藏 · 0 項貢獻（0 分）」

The 0 contributions are honest: the seeded contribution events belong to the original persona creator ids, not the editorial identity that now owns the guides.

## 5. Limits

- Traveller analytics (`traveller_analytics_events`) is empty in production, so views are absent rather than zero — reported explicitly.
- No time-series, no per-day chart, no conversion/funnel; adds would need populated analytics and a product definition of a "view".
- Attribution change (guides now owned by KinnsoOS Editorial) means historical contribution events do not transfer; the panel says nothing it cannot support.
