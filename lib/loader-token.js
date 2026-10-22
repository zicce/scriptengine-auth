import { createHmac, timingSafeEqual } from "crypto";
import { decodeSavedBrand } from "./loader-brand";
import { serverEnv } from "./server-env";

export const LOADER_REPLACED_MESSAGE = "Loader is updated, contact seller!";

function secret() {
  return serverEnv("LOADER_TOKEN_SECRET") || serverEnv("SUPABASE_SERVICE_ROLE_KEY");
}

function sign(resellerId, buildId = "") {
  const payload = buildId ? `loader:${resellerId}:${buildId}` : `loader:${resellerId}`;
  return createHmac("sha256", secret()).update(payload).digest("base64url").slice(0, 32);
}

export function signLoaderToken(resellerId, buildId = "") {
  const id = String(buildId || "").trim();
  if (!resellerId || !secret()) return "";
  if (id && !/^[0-9a-f]{16}$/.test(id)) return "";
  const signature = sign(resellerId, id);
  return id ? `${resellerId}.${signature}.${id}` : `${resellerId}.${signature}`;
}

export function parseLoaderToken(token) {
  const parts = String(token || "").trim().split(".");
  if (!secret() || (parts.length !== 2 && parts.length !== 3)) return null;
  const [resellerId, signature, buildId = ""] = parts;
  if (!resellerId || !signature || !/^[0-9a-f-]{36}$/i.test(resellerId)) return null;
  if (buildId && !/^[0-9a-f]{16}$/.test(buildId)) return null;
  const expected = Buffer.from(sign(resellerId, buildId));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return { resellerId, buildId };
}

export function verifyLoaderToken(token) {
  return parseLoaderToken(token)?.resellerId || "";
}

export async function loaderGeneration(supabase, token) {
  const parsed = parseLoaderToken(token);
  if (!parsed) return { error: "invalid" };
  const { data, error } = await supabase.from("resellers").select("loader_brand").eq("id", parsed.resellerId).maybeSingle();
  if (error) return { error: "unavailable" };
  if (!data) return { error: "missing" };
  const active = decodeSavedBrand(data.loader_brand || "").buildId || "";
  if (active && parsed.buildId !== active) return { error: "replaced", resellerId: parsed.resellerId };
  return { resellerId: parsed.resellerId, buildId: parsed.buildId, active };
}

export function loaderPublicUrl(request) {
  const configured = String(process.env.LOADER_PUBLIC_URL || "").trim().replace(/\/+$/, "");
  if (configured) return configured;
  const headers = request.headers;
  const host = headers.get("x-forwarded-host") || headers.get("host") || "";
  const proto = (headers.get("x-forwarded-proto") || new URL(request.url).protocol.replace(":", "") || "https").split(",")[0].trim();
  return host ? `${proto}://${host}` : "";
}
