import { NextResponse } from "next/server";
import { isMissingTableError } from "../../../../lib/constants";
import { isDiscordId } from "../../../../lib/discord";
import { normalizeDiscount } from "../../../../lib/pricing";
import { requireAdmin } from "../../../../lib/require-admin";
import { recordTopup } from "../../../../lib/transactions";

export const dynamic = "force-dynamic";

function missingResponse(error) {
  if (!isMissingTableError(error)) return null;
  return NextResponse.json(
    { error: "Reseller tables are missing. Run supabase/migrate-resellers.sql in the Supabase SQL Editor." },
    { status: 503 }
  );
}

function parseBody(body) {
  const discordId = String(body.discordId || "").trim();
  const serviceName = String(body.serviceName || "").trim().slice(0, 40);
  const balance = Number(body.balance);
  const applicationIds = [...new Set((Array.isArray(body.applicationIds) ? body.applicationIds : []).map((id) => String(id || "").trim()).filter(Boolean))];
  const teamManagement = body.teamManagement !== false;
  const discountInput = body.discountPercent === undefined || body.discountPercent === "" ? 0 : Number(body.discountPercent);
  if (!Number.isFinite(discountInput) || discountInput < 0 || discountInput > 100) {
    return { error: "Discount must be a number from 0 to 100." };
  }
  const discountPercent = normalizeDiscount(discountInput);
  if (!isDiscordId(discordId)) {
    return { error: "Enter a valid Discord user ID." };
  }
  if (!serviceName) {
    return { error: "Enter a service name." };
  }
  if (!Number.isFinite(balance) || balance < 0 || balance > 1000000) {
    return { error: "Balance must be a number from 0 up." };
  }
  if (!applicationIds.length) {
    return { error: "Select at least one application." };
  }
  return { discordId, serviceName, balance: Math.round(balance * 100) / 100, applicationIds, teamManagement, discountPercent };
}

const DISCOUNT_MISSING = "Discounts are missing. Run supabase/migrate-discount.sql in the Supabase SQL Editor.";

// A zero discount is the column default, so it can still be saved before the migration is run.
async function writeReseller(parsed, run) {
  const base = { discord_id: parsed.discordId, service_name: parsed.serviceName, balance: parsed.balance, team_management: parsed.teamManagement };
  const result = await run({ ...base, discount_percent: parsed.discountPercent });
  if (result.error && /discount_percent/i.test(result.error.message || "")) {
    if (parsed.discountPercent === 0) return run(base);
    return { error: { message: DISCOUNT_MISSING }, discountMissing: true };
  }
  return result;
}

async function replaceAccess(supabase, resellerId, applicationIds) {
  const { data: apps, error: appError } = await supabase.from("applications").select("id").in("id", applicationIds);
  if (appError) return appError;
  if ((apps || []).length !== applicationIds.length) {
    return { message: "One of the selected applications no longer exists." };
  }
  const { error: clearError } = await supabase.from("reseller_applications").delete().eq("reseller_id", resellerId);
  if (clearError) return clearError;
  const { error: insertError } = await supabase.from("reseller_applications").insert(
    applicationIds.map((applicationId) => ({ reseller_id: resellerId, application_id: applicationId }))
  );
  return insertError;
}

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const id = new URL(request.url).searchParams.get("id")?.trim() || "";
  if (!id) return NextResponse.json({ error: "Reseller id is required." }, { status: 400 });

  const { data: reseller, error } = await auth.supabase
    .from("resellers")
    .select("id, discord_id, username, balance, discount_percent, reseller_applications (application_id)")
    .eq("id", id)
    .maybeSingle();
  if (error && /discount_percent/i.test(error.message || "")) {
    return NextResponse.json({ error: DISCOUNT_MISSING }, { status: 503 });
  }
  if (error) {
    const missing = missingResponse(error);
    if (missing) return missing;
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!reseller) return NextResponse.json({ error: "Reseller not found." }, { status: 404 });

  const { data: licenses, error: licenseError } = await auth.supabase
    .from("licenses")
    .select("id, license_key, application_id, variant_id, variant_label, status, duration_value, duration_unit, hwid, ban_reason, activated_at, expires_at, created_at, reseller_id")
    .eq("reseller_id", id)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (licenseError) return NextResponse.json({ error: licenseError.message }, { status: 400 });

  return NextResponse.json({
    reseller: {
      id: reseller.id,
      discordId: reseller.discord_id,
      username: reseller.username || "",
      balance: Number(reseller.balance || 0),
      discountPercent: normalizeDiscount(reseller.discount_percent),
      applicationIds: (reseller.reseller_applications || []).map((entry) => entry.application_id),
    },
    licenses: licenses || [],
  });
}

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  const parsed = parseBody(await request.json().catch(() => ({})));
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { data: created, error, discountMissing } = await writeReseller(parsed, (row) =>
    auth.supabase.from("resellers").insert(row).select("id").single()
  );
  if (discountMissing) return NextResponse.json({ error: error.message }, { status: 503 });
  if (error) {
    const missing = missingResponse(error);
    if (missing) return missing;
    if (error.code === "23505") return NextResponse.json({ error: "That Discord ID is already a reseller." }, { status: 400 });
    if (/team_management/i.test(error.message || "")) {
      return NextResponse.json({ error: "Team management is missing. Run supabase/migrate-team.sql in the Supabase SQL Editor." }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const accessError = await replaceAccess(auth.supabase, created.id, parsed.applicationIds);
  if (accessError) {
    await auth.supabase.from("resellers").delete().eq("id", created.id);
    const missing = missingResponse(accessError);
    if (missing) return missing;
    return NextResponse.json({ error: accessError.message }, { status: 400 });
  }
  if (parsed.balance > 0) await recordTopup(auth.supabase, created.id, parsed.balance);
  return NextResponse.json({ ok: true });
}

export async function PATCH(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ error: "Reseller id is required." }, { status: 400 });

  const balanceAction = String(body.balanceAction || "").trim();
  if (balanceAction === "add" || balanceAction === "remove") {
    const amount = Math.round(Number(body.amount) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) {
      return NextResponse.json({ error: "Enter an amount greater than 0." }, { status: 400 });
    }

    const { data: reseller, error: readError } = await auth.supabase
      .from("resellers")
      .select("id, balance")
      .eq("id", id)
      .maybeSingle();
    if (readError) {
      const missing = missingResponse(readError);
      if (missing) return missing;
      return NextResponse.json({ error: readError.message }, { status: 400 });
    }
    if (!reseller) return NextResponse.json({ error: "Reseller not found." }, { status: 404 });

    const current = Number(reseller.balance || 0);
    const next = Math.round((balanceAction === "remove" ? current - amount : current + amount) * 100) / 100;
    if (next < 0) return NextResponse.json({ error: "Balance cannot go below €0.00." }, { status: 400 });
    if (next > 1000000) return NextResponse.json({ error: "Balance cannot go above €1000000.00." }, { status: 400 });

    const { data: updated, error } = await auth.supabase
      .from("resellers")
      .update({ balance: next })
      .eq("id", id)
      .eq("balance", current)
      .select("balance")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!updated) return NextResponse.json({ error: "Balance changed. Try again." }, { status: 409 });
    if (balanceAction === "add") await recordTopup(auth.supabase, id, amount);
    return NextResponse.json({ ok: true, balance: Number(updated.balance) });
  }

  const parsed = parseBody(body);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { data: existing, error: readError } = await auth.supabase
    .from("resellers")
    .select("balance")
    .eq("id", id)
    .maybeSingle();
  if (readError) {
    const missing = missingResponse(readError);
    if (missing) return missing;
    return NextResponse.json({ error: readError.message }, { status: 400 });
  }
  if (!existing) return NextResponse.json({ error: "Reseller not found." }, { status: 404 });

  const { error, discountMissing } = await writeReseller(parsed, (row) =>
    auth.supabase.from("resellers").update(row).eq("id", id)
  );
  if (discountMissing) return NextResponse.json({ error: error.message }, { status: 503 });
  if (error) {
    const missing = missingResponse(error);
    if (missing) return missing;
    if (error.code === "23505") return NextResponse.json({ error: "That Discord ID is already a reseller." }, { status: 400 });
    if (/team_management/i.test(error.message || "")) {
      return NextResponse.json({ error: "Team management is missing. Run supabase/migrate-team.sql in the Supabase SQL Editor." }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const previous = Number(existing.balance || 0);
  if (parsed.balance > previous) {
    await recordTopup(auth.supabase, id, Math.round((parsed.balance - previous) * 100) / 100);
  }

  const accessError = await replaceAccess(auth.supabase, id, parsed.applicationIds);
  if (accessError) {
    const missing = missingResponse(accessError);
    if (missing) return missing;
    return NextResponse.json({ error: accessError.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ error: "Reseller id is required." }, { status: 400 });
  const { error } = await auth.supabase.from("resellers").delete().eq("id", id);
  if (error) {
    const missing = missingResponse(error);
    if (missing) return missing;
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
