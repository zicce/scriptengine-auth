import { ensureServerEnv, serverEnv } from "./server-env";

export function turnstileSiteKey() {
  return serverEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY");
}

export async function verifyTurnstile(token, ip) {
  await ensureServerEnv();
  const secret = serverEnv("TURNSTILE_SECRET_KEY");
  const responseToken = String(token || "").trim();
  if (!secret) {
    const error = new Error("Cloudflare verification is not configured.");
    error.status = 503;
    throw error;
  }
  if (!responseToken) {
    const error = new Error("Complete the Cloudflare check.");
    error.status = 400;
    throw error;
  }

  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", responseToken);
  if (ip) body.set("remoteip", ip);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.success) {
    const error = new Error("Cloudflare verification failed. Try again.");
    error.status = 403;
    throw error;
  }
  return true;
}

export function requestIp(request) {
  const forwarded = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "";
  return forwarded.split(",")[0].trim();
}
