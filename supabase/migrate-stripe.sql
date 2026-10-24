-- Stripe card top-ups.
-- Safe to run more than once. Run in the Supabase SQL Editor.
-- Each Checkout Session can credit a reseller only once.

alter table public.reseller_transactions
  add column if not exists stripe_session_id text;

create unique index if not exists reseller_transactions_stripe_idx
  on public.reseller_transactions (stripe_session_id)
  where stripe_session_id is not null;

-- Logs the top-up and adds it to the balance in one transaction.
-- Returns false when this Checkout Session was already credited.
create or replace function public.credit_reseller_topup(
  p_reseller uuid,
  p_amount numeric,
  p_session text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    insert into public.reseller_transactions (reseller_id, kind, amount, stripe_session_id)
    values (p_reseller, 'topup', p_amount, p_session);
  exception when unique_violation then
    return false;
  end;

  update public.resellers
     set balance = coalesce(balance, 0) + p_amount
   where id = p_reseller;
  return true;
end;
$$;

revoke all on function public.credit_reseller_topup(uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.credit_reseller_topup(uuid, numeric, text) to service_role;
