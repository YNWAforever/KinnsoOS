-- R8.2: stop guide owners from writing the denormalized save counter.
--
-- 20260619000001 granted table-wide UPDATE on public.guides to `authenticated`
-- with no column list, so `guides_owner_update` let a creator set
-- `saves_count` directly. That column's source of truth is the guide_saves
-- trigger (20260706090000) — R7.3 even had to repair historical drift in it —
-- and it drives public "most saved" ordering and admin leaderboards.
--
-- Narrow the grant to the columns updateGuideAction actually writes, mirroring
-- the merchant_profiles and creators precedents. INSERT/DELETE are unchanged:
-- both are already constrained by the owner policies, and the insert path sets
-- identity columns (creator_id/slug/creator_handle) that must stay writable.

revoke update on public.guides from authenticated;
grant update (
  title, summary, cover_url, city, status, published_at, updated_at
) on public.guides to authenticated;
