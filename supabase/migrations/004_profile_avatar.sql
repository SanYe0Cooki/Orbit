-- Orbit — migration 004: avatar_url on profiles
-- Run after 003. Idempotent.
alter table public.profiles
  add column if not exists avatar_url text;

comment on column public.profiles.avatar_url is
  'Small base64 JPEG (≤ ~20KB) of the user''s profile picture.';
