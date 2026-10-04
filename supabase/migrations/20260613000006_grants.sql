-- Hosted Supabase auto-grants table/function privileges to the API roles
-- (anon / authenticated / service_role) via default privileges, but a clean
-- Postgres (local `supabase start`, CI) does NOT. Grant them explicitly so the
-- schema is portable. RLS still governs row-level visibility for anon/
-- authenticated; service_role (the Plan 2 sync) bypasses RLS but still needs
-- table-level grants.
grant usage on schema public to anon, authenticated, service_role;

-- Public read-model: anon/authenticated may SELECT; RLS filters rows.
grant select on
  public.articles,
  public.article_translations,
  public.article_authors,
  public.article_faqs,
  public.article_tags,
  public.article_tag_translations,
  public.article_tag_map,
  public.seo_redirects
to anon, authenticated;

-- service_role is the admin / sync role (Plan 2): full DML + function execute.
grant all on all tables in schema public to service_role;
grant execute on function public.increment_article_view(text) to service_role;
grant execute on function public.get_you_may_like(uuid, text, int) to service_role;

-- Future tables/functions created by the migration owner inherit service_role grants.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant execute on functions to service_role;
