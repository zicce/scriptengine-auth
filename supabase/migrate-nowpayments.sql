-- Crypto top-ups through NOWPayments, with a bonus on top.
-- Safe to run more than once. Run in the Supabase SQL Editor after migrate-discount-tiers.sql.
--
-- reseller_deposits holds every deposit the server started. A payment notification only
-- credits when it matches one of these rows, so the browser can never invent a payment.

alter table public.reseller_transactions
  add column if not exists bonus numeric(10, 2) not null default 0 check (bonus >= 0);

create table if not exists public.reseller_deposits (
  id uuid primary key default gen_random_uuid(),
  reseller_id uuid not null references public.resellers (id) on delete cascade,
  provider text not null,
  amount numeric(10, 2) not null check (amount > 0),
  status text not null default 'pending',
  provider_ref text,
  created_at timestamptz not null default now()
);

create index if not exists reseller_deposits_reseller_idx
  on public.reseller_deposits (reseller_id, created_at desc);

alter table public.reseller_deposits enable row level security;

-- One function for every provider. p_session is the payment reference (a Stripe session id
-- or "np:<deposit id>"), so a payment can only be credited once. p_bonus is extra balance
-- that does not count toward the discount tiers.
drop function if exists public.credit_reseller_topup(uuid, numeric, text);

create or replace function public.credit_reseller_topup(
  p_reseller uuid,
  p_amount numeric,
  p_session text,
  p_bonus numeric default 0
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric;
  v_tier numeric;
begin
  begin
    insert into public.reseller_transactions (reseller_id, kind, amount, bonus, stripe_session_id)
    values (p_reseller, 'topup', p_amount, coalesce(p_bonus, 0), p_session);
  exception when unique_violation then
    return false;
  end;

  select coalesce(sum(amount), 0) into v_total
    from public.reseller_transactions
   where reseller_id = p_reseller
     and kind = 'topup'
     and stripe_session_id is not null
     and created_at > now() - interval '30 days';

  v_tier := case
    when v_total >= 2000 then 80
    when v_total >= 1000 then 70
    when v_total >= 500 then 65
    when v_total >= 250 then 60
    when v_total >= 100 then 50
    when v_total >= 50 then 40
    when v_total >= 25 then 30
    else 0
  end;

  update public.resellers
     set balance = coalesce(balance, 0) + p_amount + coalesce(p_bonus, 0),
         discount_percent = greatest(coalesce(discount_percent, 0), v_tier)
   where id = p_reseller;
  return true;
end;
$$;

revoke all on function public.credit_reseller_topup(uuid, numeric, text, numeric) from public, anon, authenticated;
grant execute on function public.credit_reseller_topup(uuid, numeric, text, numeric) to service_role;
