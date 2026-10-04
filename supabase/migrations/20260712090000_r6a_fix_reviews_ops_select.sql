-- Fix for R6A: reviews had no ops-gated SELECT policy at all. reviews_ops_update lets an
-- active ops member UPDATE any review's status (using/with check both is_active_ops()), but
-- with no SELECT policy granting ops visibility into non-published/non-own reviews, hiding a
-- published review makes the resulting row invisible to the very ops caller who just hid it --
-- and Postgres enforces SELECT-policy visibility on UPDATE ... RETURNING, raising "new row
-- violates row-level security policy for table reviews" instead of returning the updated row.
-- Confirmed via a live, isolated RLS reproduction (temp table, same policy shape) before writing
-- this fix: an UPDATE policy with using/with_check both true still fails RETURNING when no
-- SELECT policy makes the post-update row visible; adding an is_active_ops()-gated SELECT
-- policy resolves it. This also gives ops the ability to see hidden/moderated reviews at all,
-- which they need for moderation regardless of this specific RETURNING-visibility bug.

create policy reviews_ops_select on public.reviews
  for select to authenticated
  using (public.is_active_ops());
