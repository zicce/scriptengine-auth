-- Automatic discount tiers from card top-ups.
-- Safe to run more than once. Run in the Supabase SQL Editor after migrate-stripe.sql.
--
-- Stripe payments made in the last 30 days are added up. Reaching a tier raises the
-- reseller's discount_percent to that tier. The discount never goes down, and a higher
-- rate set by an admin is kept.
--   €25 -> 30%   €50 -> 40%   €100 -> 50%   €250 -> 60%
--   €500 -> 65%  €1000 -> 70% €2000 -> 80%

create or replace function public.credit_reseller_topup(
  p_reseller uuid,
  p_amount numeric,
  p_session text
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
    insert into public.reseller_transactions (reseller_id, kind, amount, stripe_session_id)
    values (p_reseller, 'topup', p_amount, p_session);
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
     set balance = coalesce(balance, 0) + p_amount,
         discount_percent = greatest(coalesce(discount_percent, 0), v_tier)
   where id = p_reseller;
  return true;
end;
$$;

revoke all on function public.credit_reseller_topup(uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.credit_reseller_topup(uuid, numeric, text) to service_role;
