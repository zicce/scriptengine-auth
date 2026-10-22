-- Loader upload, reseller blacklist, and saved brand settings.
-- Safe to run more than once.

alter table public.resellers add column if not exists loader_brand text;
alter table public.resellers add column if not exists loader_color text;

create table if not exists public.loader_config (
  id text primary key,
  file_name text not null,
  file_size bigint not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.loader_blacklist (
  discord_id text primary key,
  created_at timestamptz not null default now()
);

alter table public.loader_config enable row level security;
alter table public.loader_blacklist enable row level security;
alter table public.loader_config add column if not exists version text;

do $$
begin
  insert into storage.buckets (id, name, public)
  values ('loader', 'loader', false)
  on conflict (id) do nothing;
exception
  when others then
    null;
end $$;
