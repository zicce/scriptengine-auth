import { NextResponse } from "next/server";
import { generateAppId } from "../../../../lib/app-id";
import { APP_STATUSES } from "../../../../lib/constants";
import { requireAdmin } from "../../../../lib/require-admin";
import { parseVariantInput } from "../../../../lib/variant-input";

export const dynamic = "force-dynamic";

function cleanName(value) {
  return String(value || "").trim().slice(0, 80);
}

function cleanVersion(value) {
  return String(value || "").trim().slice(0, 32);
}

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const name = cleanName(body.name);
  const version = cleanVersion(body.version) || "1.0.0";
  const status = APP_STATUSES.includes(body.status) ? body.status : "Active";

  if (!name) {
    return NextResponse.json({ error: "Application name is required." }, { status: 400 });
  }

  const rawVariants = Array.isArray(body.variants) ? body.variants : [];
  if (!rawVariants.length) {
    return NextResponse.json({ error: "Add at least one variant." }, { status: 400 });
  }

  const variants = [];
  for (const entry of rawVariants) {
    const parsed = parseVariantInput(entry);
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
    variants.push(parsed);
  }

  let created = null;
  let error = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = await auth.supabase
      .from("applications")
      .insert({ app_id: generateAppId(), name, version, status })
      .select("id, app_id")
      .single();
    if (!result.error) {
      created = result.data;
      error = null;
      break;
    }
    error = result.error;
    if (result.error.code !== "23505") break;
  }

  if (error || !created) {
    return NextResponse.json({ error: error?.message || "Could not create the application." }, { status: 400 });
  }

  const rows = variants.map((variant, index) => ({
    application_id: created.id,
    label: variant.label,
    duration_value: variant.duration_value,
    duration_unit: variant.duration_unit,
    price: variant.price,
    sort_order: index,
    active: true,
  }));

  const { error: variantError } = await auth.supabase.from("application_variants").insert(rows);
  if (variantError) {
    await auth.supabase.from("applications").delete().eq("id", created.id);
    return NextResponse.json({ error: variantError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, id: created.id });
}

export async function PATCH(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ error: "Application id is required." }, { status: 400 });

  if (typeof body.keysLocked === "boolean" && body.name === undefined) {
    const { error } = await auth.supabase.from("applications").update({ keys_locked: body.keysLocked }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  const name = cleanName(body.name);
  const version = cleanVersion(body.version);
  const status = String(body.status || "").trim();

  if (!name) return NextResponse.json({ error: "Application name is required." }, { status: 400 });
  if (!version) return NextResponse.json({ error: "Version is required." }, { status: 400 });
  if (!APP_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Choose a valid status." }, { status: 400 });
  }

  const { error } = await auth.supabase.from("applications").update({ name, version, status }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  const confirmName = String(body.name || "");
  if (!id) return NextResponse.json({ error: "Application id is required." }, { status: 400 });

  const { data: application, error: readError } = await auth.supabase
    .from("applications")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 400 });
  if (!application) return NextResponse.json({ error: "Application not found." }, { status: 404 });
  if (confirmName !== application.name) {
    return NextResponse.json({ error: "Type the application name exactly to confirm." }, { status: 400 });
  }

  const { error } = await auth.supabase.from("applications").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
