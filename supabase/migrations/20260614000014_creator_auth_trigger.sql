-- SP2 1a: bootstrap a creators row for every new Supabase auth user.
-- SECURITY DEFINER is required: the trigger fires in the auth schema context,
-- and `authenticated` role cannot insert into public.creators (no INSERT policy).
-- ON CONFLICT ensures idempotency if the trigger fires more than once.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.creators (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
