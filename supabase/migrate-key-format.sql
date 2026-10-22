-- Global license key format. Safe to run more than once.

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

alter table public.panel_settings enable row level security;
