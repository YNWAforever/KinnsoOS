-- create_booking_settlement_on_confirm() is a trigger-return-type function (only
-- invocable as a trigger; Postgres itself rejects a direct RPC call to it with
-- "trigger functions can only be called as triggers"), but this project's default
-- privileges still auto-grant EXECUTE on it to anon/authenticated like any other new
-- function, which the security advisor correctly flags. Not live-exploitable (the
-- trigger return type blocks direct invocation), but every other SECURITY DEFINER
-- function in this codebase gets an explicit named revoke -- this one shouldn't be
-- the exception. No corresponding `grant ... to authenticated` is added, unlike the
-- callable RPCs in this plan -- nothing legitimate ever calls this function directly.
revoke all on function public.create_booking_settlement_on_confirm() from public, anon, authenticated;
