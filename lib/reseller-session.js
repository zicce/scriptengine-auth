import { createHmac, timingSafeEqual } from "node:crypto";
import { ensureServerEnv, serverEnv } from "./server-env";

const COOKIE = "se_reseller";
const WEEK = 60 * 60 * 24 * 7;

function secret() {
  const value = serverEnv("DISCORD_CLIENT_SECRET");
  if (!value) {
    const error = new Error("Discord client secret is missing.");
    error.code = "CONFIG_MISSING";
    throw error;
  }
  return value;
}

export function resellerCookieName() {
  return COOKIE;
}

export function signResellerSession(id, role = "reseller") {
  const body = Buffer.from(
    JSON.stringify({
      id,
      role: role === "helper" ? "helper" : "reseller",
      exp: Date.now() + WEEK * 1000,
    })
  ).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readResellerSession(token) {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload?.id || Number(payload.exp) < Date.now()) return null;
    return {
      id: String(payload.id),
      role: payload.role === "helper" ? "helper" : "reseller",
    };
  } catch {
    return null;
  }
}

export function resellerCookieOptions(request) {
  const secure = new URL(request.url).protocol === "https:";
  return {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: WEEK,
  };
}
