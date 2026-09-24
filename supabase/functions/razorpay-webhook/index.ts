// POST /functions/v1/razorpay-webhook   (called by Razorpay, not the app)
//
// Server-to-server confirmation, so coins never depend on the buyer's
// browser finishing the checkout:
//   payment.captured / order.paid -> fulfill_payment_order (adds coins once)
//   refund.processed              -> refund_payment_order (takes coins back
//                                    and claws back the owners' share)
// Authenticated by Razorpay's X-Razorpay-Signature: HMAC-SHA256 of the raw
// body with the webhook secret. Deployed with verify_jwt = false because
// Razorpay can't send a Supabase JWT.
//
// Secrets: RAZORPAY_WEBHOOK_SECRET (Razorpay Dashboard -> Webhooks).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
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
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const secret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
  if (!secret) return json({ error: "webhook not configured" }, 503);

  const raw = await req.text();
  const signature = (req.headers.get("X-Razorpay-Signature") || "").toLowerCase();
  const expected = await hmacSha256Hex(secret, raw);
  if (!signature || !timingSafeEqual(expected, signature)) return json({ error: "bad signature" }, 401);

  let event: any;
  try { event = JSON.parse(raw); } catch { return json({ error: "bad body" }, 400); }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const payment = event?.payload?.payment?.entity;

  switch (event?.event) {
    case "payment.captured":
    case "order.paid": {
      const orderId = payment?.order_id ?? event?.payload?.order?.entity?.id;
      if (!orderId || !payment?.id) return json({ ok: true, ignored: "no order/payment id" });
      // Only orders we created (payment_orders) are fulfilled; anything else is ignored.
      const { data: known } = await admin.from("payment_orders").select("id").eq("provider_order_id", orderId).maybeSingle();
      if (!known) return json({ ok: true, ignored: "unknown order" });
      const { error } = await admin.rpc("fulfill_payment_order", { p_provider_order_id: orderId, p_provider_payment_id: payment.id });
      if (error) {
        console.error("fulfill_payment_order failed", orderId, error);
        return json({ error: "fulfil failed" }, 500); // non-2xx -> Razorpay retries
      }
      return json({ ok: true });
    }
    case "refund.processed": {
      const refund = event?.payload?.refund?.entity;
      if (!refund?.id || !refund?.payment_id || !refund?.amount) return json({ ok: true, ignored: "incomplete refund" });
      const { data: known } = await admin.from("payment_orders").select("id").eq("provider_payment_id", refund.payment_id).maybeSingle();
      if (!known) return json({ ok: true, ignored: "unknown payment" });
      const { error } = await admin.rpc("refund_payment_order", {
        p_provider_payment_id: refund.payment_id,
        p_provider_refund_id: refund.id,
        p_amount_paise: refund.amount,
      });
      if (error) {
        console.error("refund_payment_order failed", refund.id, error);
        return json({ error: "refund failed" }, 500);
      }
      return json({ ok: true });
    }
    default:
      return json({ ok: true, ignored: event?.event ?? "unknown" });
  }
});
