-- Everything that creates or moves real money runs on the server only.
--
--   * Revenue events, earnings, the revenue split and refunds can no longer
--     be triggered from the app by anyone - not even moderators (who could
--     previously credit earnings to themselves). They run from the server:
--     edge functions (service_role) and the scheduled job below.
--   * The revenue split -> owner earnings job runs every hour via pg_cron
--     instead of waiting for an admin to call it by hand.
--   * Razorpay refunds (webhook) take back the coins and the owners' share.
--   * App roles lose the table-level write grants on money tables; RLS was
--     already blocking writes, this removes the grants as a second layer.
-- Payout approval stays an owner action (admin_mark_payout_paid /
-- admin_reject_payout), and users still request payouts via request_payout.

-- True when called by the server (service_role key, pg_cron, SQL editor),
-- false for any request made with a user's or the anon key.
create or replace function public.is_server_context()
returns boolean
language sql
stable
set search_path = public
as $$ select coalesce(auth.role(), '') not in ('anon', 'authenticated') $$;

-- Swap the old "admin or moderator" guards for server-only ones.
do $$
declare
  f text;
  def text;
  new_def text;
begin
  foreach f in array array[
    'public.record_revenue_event(uuid,text,numeric,text,uuid)',
    'public.record_revenue_refund(uuid,numeric)',
    'public.record_group_owner_earning(uuid,numeric,text)',
    'public.aggregate_and_pay_group_owners()'
  ] loop
    def := pg_get_functiondef(f::regprocedure);
    new_def := regexp_replace(
      def,
      'if not \(?public\.is_admin_or_moderator\(\)( or auth\.role\(\) = ''service_role''\))?\s+then\s+raise exception ''admin only'';\s+end if;',
      'if not public.is_server_context() then raise exception ''server only''; end if;'
    );
    if new_def = def then
      raise exception 'guard not found in %', f;
    end if;
    execute new_def;
  end loop;
end $$;

-- None of these are called by the app; only by other server-side functions.
revoke execute on function public.record_revenue_event(uuid, text, numeric, text, uuid) from public, anon, authenticated;
revoke execute on function public.record_revenue_refund(uuid, numeric) from public, anon, authenticated;
revoke execute on function public.record_group_owner_earning(uuid, numeric, text) from public, anon, authenticated;
revoke execute on function public.record_revhead_earning(uuid, numeric, text) from public, anon, authenticated;
revoke execute on function public.aggregate_and_pay_group_owners() from public, anon, authenticated;
revoke execute on function public.credit_verified_ad_reward(uuid, text, text, text, numeric, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.compute_user_group_time_split(uuid) from public, anon, authenticated;
revoke execute on function public.is_group_owner_earning_eligible(uuid) from public, anon, authenticated;
grant execute on function public.record_revenue_event(uuid, text, numeric, text, uuid) to service_role;
grant execute on function public.record_revenue_refund(uuid, numeric) to service_role;
grant execute on function public.aggregate_and_pay_group_owners() to service_role;
grant execute on function public.credit_verified_ad_reward(uuid, text, text, text, numeric, text, text, uuid) to service_role;

-- Second layer on the money tables: no direct writes from app roles.
revoke insert, update, delete on
  public.payout_requests, public.revhead_earnings_ledger, public.revhead_referral_shares,
  public.revenue_events, public.revenue_event_splits, public.payment_orders,
  public.user_wallets, public.coin_transactions, public.user_inventory,
  public.coin_packages, public.shop_items
from anon, authenticated;

-- ── Refunds (called by the razorpay-webhook edge function) ──────────────────
alter table public.payment_orders drop constraint if exists payment_orders_status_check;
alter table public.payment_orders add constraint payment_orders_status_check
  check (status in ('created', 'paid', 'failed', 'refunded'));
alter table public.payment_orders add column if not exists refunded_paise integer not null default 0;

create table if not exists public.payment_refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.payment_orders(id),
  provider_refund_id text not null unique,
  amount_paise integer not null check (amount_paise > 0),
  coins_removed integer not null default 0,
  revenue_event_id uuid references public.revenue_events(id),
  created_at timestamptz not null default now()
);
alter table public.payment_refunds enable row level security;
drop policy if exists "payment_refunds: owner read" on public.payment_refunds;
create policy "payment_refunds: owner read" on public.payment_refunds
  for select using (exists (select 1 from public.payment_orders o where o.id = order_id and o.user_id = auth.uid()));
revoke insert, update, delete on public.payment_refunds from anon, authenticated;

-- Idempotent per Razorpay refund id. Takes back the matching share of the
-- coins (as many as are left in the wallet) and claws back the revenue, which
-- reverses the owner's and referrer's shares on the next split.
create or replace function public.refund_payment_order(p_provider_payment_id text, p_provider_refund_id text, p_amount_paise integer)
returns table(order_id uuid, coins_removed integer, already_processed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_amount integer;
  v_coins integer;
  v_have integer;
  v_event uuid;
begin
  if not public.is_server_context() then raise exception 'server only'; end if;

  if exists (select 1 from public.payment_refunds where provider_refund_id = p_provider_refund_id) then
    return query select r.order_id, r.coins_removed, true from public.payment_refunds r where r.provider_refund_id = p_provider_refund_id;
    return;
  end if;

  select * into v_order from public.payment_orders where provider_payment_id = p_provider_payment_id for update;
  if not found then raise exception 'order not found for payment %', p_provider_payment_id; end if;
  if v_order.status not in ('paid', 'refunded') then raise exception 'order was never paid'; end if;

  v_amount := least(p_amount_paise, v_order.amount_paise - v_order.refunded_paise);
  if v_amount <= 0 then raise exception 'order already fully refunded'; end if;

  v_coins := round(v_order.coins::numeric * v_amount / v_order.amount_paise);
  select coins into v_have from public.user_wallets where user_id = v_order.user_id for update;
  v_coins := least(v_coins, coalesce(v_have, 0));
  if v_coins > 0 then
    update public.user_wallets set coins = coins - v_coins, updated_at = now() where user_id = v_order.user_id;
    insert into public.coin_transactions (user_id, amount, reason, ref_id)
    values (v_order.user_id, -v_coins, 'refund_coins', v_order.product_id);
  end if;

  if v_order.revenue_event_id is not null then
    v_event := public.record_revenue_refund(v_order.revenue_event_id, v_amount / 100.0);
  end if;

  insert into public.payment_refunds (order_id, provider_refund_id, amount_paise, coins_removed, revenue_event_id)
  values (v_order.id, p_provider_refund_id, v_amount, v_coins, v_event);

  update public.payment_orders
     set refunded_paise = refunded_paise + v_amount,
         status = case when refunded_paise + v_amount >= amount_paise then 'refunded' else status end
   where id = v_order.id;

  return query select v_order.id, v_coins, false;
end;
$$;
revoke all on function public.refund_payment_order(text, text, integer) from public, anon, authenticated;
grant execute on function public.refund_payment_order(text, text, integer) to service_role;

-- ── Hourly revenue split -> owner earnings ─────────────────────────────────
do $$
begin
  if exists (select 1 from cron.job where jobname = 'aggregate-owner-earnings') then
    perform cron.unschedule('aggregate-owner-earnings');
  end if;
  perform cron.schedule('aggregate-owner-earnings', '17 * * * *', 'select count(*) from public.aggregate_and_pay_group_owners()');
end $$;
