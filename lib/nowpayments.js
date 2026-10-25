import { CRYPTO_BONUS_PERCENT } from "./pricing";
import { ensureServerEnv, serverEnv } from "./server-env";

const API = "https://api.nowpayments.io/v1";
const CURRENCY = "eur";

async function apiKey() {
  await ensureServerEnv();
  const key = serverEnv("NOWPAYMENTS_API_KEY");
  if (!key) {
    const error = new Error("Crypto payments are not configured yet.");
    error.status = 503;
    throw error;
  }
  return key;
}

async function npFetch(path, { method = "GET", json } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      "x-api-key": await apiKey(),
      ...(json ? { "Content-Type": "application/json" } : {}),
    },
    body: json ? JSON.stringify(json) : undefined,
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.message || "NOWPayments request failed.");
    error.status = response.status >= 500 ? 502 : 400;
    throw error;
  }
  return payload;
}

export function cryptoBonus(amount) {
  return Math.round(Number(amount) * CRYPTO_BONUS_PERCENT) / 100;
}

// The customer pays the network fee, so the invoice is for exactly the amount we credit.
export async function createInvoice({ depositId, amount, origin }) {
  return npFetch("/invoice", {
    method: "POST",
    json: {
      price_amount: Number(amount),
      price_currency: CURRENCY,
      order_id: depositId,
      order_description: "Account balance top-up",
      ipn_callback_url: `${origin}/api/nowpayments/ipn`,
      success_url: `${origin}/panel/deposit?np=success`,
      cancel_url: `${origin}/panel/deposit?np=cancel`,
      is_fee_paid_by_user: true,
    },
  });
}

export async function getPayment(id) {
  return npFetch(`/payment/${encodeURIComponent(id)}`);
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((out, key) => {
        out[key] = sortKeys(value[key]);
        return out;
      }, {});
  }
  return value;
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// NOWPayments signs the notification body (keys sorted, compact JSON) with HMAC-SHA512.
export async function verifyIpn(rawBody, signature, secret) {
  if (!signature || !secret) return { ok: false };
  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return { ok: false };
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );
  const expected = toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(JSON.stringify(sortKeys(body)))));
  return { ok: timingSafeEqual(String(signature).toLowerCase(), expected), body };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Credits a deposit once its payment is finished. A notification alone is never enough:
// it must be signed, match a deposit this server created, and be confirmed by NOWPayments.
export async function creditFinishedPayment(supabase, notice) {
  if (!notice || notice.payment_status !== "finished") return { credited: false, reason: "not-finished" };
  const orderId = String(notice.order_id || "");
  if (!UUID.test(orderId) || !notice.payment_id) return { credited: false, reason: "invalid" };

  const { data: deposit, error: depositError } = await supabase
    .from("reseller_deposits")
    .select("id, reseller_id, amount, status, provider")
    .eq("id", orderId)
    .maybeSingle();
  if (depositError) throw missingTable(depositError);
  if (!deposit || deposit.provider !== "nowpayments") return { credited: false, reason: "unknown-order" };

  const payment = await getPayment(notice.payment_id);
  const expected = Number(deposit.amount);
  const matches =
    payment.payment_status === "finished" &&
    String(payment.order_id) === deposit.id &&
    String(payment.price_currency || "").toLowerCase() === CURRENCY &&
    Math.abs(Number(payment.price_amount) - expected) < 0.01;
  if (!matches) return { credited: false, reason: "mismatch" };

  const { data, error } = await supabase.rpc("credit_reseller_topup", {
    p_reseller: deposit.reseller_id,
    p_amount: expected,
    p_session: `np:${deposit.id}`,
    p_bonus: cryptoBonus(expected),
  });
  if (error) throw missingTable(error);
  if (data === true) {
    await supabase.from("reseller_deposits").update({ status: "paid" }).eq("id", deposit.id);
  }
  return { credited: data === true };
}

function missingTable(error) {
  const missing = /reseller_deposits|credit_reseller_topup|bonus/i.test(error.message || "");
  const failure = new Error(missing ? "Crypto top-ups need supabase/migrate-nowpayments.sql to be run." : error.message);
  failure.status = missing ? 503 : 500;
  return failure;
}

export { missingTable };
