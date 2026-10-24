import { ensureServerEnv, serverEnv } from "./server-env";

const API = "https://api.stripe.com/v1";
export const DEPOSIT_CURRENCY = "eur";
const SIGNATURE_TOLERANCE_S = 300;

async function secretKey() {
  await ensureServerEnv();
  const key = serverEnv("STRIPE_SECRET_KEY");
  if (!key) {
    const error = new Error("Card payments are not configured yet.");
    error.status = 503;
    throw error;
  }
  return key;
}

async function stripeFetch(path, { method = "GET", form } = {}) {
  const key = await secretKey();
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || "Stripe request failed.");
    error.status = response.status >= 500 ? 502 : 400;
    throw error;
  }
  return payload;
}

export async function createDepositSession({ resellerId, amount, origin }) {
  const cents = Math.round(Number(amount) * 100);
  const base = `${origin}/panel/deposit`;
  return stripeFetch("/checkout/sessions", {
    method: "POST",
    form: {
      mode: "payment",
      // Always charge in euros; don't offer location-based converted prices.
      "adaptive_pricing[enabled]": "false",
      client_reference_id: resellerId,
      "metadata[reseller_id]": resellerId,
      "metadata[purpose]": "balance_topup",
      "payment_intent_data[metadata][reseller_id]": resellerId,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": DEPOSIT_CURRENCY,
      "line_items[0][price_data][unit_amount]": String(cents),
      "line_items[0][price_data][product_data][name]": "Account balance top-up",
      success_url: `${base}?stripe=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}?stripe=cancel`,
    },
  });
}

// Google Pay (Express Checkout Element) pays with a PaymentIntent created here.
export async function createDepositIntent({ resellerId, amount }) {
  const cents = Math.round(Number(amount) * 100);
  return stripeFetch("/payment_intents", {
    method: "POST",
    form: {
      amount: String(cents),
      currency: DEPOSIT_CURRENCY,
      "payment_method_types[0]": "card",
      "metadata[reseller_id]": resellerId,
      "metadata[purpose]": "gpay_topup",
    },
  });
}

export async function retrieveIntent(id) {
  return stripeFetch(`/payment_intents/${encodeURIComponent(id)}`);
}

export async function retrieveSession(id) {
  return stripeFetch(`/checkout/sessions/${encodeURIComponent(id)}`);
}

// Credits the reseller once for a paid Checkout Session. Safe to call from both the
// webhook and the return page: the database ignores a session it has already seen.
export async function creditPaidSession(supabase, session) {
  if (!session || session.metadata?.purpose !== "balance_topup") return { credited: false, reason: "ignored" };
  if (session.payment_status !== "paid") return { credited: false, reason: "unpaid" };
  if (String(session.currency || "").toLowerCase() !== DEPOSIT_CURRENCY) return { credited: false, reason: "currency" };
  const resellerId = session.metadata?.reseller_id;
  const amount = Math.round(Number(session.amount_total)) / 100;
  if (!resellerId || !Number.isFinite(amount) || amount <= 0) return { credited: false, reason: "invalid" };

  return creditTopup(supabase, resellerId, amount, session.id);
}

async function creditTopup(supabase, resellerId, amount, paymentId) {
  const { data, error } = await supabase.rpc("credit_reseller_topup", {
    p_reseller: resellerId,
    p_amount: amount,
    p_session: paymentId,
  });
  if (error) {
    const missing = /credit_reseller_topup|stripe_session_id/i.test(error.message || "");
    const failure = new Error(
      missing ? "Stripe top-ups need supabase/migrate-stripe.sql to be run." : error.message
    );
    failure.status = missing ? 503 : 500;
    throw failure;
  }
  return { credited: data === true, amount, resellerId };
}

// Same as creditPaidSession, for a Google Pay PaymentIntent. Checkout payments also create
// PaymentIntents, but without the gpay_topup purpose, so they are never counted twice.
export async function creditPaidIntent(supabase, intent) {
  if (!intent || intent.metadata?.purpose !== "gpay_topup") return { credited: false, reason: "ignored" };
  if (intent.status !== "succeeded") return { credited: false, reason: "unpaid" };
  if (String(intent.currency || "").toLowerCase() !== DEPOSIT_CURRENCY) return { credited: false, reason: "currency" };
  const resellerId = intent.metadata?.reseller_id;
  const amount = Math.round(Number(intent.amount_received)) / 100;
  if (!resellerId || !Number.isFinite(amount) || amount <= 0) return { credited: false, reason: "invalid" };
  return creditTopup(supabase, resellerId, amount, intent.id);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyWebhook(rawBody, header, secret) {
  const parts = String(header || "").split(",").map((part) => part.trim().split("="));
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!timestamp || !signatures.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > SIGNATURE_TOLERANCE_S) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const expected = toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${rawBody}`)));
  return signatures.some((signature) => timingSafeEqual(signature, expected));
}
