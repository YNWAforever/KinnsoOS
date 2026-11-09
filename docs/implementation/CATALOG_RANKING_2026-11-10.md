# Relevance-ranked catalogue search

**Status:** deployed and verified in production. App release 7ed4c83 (deployment dpl_GxJkeB9PGsRiqFQczbbphNdFiRQf), ledger **253** via two migrations.

## Change

Multi-word searches matched tokens but returned newest-first. A new anon-readable RPC `search_kinnso_catalog` tokenizes the query, requires a token match, and scores:

- per matched token: **title 15, city 8, summary 5, creator 3**
- **+5** when the guide is verified (attestation + source + place date, not synthetic)
- **+0.5 per save** (max 20), then recency

The first attempt scored one point per token regardless of field, so "family trip singapore" still tied and fell back to publication date; field weighting fixed the real case.

## Verification

Production, after applying both migrations:

| Query | Result order |
|---|---|
| family trip singapore | **Singapore with kids** → Bali family resorts |
| quiet temples weekend | **A quiet-temples weekend in Kyoto** → Chiang Mai |

Health 200. Locally the ranked RPC returns the Kyoto guide for "kyoto weekend", and the unit suite includes a ranked-path test plus a REST-fallback test.

## Limits

Heuristic field weighting, not semantic relevance (no synonyms or typos). Verified/saves boosts can outrank loosely related content. City filtering inside the RPC is exact; aliases keep the REST path. The studio assistant MCP search is unchanged.
