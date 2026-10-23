-- Script Engine auth panel
-- Paste this whole file into the Supabase SQL Editor and run it once.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.admins (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  app_id text not null unique,
  name text not null,
  version text not null default '1.0.0',
  status text not null default 'Active' check (status in ('Active', 'Maintenance', 'Disabled')),
  keys_locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.application_variants (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  label text not null,
  duration_value integer,
  duration_unit text not null default 'days' check (duration_unit in ('hours', 'days', 'months', 'years', 'lifetime')),
  price numeric(10, 2) not null default 0,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.licenses (
  id uuid primary key default gen_random_uuid(),
  license_key text not null unique,
  application_id uuid not null references public.applications (id) on delete cascade,
  variant_id uuid references public.application_variants (id) on delete set null,
  variant_label text,
  status text not null default 'Not Activated' check (status in ('Not Activated', 'Active', 'Banned', 'Expired')),
  duration_value integer,
  duration_unit text,
  hwid text,
  ban_reason text,
  activated_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists applications_created_at_idx on public.applications (created_at desc);
create index if not exists application_variants_app_idx on public.application_variants (application_id, sort_order);
create index if not exists licenses_application_idx on public.licenses (application_id, created_at desc);
create index if not exists licenses_status_idx on public.licenses (status);

create or replace function public.lock_application_app_id()
returns trigger
language plpgsql
as $$
begin
  if new.app_id is distinct from old.app_id then
    raise exception 'APP_ID cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists applications_set_updated_at on public.applications;
create trigger applications_set_updated_at
before update on public.applications
for each row execute function public.set_updated_at();

drop trigger if exists applications_lock_app_id on public.applications;
create trigger applications_lock_app_id
before update on public.applications
for each row execute function public.lock_application_app_id();

drop trigger if exists application_variants_set_updated_at on public.application_variants;
create trigger application_variants_set_updated_at
before update on public.application_variants
for each row execute function public.set_updated_at();

drop trigger if exists licenses_set_updated_at on public.licenses;
create trigger licenses_set_updated_at
before update on public.licenses
for each row execute function public.set_updated_at();

create table if not exists public.panel_settings (
  id text primary key,
  key_pattern text not null default 'SE-****-****-****',
  key_uppercase boolean not null default true,
  key_digits boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.panel_settings (id)
values ('global')
on conflict (id) do nothing;

create table if not exists public.resellers (
  id uuid primary key default gen_random_uuid(),
  discord_id text not null unique,
  username text,
  avatar_url text,
  service_name text,
  balance numeric(10, 2) not null default 0 check (balance >= 0),
  discount_percent numeric(5, 2) not null default 0 check (discount_percent >= 0 and discount_percent <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reseller_applications (
  reseller_id uuid not null references public.resellers (id) on delete cascade,
  application_id uuid not null references public.applications (id) on delete cascade,
  primary key (reseller_id, application_id)
);

alter table public.resellers add column if not exists avatar_url text;
alter table public.resellers add column if not exists service_name text;
alter table public.resellers add column if not exists team_management boolean not null default true;
alter table public.resellers add column if not exists loader_brand text;
alter table public.resellers add column if not exists loader_color text;

create table if not exists public.reseller_helpers (
  id uuid primary key default gen_random_uuid(),
  reseller_id uuid not null references public.resellers (id) on delete cascade,
  discord_id text not null unique,
  username text,
  avatar_url text,
  can_generate boolean not null default false,
  can_reset_hwid boolean not null default false,
  can_ban boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.helper_applications (
  helper_id uuid not null references public.reseller_helpers (id) on delete cascade,
  application_id uuid not null references public.applications (id) on delete cascade,
  primary key (helper_id, application_id)
);

create index if not exists reseller_helpers_reseller_idx on public.reseller_helpers (reseller_id, created_at);

alter table public.licenses
  add column if not exists reseller_id uuid references public.resellers (id) on delete set null;

create index if not exists licenses_reseller_idx on public.licenses (reseller_id, created_at desc);

drop trigger if exists resellers_set_updated_at on public.resellers;
create trigger resellers_set_updated_at
before update on public.resellers
for each row execute function public.set_updated_at();

drop trigger if exists reseller_helpers_set_updated_at on public.reseller_helpers;
create trigger reseller_helpers_set_updated_at
before update on public.reseller_helpers
for each row execute function public.set_updated_at();

create table if not exists public.updates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  badges jsonb not null default '[]'::jsonb,
  tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists updates_created_at_idx on public.updates (created_at desc);

create table if not exists public.reseller_transactions (
  id uuid primary key default gen_random_uuid(),
  reseller_id uuid not null references public.resellers (id) on delete cascade,
  kind text not null check (kind in ('license', 'topup')),
  amount numeric(10, 2) not null default 0 check (amount >= 0),
  application_name text,
  variant_label text,
  license_key text,
  license_id uuid references public.licenses (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists reseller_transactions_reseller_idx
  on public.reseller_transactions (reseller_id, created_at desc);

create unique index if not exists reseller_transactions_license_idx
  on public.reseller_transactions (license_id)
  where license_id is not null;

create table if not exists public.loader_config (
  id text primary key,
  file_name text not null,
  file_size bigint not null,
  version text,
  updated_at timestamptz not null default now()
);

create table if not exists public.loader_blacklist (
  discord_id text primary key,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;
alter table public.applications enable row level security;
alter table public.application_variants enable row level security;
alter table public.licenses enable row level security;
alter table public.panel_settings enable row level security;
alter table public.resellers enable row level security;
alter table public.reseller_applications enable row level security;
alter table public.updates enable row level security;
alter table public.reseller_transactions enable row level security;
alter table public.reseller_helpers enable row level security;
alter table public.helper_applications enable row level security;
alter table public.loader_config enable row level security;
alter table public.loader_blacklist enable row level security;

-- No public policies. The Next.js server uses the service role key.
-- Browser clients must not read these tables directly.
