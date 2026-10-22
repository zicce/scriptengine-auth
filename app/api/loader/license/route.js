import { readLoaderMeta, isOwnerBlacklisted } from "../../../../lib/loader-store";
import { LOADER_REPLACED_MESSAGE, loaderGeneration } from "../../../../lib/loader-token";
import { getSupabaseAdmin } from "../../../../lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function reply(lines, status = 200) {
  const text = Object.entries(lines)
    .map(([key, value]) => `${key}=${String(value ?? "").replace(/[\r\n]+/g, " ")}`)
    .join("\n");
  return new Response(`${text}\n`, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function fail(message, status = 200) {
  return reply({ status: "error", message }, status);
}

function addDuration(from, value, unit) {
  if (unit === "lifetime") return null;
  const amount = Math.max(1, Number(value) || 1);
  const date = new Date(from);
  if (unit === "hours") date.setUTCHours(date.getUTCHours() + amount);
  else if (unit === "months") date.setUTCMonth(date.getUTCMonth() + amount);
  else if (unit === "years") date.setUTCFullYear(date.getUTCFullYear() + amount);
  else date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString();
}

function lockedHash(stored) {
  return String(stored || "").split("|")[0];
}

function hasHardwareInfo(stored) {
  return String(stored || "").includes("|");
}

function encodeHwid(hash, hardware) {
  const info = Object.fromEntries(Object.entries(hardware).filter(([, value]) => value));
  if (!Object.keys(info).length) return hash;
  return `${hash}|${Buffer.from(JSON.stringify(info)).toString("base64url")}`;
}

async function readForm(request) {
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/json")) return request.json().catch(() => ({}));
  const text = await request.text().catch(() => "");
  return Object.fromEntries(new URLSearchParams(text));
}

export async function POST(request) {
  const body = await readForm(request);
  const key = String(body.key || "").trim().slice(0, 96);
  const hwid = String(body.hwid || "").trim().slice(0, 128);
  const token = String(body.token || "").trim();
  const hardware = Object.fromEntries(
    ["board", "gpu", "cpu", "ram"].map((field) => [field, String(body[field] || "").replace(/[\r\n|]+/g, " ").trim().slice(0, 160)])
  );

  if (!key) return fail("Enter your license.");
  if (!/^[0-9a-f]{32,128}$/i.test(hwid)) return fail("Could not read this PC's ID. Restart the loader and try again.");

  let supabase;
  try {
    supabase = await getSupabaseAdmin();
  } catch {
    return fail("Server is not configured. Try again later.", 503);
  }

  let resellerId = null;
  if (token) {
    const generation = await loaderGeneration(supabase, token);
    if (generation.error === "replaced") return fail(LOADER_REPLACED_MESSAGE);
    if (generation.error === "invalid") return fail("This loader is not linked to a reseller. Download it again from your reseller.");
    if (generation.error === "unavailable") return fail("Could not check the license. Try again later.", 503);
    if (generation.error === "missing") return fail("This reseller no longer exists.");
    resellerId = generation.resellerId;
  }

  const meta = await readLoaderMeta(supabase);
  if (meta.error) return fail("Could not check the license. Try again later.", 503);
  if (meta.loader.status === "maintenance") return fail("Loader is under maintenance.");

  if (resellerId) {
    const { data: reseller, error } = await supabase.from("resellers").select("id, discord_id").eq("id", resellerId).maybeSingle();
    if (error) return fail("Could not check the license. Try again later.", 503);
    if (!reseller) return fail("This reseller no longer exists.");
    const blocked = await isOwnerBlacklisted(supabase, reseller.discord_id);
    if (blocked.error) return fail("Could not check the license. Try again later.", 503);
    if (blocked.blacklisted) return fail("This reseller has been blacklisted.");
  }

  const columns = "id, license_key, application_id, variant_label, status, duration_value, duration_unit, hwid, ban_reason, activated_at, expires_at, reseller_id";
  let { data: license, error } = await supabase.from("licenses").select(columns).eq("license_key", key).maybeSingle();
  if (!error && !license && key.toUpperCase() !== key) {
    ({ data: license, error } = await supabase.from("licenses").select(columns).eq("license_key", key.toUpperCase()).maybeSingle());
  }
  if (error) return fail("Could not check the license. Try again later.", 503);
  if (!license || (resellerId && license.reseller_id !== resellerId)) return fail("This license does not exist.");

  if (license.status === "Banned") {
    return fail(license.ban_reason ? `This user is banned. Reason: ${license.ban_reason}` : "This user is banned.");
  }

  const { data: application } = await supabase.from("applications").select("name, status").eq("id", license.application_id).maybeSingle();
  if (application?.status === "Maintenance") return fail(`${application.name || "This product"} is under maintenance.`);
  if (application?.status === "Disabled") return fail(`${application.name || "This product"} is disabled.`);

  if (license.hwid && lockedHash(license.hwid) !== hwid) {
    return fail("Hardware identification mismatch. Ask your reseller to reset HWID.");
  }
  const stampedHwid = encodeHwid(hwid, hardware);

  const now = new Date();
  if (license.activated_at) {
    if (license.status === "Expired") return fail("License key expired.");
    if (license.expires_at && new Date(license.expires_at).getTime() <= now.getTime()) {
      if (license.status !== "Expired") await supabase.from("licenses").update({ status: "Expired" }).eq("id", license.id);
      return fail("License key expired.");
    }
    if (!license.hwid) {
      const { data: bound } = await supabase.from("licenses").update({ hwid: stampedHwid }).eq("id", license.id).is("hwid", null).select("id").maybeSingle();
      if (!bound) return fail("Hardware identification mismatch. Ask your reseller to reset HWID.");
    } else if (!hasHardwareInfo(license.hwid) && stampedHwid !== license.hwid) {
      await supabase.from("licenses").update({ hwid: stampedHwid }).eq("id", license.id).eq("hwid", license.hwid);
    }
  } else {
    const expiresAt = addDuration(now, license.duration_value, license.duration_unit);
    const { data: activated, error: activateError } = await supabase
      .from("licenses")
      .update({ status: "Active", hwid: stampedHwid, activated_at: now.toISOString(), expires_at: expiresAt })
      .eq("id", license.id)
      .is("activated_at", null)
      .select("activated_at, expires_at, hwid")
      .maybeSingle();
    if (activateError) return fail("Could not activate the license. Try again later.", 503);
    if (!activated) return fail("This license was just activated somewhere else. Try again.");
    license = { ...license, ...activated, status: "Active" };
  }

  return reply({
    status: "ok",
    application: application?.name || "",
    variant: license.variant_label || "",
    expires: license.expires_at || "lifetime",
  });
}
