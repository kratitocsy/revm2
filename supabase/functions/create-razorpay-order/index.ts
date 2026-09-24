// POST /functions/v1/create-razorpay-order   { package_id }
// Auth: the user's Supabase access token (Authorization: Bearer <jwt>).
//
// Creates a Razorpay order for a coin package. The price and coin amount
// come from coin_packages on the server - never from the browser - and the
// order is stored in payment_orders so verify-razorpay-payment can fulfil it.
//
// Secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET (Edge Functions -> Secrets).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const keyId = Deno.env.get("RAZORPAY_KEY_ID");
  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
  if (!keyId || !keySecret) return json({ error: "Payments aren't set up yet" }, 503);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const { data: auth } = await admin.auth.getUser(token);
  const user = auth?.user;
  if (!user) return json({ error: "not authenticated" }, 401);

  let packageId: string | undefined;
  try { packageId = (await req.json())?.package_id; } catch { /* handled below */ }
  if (!packageId) return json({ error: "package_id is required" }, 400);

  const { data: pkg } = await admin
    .from("coin_packages")
    .select("id, name, coins, bonus_pct, price_inr")
    .eq("id", packageId)
    .maybeSingle();
  if (!pkg) return json({ error: "package not found" }, 404);

  const amountPaise = Math.round(Number(pkg.price_inr) * 100);
  const coins = Math.floor(pkg.coins * (1 + (pkg.bonus_pct ?? 0) / 100));

  const rzp = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Basic " + btoa(`${keyId}:${keySecret}`),
    },
    body: JSON.stringify({
      amount: amountPaise,
      currency: "INR",
      receipt: `coins_${crypto.randomUUID().slice(0, 30)}`,
      notes: { user_id: user.id, package_id: pkg.id },
    }),
  });
  const order = await rzp.json().catch(() => null);
  if (!rzp.ok || !order?.id) {
    console.error("razorpay order failed", rzp.status, order);
    return json({ error: "Could not start the payment - try again" }, 502);
  }

  const { error } = await admin.from("payment_orders").insert({
    user_id: user.id,
    product_type: "coin_package",
    product_id: pkg.id,
    coins,
    amount_paise: amountPaise,
    currency: "INR",
    provider: "razorpay",
    provider_order_id: order.id,
  });
  if (error) {
    console.error("payment_orders insert failed", error);
    return json({ error: "Could not start the payment - try again" }, 500);
  }

  return json({
    order_id: order.id,
    amount: amountPaise,
    currency: "INR",
    key_id: keyId,
    name: pkg.name,
    coins,
    email: user.email ?? null,
  });
});
