alter table public.resellers
  add column if not exists team_management boolean not null default true;

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

drop trigger if exists reseller_helpers_set_updated_at on public.reseller_helpers;
create trigger reseller_helpers_set_updated_at
before update on public.reseller_helpers
for each row execute function public.set_updated_at();

alter table public.reseller_helpers enable row level security;
alter table public.helper_applications enable row level security;
