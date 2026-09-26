-- Simplify the WYNKOINS store to three packs and cut the 1-month ad-free price.
--   200 coins for ₹29 · 400 coins for ₹49 · 1000 coins for ₹99 (no bonus %).
-- The three cheapest existing packs are updated in place (ids kept); the rest are
-- removed. payment_orders.product_id has no FK and orders carry their own coin
-- count, so past/pending orders are unaffected.

update public.coin_packages set name = 'Starter', coins = 200,  bonus_pct = 0, price_inr = 29, popular = false
 where id = '3d77c128-c55d-4537-98da-95aad9aa7fb6';
update public.coin_packages set name = 'Value',   coins = 400,  bonus_pct = 0, price_inr = 49, popular = false
 where id = 'a8d6b5f2-a585-464e-a71b-29b86bc7b13e';
update public.coin_packages set name = 'Popular', coins = 1000, bonus_pct = 0, price_inr = 99, popular = true
 where id = 'a77c330e-0429-4d63-98f3-31e292fbb955';

delete from public.coin_packages
 where id not in ('3d77c128-c55d-4537-98da-95aad9aa7fb6',
                  'a8d6b5f2-a585-464e-a71b-29b86bc7b13e',
                  'a77c330e-0429-4d63-98f3-31e292fbb955');

-- Remove Ads (1 month): 300 -> 199 WYNKOINS.
update public.shop_items set coin_cost = 199
 where item_type = 'ad_free' and duration_days = 30;
