-- ============================================================================
-- Orbit — migration 003: auto-confirm email on sign-up
-- ============================================================================
-- Run this AFTER migration 002. It is idempotent.
--
-- What it does:
--   1. BEFORE INSERT trigger on auth.users that sets email_confirmed_at = now()
--      for every new sign-up, so Supabase returns a session immediately and
--      no confirmation email is ever sent.
--   2. One-time UPDATE to confirm every existing user who is still stuck at
--      email_confirmed_at IS NULL (e.g. three88leaves@gmail.com).
--
-- Why this instead of toggling "Confirm email" in the dashboard:
--   The dashboard toggle works too, but the trigger below is committed to
--   version control and survives project refreshes. It achieves the same
--   result: new users are treated as confirmed the moment they sign up.
-- ============================================================================

-- ------------------------------------------------- 1. auto-confirm trigger --
create or replace function public.auto_confirm_new_user()
returns trigger
language plpgsql
security definer
set search_path = auth, public
as $$
begin
  -- Only fill in the timestamp when Supabase would otherwise leave it NULL.
  -- Users who signed up via an email link already have email_confirmed_at set;
  -- we never overwrite that.
  if new.email_confirmed_at is null then
    new.email_confirmed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists auto_confirm_new_user on auth.users;
create trigger auto_confirm_new_user
before insert on auth.users
for each row execute function public.auto_confirm_new_user();

comment on function public.auto_confirm_new_user() is
  'Auto-confirms every new sign-up so Orbit does not require an email round-trip.';

-- --------------------------------------- 2. fix existing unconfirmed users --
-- Run once. After this, every account that already exists can sign in with
-- email + password without clicking any link.
update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now())
where email_confirmed_at is null;

-- ------------------------------------------------------------------ verify --
-- Expect: every row in auth.users has a non-null email_confirmed_at.
select
  count(*) as total_users,
  count(email_confirmed_at) as confirmed_users
from auth.users;
