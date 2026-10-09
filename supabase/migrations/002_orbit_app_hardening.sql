-- ============================================================================
-- Orbit — migration 002: hardening for the native app release
-- ============================================================================
-- Run this AFTER supabase/schema.sql (migration 001) has been applied.
-- It is idempotent: safe to run more than once.
--
-- What it changes:
--   1. habit_logs.local_timezone — the app records the device timezone with
--      every check-in so a traveller's history does not silently shift dates.
--   2. delete_my_account() — lets a signed-in user delete their own auth
--      identity. Required for App Store guideline 5.1.1(v) and for the
--      "delete my account" button in the app.
--   3. Tightened INSERT policies so a client cannot forge user_id.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- 1. column --
alter table public.habit_logs
  add column if not exists local_timezone text not null default 'UTC';

comment on column public.habit_logs.local_timezone is
  'IANA timezone name of the device at check-in time, e.g. Asia/Taipei.';

-- ------------------------------------------------- 2. self-service deletion --
-- SECURITY DEFINER is required because deleting from auth.users is otherwise
-- not permitted for an authenticated role. The function only ever acts on
-- auth.uid(), so a caller cannot delete anyone else's account.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- habit_logs and habits are also removed by ON DELETE CASCADE, but being
  -- explicit keeps the intent obvious and releases rows before the identity.
  delete from public.habit_logs where user_id = uid;
  delete from public.habits    where user_id = uid;
  delete from public.profiles  where id = uid;

  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

comment on function public.delete_my_account() is
  'Deletes the calling user''s own data and auth identity. Called from the app Profile screen.';

-- ------------------------------------------- 3. stricter insert ownership --
-- The original policies used WITH CHECK (user_id = auth.uid()), which is
-- correct, but selecting the predicate through a subquery keeps it aligned
-- with the SELECT/UPDATE/DELETE policies and avoids re-planning per row.
drop policy if exists "habits_insert_own" on public.habits;
create policy "habits_insert_own" on public.habits for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "habit_logs_insert_own" on public.habit_logs;
create policy "habit_logs_insert_own" on public.habit_logs for insert to authenticated
with check (user_id = (select auth.uid()));

-- ------------------------------------------------------------------ verify --
-- Expect: one row per table, all with rowsecurity = true.
select relname as table_name, relrowsecurity as rls_enabled
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in ('profiles', 'habits', 'habit_logs')
order by relname;

-- Expect: the function exists and is owned by postgres.
select proname as function_name, prosecdef as security_definer
from pg_proc
where proname = 'delete_my_account';
