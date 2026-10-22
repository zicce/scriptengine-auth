-- Reseller purchase and top-up history.
-- Safe to run more than once.
-- Existing license purchases are copied in using the variant's current price.

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

insert into public.reseller_transactions (
  reseller_id,
  kind,
  amount,
  application_name,
  variant_label,
  license_key,
  license_id,
  created_at
)
select
  l.reseller_id,
  'license',
  coalesce(v.price, 0),
  a.name,
  l.variant_label,
  l.license_key,
  l.id,
  l.created_at
from public.licenses l
left join public.applications a on a.id = l.application_id
left join public.application_variants v on v.id = l.variant_id
where l.reseller_id is not null
  and not exists (
    select 1 from public.reseller_transactions t where t.license_id = l.id
  );

alter table public.reseller_transactions enable row level security;
