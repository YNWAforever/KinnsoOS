-- R8.2: constrain creator_social_handles.handle to a bare handle.
--
-- The column is plain `text` with no format constraint, and the write path is
-- the browser talking to PostgREST — so lib/onboarding/validateHandle.ts is
-- bypassable, and the scan worker does not re-validate despite that file's
-- comment saying it does. The handle is then sent verbatim to RapidAPI as
-- `username_or_url`, a field that accepts a full profile URL: a creator could
-- store "https://instagram.com/<someone-else>" and generate their DNA from a
-- stranger's content, or burn paid API calls on malformed values.
--
-- The pattern is the union of the three per-platform patterns the client
-- already enforces (instagram [A-Za-z0-9._], youtube adds '-', threads
-- [A-Za-z0-9_]), with the same 30-character ceiling. It admits every handle the
-- UI can produce while rejecting anything containing ':', '/', whitespace or an
-- '@' — i.e. anything that could be read as a URL.
--
-- NOT VALID deliberately: this enforces every INSERT and UPDATE from now on,
-- but does not scan pre-existing rows, so the migration cannot fail on unknown
-- production data. Once production handles are confirmed clean, this can be
-- promoted with:
--   alter table public.creator_social_handles
--     validate constraint creator_social_handles_handle_format;

alter table public.creator_social_handles
  drop constraint if exists creator_social_handles_handle_format;

alter table public.creator_social_handles
  add constraint creator_social_handles_handle_format
  check (handle ~ '^[A-Za-z0-9._-]{1,30}$') not valid;
