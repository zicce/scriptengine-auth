import { NextResponse } from "next/server";
import { requireAdmin } from "../../../../lib/require-admin";
import { parseVariantInput } from "../../../../lib/variant-input";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const applicationId = String(body.applicationId || body.application_id || "").trim();
  if (!applicationId) {
    return NextResponse.json({ error: "Application is required." }, { status: 400 });
  }

  const parsed = parseVariantInput(body);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { count } = await auth.supabase
    .from("application_variants")
    .select("id", { count: "exact", head: true })
    .eq("application_id", applicationId);

  const { error } = await auth.supabase.from("application_variants").insert({
    application_id: applicationId,
    label: parsed.label,
    duration_value: parsed.duration_value,
    duration_unit: parsed.duration_unit,
    price: parsed.price,
    sort_order: count || 0,
    active: true,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ error: "Variant id is required." }, { status: 400 });

  const parsed = parseVariantInput(body);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { error } = await auth.supabase
    .from("application_variants")
    .update({
      label: parsed.label,
      duration_value: parsed.duration_value,
      duration_unit: parsed.duration_unit,
      price: parsed.price,
    })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ error: "Variant id is required." }, { status: 400 });

  const { data: existing, error: readError } = await auth.supabase
    .from("application_variants")
    .select("id, application_id")
    .eq("id", id)
    .maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 400 });
  if (!existing) return NextResponse.json({ error: "Variant not found." }, { status: 404 });

  const { count, error: countError } = await auth.supabase
    .from("application_variants")
    .select("id", { count: "exact", head: true })
    .eq("application_id", existing.application_id);
  if (countError) return NextResponse.json({ error: countError.message }, { status: 400 });
  if ((count || 0) <= 1) {
    return NextResponse.json({ error: "An application needs at least one variant." }, { status: 400 });
  }

  const { error } = await auth.supabase.from("application_variants").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
