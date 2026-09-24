import { sb } from '../../_shared/supabaseClient';

/* ============================================================
   WYNKOINS wallet + Razorpay purchases (migration 0081).

   Nothing here grants anything from the browser:
     * create-razorpay-order (edge function) prices the order from
       coin_packages and stores it in payment_orders;
     * verify-razorpay-payment checks Razorpay's signature and adds
       the coins server-side;
     * redeem_shop_item spends coins and applies the perk in one step.
   ============================================================ */

export interface CoinPackage {
  id: string;
  name: string;
  coins: number;
  bonus_pct: number;
  price_inr: number;
  popular: boolean;
}

export interface ShopItem {
  id: string;
  name: string;
  item_type: string;
  coin_cost: number;
  duration_days: number | null;
}

export interface CoinTransaction {
  amount: number;
  reason: string;
  created_at: string;
}

async function call<T>(p: PromiseLike<{ data: unknown; error: { message?: string } | null }>, fallback: string): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message || fallback);
  return data as T;
}

/** Coins a package gives, including its bonus. */
export const packageCoins = (p: CoinPackage) => Math.floor(p.coins * (1 + (p.bonus_pct ?? 0) / 100));

export async function fetchCoinBalance(): Promise<number> {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return 0;
  const row = await call<{ coins: number } | null>(
    sb.from('user_wallets').select('coins').eq('user_id', user.id).maybeSingle(),
    'Could not load your balance',
  );
  return row?.coins ?? 0;
}

export const fetchCoinPackages = () =>
  call<CoinPackage[]>(sb.from('coin_packages').select('id, name, coins, bonus_pct, price_inr, popular').order('price_inr'), 'Could not load coin packs')
    .then((d) => (d ?? []).map((p) => ({ ...p, price_inr: Number(p.price_inr) })));

export const fetchShopItems = () =>
  call<ShopItem[]>(sb.from('shop_items').select('id, name, item_type, coin_cost, duration_days').order('coin_cost'), 'Could not load the shop')
    .then((d) => d ?? []);

export async function fetchCoinHistory(limit = 20): Promise<CoinTransaction[]> {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return [];
  return call<CoinTransaction[]>(
    sb.from('coin_transactions').select('amount, reason, created_at').eq('user_id', user.id)
      .order('created_at', { ascending: false }).limit(limit),
    'Could not load your transactions',
  ).then((d) => d ?? []);
}

export async function fetchAdFreeUntil(): Promise<Date | null> {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const row = await call<{ ad_free_until: string | null } | null>(
    sb.from('user_profiles').select('ad_free_until').eq('id', user.id).maybeSingle(),
    'Could not load your perks',
  );
  if (!row?.ad_free_until) return null;
  const d = new Date(row.ad_free_until);
  return Number.isNaN(d.getTime()) ? new Date(8.64e15) : d; // 'infinity' = permanent
}

/** Spends coins on a shop item server-side. Returns the new expiry (null = permanent). */
export const redeemShopItem = (itemId: string) =>
  call<string | null>(sb.rpc('redeem_shop_item', { p_item_id: itemId }), 'Could not redeem that item');

// ── Razorpay checkout ────────────────────────────────────────────────────────
interface RazorpayResponse { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }
interface RazorpayInstance { open(): void; on(event: string, cb: (r: { error?: { description?: string } }) => void): void }
declare global { interface Window { Razorpay?: new (opts: Record<string, unknown>) => RazorpayInstance } }

function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load Razorpay'));
    document.head.appendChild(s);
  });
}

async function invoke<T>(fn: string, body: unknown): Promise<T> {
  const { data, error } = await sb.functions.invoke(fn, { body });
  if (error) {
    let message = error.message;
    try { message = (await (error as { context?: Response }).context?.json())?.error ?? message; } catch { /* keep default */ }
    throw new Error(message || 'Payment failed');
  }
  return data as T;
}

/**
 * Opens Razorpay checkout for a coin package. Resolves with the coins added
 * once the server has verified the payment; resolves null if the user closes
 * the checkout; rejects on failure.
 */
export async function buyCoinPackage(packageId: string): Promise<number | null> {
  await loadRazorpay();
  const order = await invoke<{ order_id: string; amount: number; currency: string; key_id: string; coins: number; email: string | null }>(
    'create-razorpay-order', { package_id: packageId },
  );
  return new Promise((resolve, reject) => {
    // Razorpay lets the user retry inside the checkout after a failed attempt,
    // so a failure only surfaces if they then close it.
    let lastFailure: string | null = null;
    const rzp = new window.Razorpay!({
      key: order.key_id,
      order_id: order.order_id,
      amount: order.amount,
      currency: order.currency,
      name: 'Wynko',
      description: `${order.coins.toLocaleString('en-IN')} WYNKOINS`,
      prefill: { email: order.email ?? '' },
      theme: { color: '#7C4DFF' },
      handler: (resp: RazorpayResponse) => {
        invoke<{ ok: boolean; coins_added: number }>('verify-razorpay-payment', resp)
          .then((r) => resolve(r.coins_added))
          .catch(reject);
      },
      modal: { ondismiss: () => (lastFailure ? reject(new Error(lastFailure)) : resolve(null)) },
    });
    rzp.on('payment.failed', (r) => { lastFailure = r?.error?.description || 'Payment failed'; });
    rzp.open();
  });
}
