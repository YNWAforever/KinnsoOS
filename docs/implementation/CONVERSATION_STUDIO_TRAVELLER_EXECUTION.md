# T1–T5 local example execution

Scope: the approved traveller slice in the existing loopback preview. Preserve C1–C5 and all original routes. No database migration, deployment, credentials, OAuth or provider connection.

Decisions:
- Conversation remains an entry layer; commands use the existing trip, bookmark, adoption, share and media client contracts.
- Optional injected example store only; no default production adapter or capability change.
- Structured guide adoption pins version and credit. Summary-only guides cannot invent stops.
- Private task briefs and immutable request intents live in isolated preview-session memory. Reload recovers the same UUIDs; a transport failure is unknown.
- Sharing requires selected public fields, per-image consent, a revision-bound confirmation, receipt readback and an anonymous local public read. Revocation requires a failed new public read. External copies cannot be recalled.
- T4 groups are private suggestions, not a new bookmark taxonomy. T5 uses a fixed self-authored sample image; real storage byte upload remains unverified.
- The existing plan and execution skills authorize inline implementation and one fresh final independent review. Existing user authorization covers this local-only slice.
- Graph discovery was attempted but timed out; exact known contract files were read as fallback. Local installed Next.js client-component guide read before edits.

Checklist:
- [x] Pure behavior tests fail before implementation, then pass.
- [x] T1 plan -> private brief -> original trip.
- [x] T2 bookmark -> exact guide snapshot -> adoption preserving notes/credit.
- [x] T3 public preview -> share -> anonymous read -> revoke.
- [x] T4 bookmark organization -> private brief -> explicit bookmark update.
- [x] T5 private notes/sample image -> finalize -> attach -> readback.
- [x] Existing trip/guide/bookmark routes usable in the preview.
- [x] Unknown outcomes, conflicts, source restriction, isolation and mobile coverage.
- [x] C1 and C2–C5 regression, typecheck, source archive and build.
- [x] Independent final review, fix actionable findings, targeted retest.
- [x] Same 3499 preview refreshed; acceptance report distinguishes verified and blocked.

Review outcomes: 5 P2, all addressed (cancel photo finalize on invalidation; memory-only preview cache plus reset/legacy clearing; pre-stage opaque recovery ID; remove withdrawn bookmarks; replay delete receipt before missing-trip check). Parent WorkroomShell also blocks invalidated-account remounts. Five targeted review cases pass; final traveller browser suite22/22, C2–C5 14/14, C1 regression pass. Journeys1321 pass/0 fail/1 Windows skip; typecheck pass. Final build/source/live refresh recorded in the acceptance evidence.

Original domain writer files, apps/web, SQL and deployment settings have no edits in this traveller slice. No provider connection or credential use.

Final live check: original3499 adopted the bookmarked guide, anonymously read the selected public projection, revoked the link and verified404. PID19904. Source archive636 entries with zero mismatch. See traveller evidence JSON for hashes/time.
