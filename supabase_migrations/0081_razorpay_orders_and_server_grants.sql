-- Razorpay coin purchases + closing the client-side self-grants.
--
-- Before this migration a signed-in user could give themselves anything:
--   * increment_wallet(uid, delta) was executable by `authenticated` and
--     allowed uid = auth.uid() -> free coins;
--   * spend_coins(uid, amount) with a negative amount added coins;
--   * verified_until / ad_free_until weren't protected, so store.html just
--     wrote them straight onto the profile after a redeem.
--
-- Now:
--   * coins are only added by the server (the verify-razorpay-payment edge
--     function, via fulfill_payment_order, running as service_role);
--   * items are redeemed through redeem_shop_item(), which spends the coins
--     and applies the perk in one transaction;
--   * the premium columns can only be written by the server.

-- ── Orders ──────────────────────────────────────────────────────────────────
create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_type text not null check (product_type in ('coin_package')),
  product_id uuid not null,
  coins integer not null check (coins > 0),
  amount_paise integer not null check (amount_paise > 0),
  currency text not null default 'INR',
  provider text not null default 'razorpay',
  provider_order_id text unique,
  provider_payment_id text unique,
  status text not null default 'created' check (status in ('created', 'paid', 'failed')),
  revenue_event_id uuid references public.revenue_events(id),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists payment_orders_user_idx on public.payment_orders (user_id, created_at desc);

alter table public.payment_orders enable row level security;
drop policy if exists "payment_orders: owner read" on public.payment_orders;
create policy "payment_orders: owner read" on public.payment_orders
  for select using (auth.uid() = user_id);
revoke insert, update, delete on public.payment_orders from anon, authenticated;

-- Web price stays in price_inr. app_price_inr is for the mobile store apps
-- later (a little higher, since the stores take their cut); null = not sold there.
alter table public.coin_packages add column if not exists app_price_inr numeric;

-- ── Wallet functions: no more self-minting ─────────────────────────────────
revoke execute on function public.increment_wallet(uuid, integer, integer) from public, anon, authenticated;

create or replace function public.spend_coins(uid uuid, amount integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is distinct from uid and auth.role() <> 'service_role' then
    raise exception 'not authorized';
  end if;
  if amount is null or amount <= 0 then
    raise exception 'amount must be positive';
  end if;
  update public.user_wallets set coins = coins - amount, updated_at = now()
    where user_id = uid and coins >= amount;
  return found;
end;
$$;

-- ── Premium columns are server-only ────────────────────────────────────────
create or replace function public.protect_user_premium_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.verified_until := null;
    new.ad_free_until := null;
    return new;
  end if;
  if new.verified_until is distinct from old.verified_until
     or new.ad_free_until is distinct from old.ad_free_until then
    raise exception 'permission denied: that profile field can only be changed by the server'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_user_premium_columns on public.user_profiles;
create trigger trg_protect_user_premium_columns
  before insert or update on public.user_profiles
  for each row execute function public.protect_user_premium_columns();

-- ── Redeem a shop item with coins (replaces the client-side grant) ─────────
create or replace function public.redeem_shop_item(p_item_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_expires timestamptz;
  v_base timestamptz;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into v_item from public.shop_items where id = p_item_id;
  if not found then raise exception 'item not found'; end if;

  update public.user_wallets set coins = coins - v_item.coin_cost, updated_at = now()
   where user_id = auth.uid() and coins >= v_item.coin_cost;
  if not found then raise exception 'Not enough coins'; end if;

  -- Time-limited perks stack on top of whatever is still active.
  if v_item.duration_days is not null then
    select greatest(now(), coalesce(case v_item.item_type
                                      when 'verified_badge' then verified_until
                                      when 'ad_free' then ad_free_until
                                    end, now()))
      into v_base
      from public.user_profiles where id = auth.uid();
    v_expires := coalesce(v_base, now()) + make_interval(days => v_item.duration_days);
  end if;

  insert into public.user_inventory (user_id, item_id, expires_at)
  values (auth.uid(), v_item.id, v_expires);
  insert into public.coin_transactions (user_id, amount, reason, ref_id)
  values (auth.uid(), -v_item.coin_cost, 'redeem_' || v_item.item_type, v_item.id);

  if v_item.item_type = 'verified_badge' then
    update public.user_profiles set verified_until = coalesce(v_expires, 'infinity'::timestamptz) where id = auth.uid();
  elsif v_item.item_type = 'ad_free' then
    update public.user_profiles set ad_free_until = coalesce(v_expires, 'infinity'::timestamptz) where id = auth.uid();
  end if;

  return v_expires;
end;
$$;
revoke all on function public.redeem_shop_item(uuid) from public, anon;
grant execute on function public.redeem_shop_item(uuid) to authenticated;

-- ── Fulfil a paid order (service_role only; called after the signature check) ──
-- Idempotent: a second call for the same order returns the same result
-- without adding coins again.
create or replace function public.fulfill_payment_order(p_provider_order_id text, p_provider_payment_id text)
returns table(order_id uuid, coins_added integer, already_paid boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_event uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'service only'; end if;

  select * into v_order from public.payment_orders where provider_order_id = p_provider_order_id for update;
  if not found then raise exception 'order not found'; end if;
  if v_order.status = 'paid' then
    return query select v_order.id, v_order.coins, true;
    return;
  end if;

  insert into public.user_wallets (user_id, coins, total_earned, updated_at)
  values (v_order.user_id, v_order.coins, 0, now())
  on conflict (user_id) do update set coins = user_wallets.coins + excluded.coins, updated_at = now();

  insert into public.coin_transactions (user_id, amount, reason, ref_id)
  values (v_order.user_id, v_order.coins, 'purchase_coins', v_order.product_id);

  -- Feeds the Home Community split (net of GST + gateway fee, see 0080).
  select event_id into v_event
    from public.record_revenue_event(v_order.user_id, 'store_purchase', v_order.amount_paise / 100.0, v_order.provider, null);

  update public.payment_orders
     set status = 'paid', provider_payment_id = p_provider_payment_id, paid_at = now(), revenue_event_id = v_event
   where id = v_order.id;

  return query select v_order.id, v_order.coins, false;
end;
$$;
revoke all on function public.fulfill_payment_order(text, text) from public, anon, authenticated;
grant execute on function public.fulfill_payment_order(text, text) to service_role;
