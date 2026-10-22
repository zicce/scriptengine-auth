-- Run once. Lets an application lock key generation.

alter table public.applications
  add column if not exists keys_locked boolean not null default false;
