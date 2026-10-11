-- Orbit — migration 005: sequential 6-digit user number
-- Run after 004. Idempotent.

-- Create a sequence starting at 1
create sequence if not exists public.user_number_seq start 1;

-- Add the column
alter table public.profiles
  add column if not exists user_number integer;

-- Backfill existing users by order of creation
with ordered as (
  select id, row_number() over (order by created_at) as rn
  from public.profiles
)
update public.profiles p
set user_number = o.rn
from ordered o
where p.id = o.id and p.user_number is null;

-- Advance the sequence past existing numbers
select setval('public.user_number_seq', coalesce((select max(user_number) from public.profiles), 0));

-- Update the handle_new_user trigger to assign the next number
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, locale, user_number)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    case when new.raw_user_meta_data->>'locale' in ('zh-TW', 'en')
      then new.raw_user_meta_data->>'locale' else 'zh-TW' end,
    nextval('public.user_number_seq')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
