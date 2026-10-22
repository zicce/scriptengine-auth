-- Resellers, application access, and which licenses they bought.
-- Safe to run more than once.

create table if not exists public.resellers (
  id uuid primary key default gen_random_uuid(),
  discord_id text not null unique,
  username text,
  avatar_url text,
  balance numeric(10, 2) not null default 0 check (balance >= 0),
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

alter table public.licenses
  add column if not exists reseller_id uuid references public.resellers (id) on delete set null;

create index if not exists licenses_reseller_idx on public.licenses (reseller_id, created_at desc);

drop trigger if exists resellers_set_updated_at on public.resellers;
create trigger resellers_set_updated_at
before update on public.resellers
for each row execute function public.set_updated_at();

alter table public.resellers enable row level security;
alter table public.reseller_applications enable row level security;
