-- Fix for a real bug caught by Task 4's code-quality review: saveGuideAction/
-- saveExperienceAction call .upsert(..., { onConflict: '...' }), which compiles to
-- INSERT ... ON CONFLICT DO UPDATE. Postgres requires UPDATE privilege on the target
-- table for this statement shape regardless of whether a conflict actually fires at
-- runtime -- the prior migration (20260706090000) only granted select/insert/delete to
-- authenticated, so every real save would fail with a permission-denied error despite
-- passing mocked unit tests. merchant_saved_creators' identical upsert pattern already
-- grants update, confirming the omission was an inconsistency, not a deliberate choice.

grant update on public.guide_saves to authenticated;
grant update on public.experience_saves to authenticated;
