import { NextResponse } from "next/server";
import { MAX_LICENSE_QUANTITY } from "../../../../lib/constants";
import { generateLicenseKey } from "../../../../lib/license-key";
import { readKeyFormat } from "../../../../lib/panel-settings";
import { requireReseller } from "../../../../lib/require-reseller";
import { recordLicensePurchases } from "../../../../lib/transactions";

export const dynamic = "force-dynamic";

function restoreStatus(license) {
  if (license?.activated_at) {
    if (license.expires_at && new Date(license.expires_at).getTime() < Date.now()) return "Expired";
    return "Active";
  }
  return "Not Activated";
}

export async function POST(request) {
  const auth = await requireReseller();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const applicationId = String(body.applicationId || "").trim();
  const variantId = String(body.variantId || "").trim();
  const quantity = Math.trunc(Number(body.quantity));

  if (!applicationId) return NextResponse.json({ error: "Select an application." }, { status: 400 });
  if (auth.actor.role === "helper" && !auth.actor.canGenerate) {
    return NextResponse.json({ error: "You cannot generate licenses." }, { status: 403 });
  }
  if (auth.actor.role === "helper" && !auth.actor.applicationIds.includes(applicationId)) {
    return NextResponse.json({ error: "You do not have access to that application." }, { status: 403 });
  }
  if (!variantId) return NextResponse.json({ error: "Select a variant." }, { status: 400 });
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > MAX_LICENSE_QUANTITY) {
    return NextResponse.json({ error: `Quantity must be between 1 and ${MAX_LICENSE_QUANTITY}.` }, { status: 400 });
  }

  const { data: access, error: accessError } = await auth.supabase
    .from("reseller_applications")
    .select("application_id")
    .eq("reseller_id", auth.reseller.id)
    .eq("application_id", applicationId)
    .maybeSingle();
  if (accessError) return NextResponse.json({ error: accessError.message }, { status: 400 });
  if (!access) return NextResponse.json({ error: "You do not have access to that application." }, { status: 403 });

  const { data: variant, error: variantError } = await auth.supabase
    .from("application_variants")
    .select("id, application_id, label, duration_value, duration_unit, price, active")
    .eq("id", variantId)
    .maybeSingle();
  if (variantError) return NextResponse.json({ error: variantError.message }, { status: 400 });
  if (!variant || variant.application_id !== applicationId || variant.active === false) {
    return NextResponse.json({ error: "That variant does not belong to the selected application." }, { status: 400 });
  }

  const { data: application, error: appError } = await auth.supabase
    .from("applications")
    .select("id, name, keys_locked")
    .eq("id", applicationId)
    .maybeSingle();
  if (appError) return NextResponse.json({ error: appError.message }, { status: 400 });
  if (application?.keys_locked) {
    return NextResponse.json({ error: "Key generation is locked for this application." }, { status: 400 });
  }

  const unitPrice = Number(variant.price || 0);
  const cost = Math.round(unitPrice * quantity * 100) / 100;
  const balance = Number(auth.reseller.balance || 0);
  if (cost > balance) {
    return NextResponse.json({ error: `Not enough balance. This order costs €${cost.toFixed(2)}.` }, { status: 400 });
  }

  const nextBalance = Math.round((balance - cost) * 100) / 100;
  const { data: charged, error: chargeError } = await auth.supabase
    .from("resellers")
    .update({ balance: nextBalance })
    .eq("id", auth.reseller.id)
    .eq("balance", balance)
    .select("balance")
    .maybeSingle();
  if (chargeError) return NextResponse.json({ error: chargeError.message }, { status: 400 });
  if (!charged) return NextResponse.json({ error: "Balance changed. Try again." }, { status: 409 });

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
    reseller_id: auth.reseller.id,
  }));

  let created = null;
  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data, error } = await auth.supabase.from("licenses").insert(rows).select("id, license_key");
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
    await auth.supabase.from("resellers").update({ balance }).eq("id", auth.reseller.id);
    return NextResponse.json({ error: lastError?.message || "Could not buy licenses." }, { status: 400 });
  }

  await recordLicensePurchases(
    auth.supabase,
    created.map((row) => ({
      reseller_id: auth.reseller.id,
      kind: "license",
      amount: unitPrice,
      application_name: application?.name || "",
      variant_label: variant.label || "",
      license_key: row.license_key,
      license_id: row.id,
    }))
  );

  return NextResponse.json({
    ok: true,
    keys: created.map((row) => row.license_key),
    balance: Number(charged.balance),
    cost,
  });
}

export async function PATCH(request) {
  const auth = await requireReseller();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  const action = String(body.action || "").trim();
  if (!id) return NextResponse.json({ error: "License id is required." }, { status: 400 });
  if (action !== "reset_hwid" && action !== "ban" && action !== "unban") {
    return NextResponse.json({ error: "You can only reset HWID or ban a license." }, { status: 403 });
  }
  if (auth.actor.role === "helper" && action === "reset_hwid" && !auth.actor.canResetHwid) {
    return NextResponse.json({ error: "You cannot reset HWID." }, { status: 403 });
  }
  if (auth.actor.role === "helper" && action !== "reset_hwid" && !auth.actor.canBan) {
    return NextResponse.json({ error: "You cannot ban licenses." }, { status: 403 });
  }

  const { data: license, error: readError } = await auth.supabase
    .from("licenses")
    .select("id, reseller_id, application_id, activated_at, expires_at")
    .eq("id", id)
    .maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 400 });
  if (!license || license.reseller_id !== auth.reseller.id) {
    return NextResponse.json({ error: "License not found." }, { status: 404 });
  }
  if (auth.actor.role === "helper" && !auth.actor.applicationIds.includes(license.application_id)) {
    return NextResponse.json({ error: "License not found." }, { status: 404 });
  }

  if (action === "reset_hwid") {
    const { error } = await auth.supabase.from("licenses").update({ hwid: null }).eq("id", id).eq("reseller_id", auth.reseller.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (action === "ban") {
    const { error } = await auth.supabase
      .from("licenses")
      .update({ status: "Banned", ban_reason: null })
      .eq("id", id)
      .eq("reseller_id", auth.reseller.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  const { error } = await auth.supabase
    .from("licenses")
    .update({ status: restoreStatus(license), ban_reason: null })
    .eq("id", id)
    .eq("reseller_id", auth.reseller.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
