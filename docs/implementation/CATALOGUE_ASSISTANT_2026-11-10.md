# Grounded catalogue assistant

**Status:** deployed and verified in production. Release `1c52191`, deployment `dpl_7R3jPQBe8vetcn6e2qXR3BZLfnFK`, ledger unchanged at 251.

## What shipped

`/{locale}/assistant` — a signed-in, one-shot assistant for the published catalogue:

- asks the existing MCP catalogue search for published guides;
- answers **only from those rows**, citing guide titles, and returns them as linked source cards;
- reserves one turn from the hourly chat budget (30/h production) and returns a 429 with reset time when exhausted;
- falls back to a plain catalogue result labelled “model not configured” if the model is unavailable;
- stores nothing: no threads, no history, no memory.

## Verification

- **Local 7/7**: guest CTA, anonymous 401, grounded answer with 3 linked sources, model/budget line, empty query answers honestly with zero sources. Acceptance caught that catalogue search matches substrings, not questions; the endpoint now retries with the question's meaningful words and merges by guide id.
- **Production** (verification traveller): “Which guide is good for a family trip to Singapore?” answered with the Singapore family guide, **2 source cards** linking to `/zh-HK/g/30d760a5-…`, model line `deepseek-v4.1-flash · 1/30 turns this hour`.

## Honest limits

Generated answers can still misstate details — the source cards are the verifiable output. Signed-in only to bound cost; no memory; cannot book, charge or confirm availability; the budget is shared with the studio chat for that account.
