import { NextResponse } from "next/server";
import { MAX_LICENSE_QUANTITY } from "../../../../lib/constants";
import { generateLicenseKey } from "../../../../lib/license-key";
import { readKeyFormat } from "../../../../lib/panel-settings";
import { requireAdmin } from "../../../../lib/require-admin";

export const dynamic = "force-dynamic";

function restoreStatus(license) {
  if (license?.activated_at) {
    if (license.expires_at && new Date(license.expires_at).getTime() < Date.now()) return "Expired";
    return "Active";
  }
  return "Not Activated";
}

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const applicationId = String(body.applicationId || "").trim();
  const variantId = String(body.variantId || "").trim();
  const quantity = Math.trunc(Number(body.quantity));

  if (!applicationId) return NextResponse.json({ error: "Select an application." }, { status: 400 });
  if (!variantId) return NextResponse.json({ error: "Select a variant." }, { status: 400 });
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > MAX_LICENSE_QUANTITY) {
    return NextResponse.json({ error: `Quantity must be between 1 and ${MAX_LICENSE_QUANTITY}.` }, { status: 400 });
  }

  const { data: variant, error: variantError } = await auth.supabase
    .from("application_variants")
    .select("id, application_id, label, duration_value, duration_unit, active")
    .eq("id", variantId)
    .maybeSingle();

  if (variantError) return NextResponse.json({ error: variantError.message }, { status: 400 });
  if (!variant || variant.application_id !== applicationId || variant.active === false) {
    return NextResponse.json({ error: "That variant does not belong to the selected application." }, { status: 400 });
  }

  const { data: application, error: appError } = await auth.supabase
    .from("applications")
    .select("id, keys_locked")
    .eq("id", applicationId)
    .maybeSingle();
  if (appError) return NextResponse.json({ error: appError.message }, { status: 400 });
  if (application?.keys_locked) {
    return NextResponse.json({ error: "Key generation is locked for this application." }, { status: 400 });
  }

  const { format: keyFormat } = await readKeyFormat(auth.supabase);

  const rows = Array.from({ length: quantity }, () => ({
    license_key: generateLicenseKey(keyFormat),
    application_id: applicationId,
    variant_id: variant.id,
    variant_label: variant.label,
    status: "Not Activated",
    duration_value: variant.duration_value,
    duration_unit: variant.duration_unit,
    hwid: null,
    activated_at: null,
    expires_at: null,
  }));

  let created = null;
  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data, error } = await auth.supabase.from("licenses").insert(rows).select("license_key");
    if (!error) {
      created = data;
      break;
    }
    lastError = error;
    if (error.code !== "23505") break;
    rows.forEach((row) => {
      row.license_key = generateLicenseKey(keyFormat);
    });
  }

  if (!created) {
    return NextResponse.json({ error: lastError?.message || "Could not generate licenses." }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    keys: created.map((row) => row.license_key),
  });
}

export async function PATCH(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  const action = String(body.action || "").trim();
  if (!id) return NextResponse.json({ error: "License id is required." }, { status: 400 });

  if (action === "reset_hwid") {
    const { error } = await auth.supabase.from("licenses").update({ hwid: null }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (action === "ban") {
    const reason = String(body.reason || "").trim().slice(0, 180) || null;
    const { error } = await auth.supabase.from("licenses").update({ status: "Banned", ban_reason: reason }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (action === "unban") {
    const { data: license, error: readError } = await auth.supabase
      .from("licenses")
      .select("activated_at, expires_at")
      .eq("id", id)
      .maybeSingle();
    if (readError) return NextResponse.json({ error: readError.message }, { status: 400 });
    if (!license) return NextResponse.json({ error: "License not found." }, { status: 404 });

    const { error } = await auth.supabase
      .from("licenses")
      .update({ status: restoreStatus(license), ban_reason: null })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown license action." }, { status: 400 });
}

export async function DELETE(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ error: "License id is required." }, { status: 400 });

  const { error } = await auth.supabase.from("licenses").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
