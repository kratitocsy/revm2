// POST /functions/v1/verify-razorpay-payment
//   { razorpay_order_id, razorpay_payment_id, razorpay_signature }
// Auth: the user's Supabase access token.
//
// Called by the checkout's success handler. Checks Razorpay's signature
// (HMAC-SHA256 of "order_id|payment_id" with the key secret), confirms the
// order belongs to the caller, then fulfil_payment_order adds the coins and
// records the revenue. Safe to call twice - coins are only added once.
//
// Secrets: RAZORPAY_KEY_SECRET.

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

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
  if (!keySecret) return json({ error: "Payments aren't set up yet" }, 503);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const { data: auth } = await admin.auth.getUser(token);
  const user = auth?.user;
  if (!user) return json({ error: "not authenticated" }, 401);

  let body: Record<string, string> = {};
  try { body = await req.json(); } catch { /* handled below */ }
  const orderId = body.razorpay_order_id;
  const paymentId = body.razorpay_payment_id;
  const signature = body.razorpay_signature;
  if (!orderId || !paymentId || !signature) return json({ error: "missing payment details" }, 400);

  const expected = await hmacSha256Hex(keySecret, `${orderId}|${paymentId}`);
  if (!timingSafeEqual(expected, String(signature).toLowerCase())) {
    return json({ error: "Payment could not be verified" }, 400);
  }

  const { data: order } = await admin
    .from("payment_orders")
    .select("user_id")
    .eq("provider_order_id", orderId)
    .maybeSingle();
  if (!order || order.user_id !== user.id) return json({ error: "order not found" }, 404);

  const { data, error } = await admin.rpc("fulfill_payment_order", {
    p_provider_order_id: orderId,
    p_provider_payment_id: paymentId,
  });
  if (error) {
    console.error("fulfill_payment_order failed", error);
    return json({ error: "Payment received but coins couldn't be added yet - contact support" }, 500);
  }
  const row = Array.isArray(data) ? data[0] : data;
  return json({ ok: true, coins_added: row?.coins_added ?? 0, already_paid: !!row?.already_paid });
});
