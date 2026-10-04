-- Revokes the blanket UPDATE grant that 20260706093000 added to
-- guide_saves/experience_saves. That fix was itself wrong: the owner-scoped
-- RLS policies (guide_saves_owner_all / experience_saves_owner_all) only pin
-- traveler_user_id, never guide_id/experience_id, and the count-sync triggers
-- only fire on INSERT/DELETE, never UPDATE. A blanket UPDATE grant therefore
-- let any authenticated traveller call the REST API directly (bypassing the
-- Next.js server actions) to INSERT a save, UPDATE its guide_id/experience_id
-- to a different target (RLS permits it -- traveler_user_id is unchanged, and
-- no trigger fires to correct either row's saves_count), then DELETE it --
-- inflating one row's saves_count without bound and without a matching
-- decrement anywhere.
--
-- The real fix is in the app layer: saveGuideAction/saveExperienceAction now
-- call `.upsert(..., { onConflict, ignoreDuplicates: true })`, which compiles
-- to `INSERT ... ON CONFLICT DO NOTHING` and needs no UPDATE privilege at all.
-- So the grant this migration removes is no longer needed for any legitimate
-- caller.

revoke update on public.guide_saves from authenticated;
revoke update on public.experience_saves from authenticated;
