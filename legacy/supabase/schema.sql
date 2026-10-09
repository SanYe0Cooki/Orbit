-- Orbit v1 initial schema for Supabase PostgreSQL.
-- Apply in a development project first. RLS is mandatory; do not disable it.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  locale text not null default 'zh-TW' check (locale in ('zh-TW', 'en')),
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100),
  description text not null default '' check (char_length(description) <= 1000),
  icon text not null default 'sparkles' check (char_length(icon) <= 40),
  color text not null default 'sage' check (char_length(color) <= 24),
  schedule_days smallint[] not null default array[0,1,2,3,4,5,6]::smallint[],
  target_count smallint not null default 1 check (target_count between 1 and 100),
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint habits_schedule_days_valid check (
    cardinality(schedule_days) between 1 and 7
    and schedule_days <@ array[0,1,2,3,4,5,6]::smallint[]
  )
);

create index if not exists habits_user_status_idx
  on public.habits(user_id, status, created_at desc);

create table if not exists public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  habit_id uuid not null references public.habits(id) on delete cascade,
  local_date date not null,
  completed_count smallint not null default 1 check (completed_count between 0 and 100),
  note text not null default '' check (char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint habit_logs_one_per_habit_day unique (habit_id, local_date)
);

create index if not exists habit_logs_user_date_idx
  on public.habit_logs(user_id, local_date desc);
create index if not exists habit_logs_habit_date_idx
  on public.habit_logs(habit_id, local_date desc);

-- Ensure a log's user owns its habit even if a client submits mismatched IDs.
create or replace function public.enforce_habit_log_owner()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (
    select 1 from public.habits h
    where h.id = new.habit_id and h.user_id = new.user_id
  ) then
    raise exception 'habit does not belong to user';
  end if;
  return new;
end;
$$;

drop trigger if exists habit_logs_owner_guard on public.habit_logs;
create trigger habit_logs_owner_guard
before insert or update of user_id, habit_id on public.habit_logs
for each row execute function public.enforce_habit_log_owner();

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
drop trigger if exists habits_updated_at on public.habits;
create trigger habits_updated_at before update on public.habits
for each row execute function public.set_updated_at();
drop trigger if exists habit_logs_updated_at on public.habit_logs;
create trigger habit_logs_updated_at before update on public.habit_logs
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated
using (id = (select auth.uid()));
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert to authenticated
with check (id = (select auth.uid()));
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated
using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists "habits_select_own" on public.habits;
create policy "habits_select_own" on public.habits for select to authenticated
using (user_id = (select auth.uid()));
drop policy if exists "habits_insert_own" on public.habits;
create policy "habits_insert_own" on public.habits for insert to authenticated
with check (user_id = (select auth.uid()));
drop policy if exists "habits_update_own" on public.habits;
create policy "habits_update_own" on public.habits for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "habits_delete_own" on public.habits;
create policy "habits_delete_own" on public.habits for delete to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "habit_logs_select_own" on public.habit_logs;
create policy "habit_logs_select_own" on public.habit_logs for select to authenticated
using (user_id = (select auth.uid()));
drop policy if exists "habit_logs_insert_own" on public.habit_logs;
create policy "habit_logs_insert_own" on public.habit_logs for insert to authenticated
with check (user_id = (select auth.uid()));
drop policy if exists "habit_logs_update_own" on public.habit_logs;
create policy "habit_logs_update_own" on public.habit_logs for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "habit_logs_delete_own" on public.habit_logs;
create policy "habit_logs_delete_own" on public.habit_logs for delete to authenticated
using (user_id = (select auth.uid()));

-- Create profile rows from Supabase Auth sign-ups. Test this trigger in staging
-- before enabling production sign-ups.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, locale)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    case when new.raw_user_meta_data->>'locale' in ('zh-TW', 'en')
      then new.raw_user_meta_data->>'locale' else 'zh-TW' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

-- NOTE: Supabase service-role keys bypass RLS and must never be placed in browser code.
