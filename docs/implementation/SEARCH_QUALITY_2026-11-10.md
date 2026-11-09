# Multi-word catalogue search

**Status:** deployed and verified in production. Release `1c58db2`, deployment `dpl_8ixXgBsKkWtXntox6NDGonFXdQpE`, database unchanged (ledger 251).

## Problem

Catalogue search passed the whole query as one substring: “quiet temples weekend” returned nothing, while the exact phrase did. Natural searches were effectively broken.

## Change

Queries with two or more meaningful words are split (English stopwords removed, at most five tokens) and matched across title, city and summary. Single-word behaviour and place aliases are unchanged. The PostgREST filter builder still quotes values and cannot alter published status; the security test now asserts the sanitized clause shape and that no `eq.` syntax leaks.

## Verification

- Local API: “quiet temples weekend” → the Kyoto guide; single-word and city filters unchanged; explore page rendered the result in a real browser; full unit suite green (2037 pass / 2 skip).
- Production API: “family trip singapore” → Bali family guide **and** “Singapore with kids: the stroller-friendly route”; “quiet temples weekend” → the Kyoto guide; “kyoto” unchanged. Health 200 on the promoted deployment.

## Limits

Any-word matching improves recall but is not relevance-scored, so a generic token can surface loosely related guides. It remains substring search: no stemming, synonyms or typo tolerance. The studio assistant's MCP search RPC was not changed.
