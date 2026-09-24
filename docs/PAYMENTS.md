# Payments and real money

Rule: **anything that creates, moves or refunds real money runs on the server.**
The app only displays data and calls user-facing RPCs; it never decides an
amount, adds coins, or records revenue.

## Flow

| Step | Where | What |
|---|---|---|
| Buy coins | `create-razorpay-order` (edge fn) | Prices the order from `coin_packages`, stores it in `payment_orders` |
| Pay | Razorpay Checkout | Browser only collects the payment |
| Confirm (fast path) | `verify-razorpay-payment` (edge fn) | Checks the checkout signature, calls `fulfill_payment_order` |
| Confirm (backup) | `razorpay-webhook` (edge fn) | `payment.captured` / `order.paid` → `fulfill_payment_order` |
| Refund | `razorpay-webhook` | `refund.processed` → `refund_payment_order` (takes coins back, claws back revenue) |
| Owner earnings | pg_cron job `aggregate-owner-earnings` (hourly, :17) | `aggregate_and_pay_group_owners` splits revenue into `revhead_earnings_ledger` / `revhead_referral_shares` |
| Ad revenue | `admob-ssv-callback` (edge fn) | `credit_verified_ad_reward` |
| Payout request | `request_payout` RPC (user) | ₹500 minimum, UPI via `set_my_upi_id` |
| Payout approval | `admin_mark_payout_paid` / `admin_reject_payout` (owner only) | |

`fulfill_payment_order` and `refund_payment_order` are idempotent, so the
fast path and the webhook can both fire safely.

## Server-only functions

These are not executable by `anon`/`authenticated` and refuse to run outside
the server (`is_server_context()`): `record_revenue_event`,
`record_revenue_refund`, `record_group_owner_earning`,
`aggregate_and_pay_group_owners`, `fulfill_payment_order`,
`refund_payment_order`, `credit_verified_ad_reward`, `increment_wallet`.

App roles have no INSERT/UPDATE/DELETE grants on the money tables
(`payment_orders`, `payment_refunds`, `revenue_events`, `revenue_event_splits`,
`revhead_earnings_ledger`, `revhead_referral_shares`, `payout_requests`,
`user_wallets`, `coin_transactions`, `user_inventory`, `coin_packages`,
`shop_items`). `verified_until` / `ad_free_until` on `user_profiles` are
server-only too; perks are applied by `redeem_shop_item`.

Migrations: 0080 (net revenue, refunds, 18+, ₹500 minimum), 0081 (orders,
server grants), 0082 (server-only money functions, refunds, hourly job),
0083 (no re-fulfil after refund).

## Setup

Supabase → Edge Functions → Secrets:

- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` — Razorpay Dashboard → API Keys
- `RAZORPAY_WEBHOOK_SECRET` — the secret you choose when creating the webhook

Razorpay Dashboard → Webhooks → Add:

- URL: `https://dhzjtjekbvxxsauzhadl.supabase.co/functions/v1/razorpay-webhook`
- Events: `payment.captured`, `order.paid`, `refund.processed`
