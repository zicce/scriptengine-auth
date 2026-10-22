import { NextResponse } from "next/server";
import { isMissingTableError } from "../../../../lib/constants";
import { isDiscordId } from "../../../../lib/discord";
import { requireReseller } from "../../../../lib/require-reseller";

export const dynamic = "force-dynamic";

const MAX_HELPERS = 3;

function deny(auth) {
  if (auth.error) return auth.error;
  if (auth.actor.role !== "reseller") {
    return NextResponse.json({ error: "Only the reseller can manage the team." }, { status: 403 });
  }
  if (!auth.reseller.team_management) {
    return NextResponse.json({ error: "Team management is turned off." }, { status: 403 });
  }
  return null;
}

function missingResponse(error) {
  if (!isMissingTableError(error)) return null;
  return NextResponse.json(
    { error: "Team tables are missing. Run supabase/migrate-team.sql in the Supabase SQL Editor." },
    { status: 503 }
  );
}

async function parseHelper(supabase, resellerId, body) {
  const discordId = String(body.discordId || "").trim();
  const applicationIds = [...new Set((Array.isArray(body.applicationIds) ? body.applicationIds : []).map((id) => String(id || "").trim()).filter(Boolean))];
  if (!isDiscordId(discordId)) return { error: "Enter a valid Discord user ID." };
  if (!applicationIds.length) return { error: "Select at least one application." };

  const { data: access, error: accessError } = await supabase
    .from("reseller_applications")
    .select("application_id")
    .eq("reseller_id", resellerId)
    .in("application_id", applicationIds);
  if (accessError) return { error: accessError.message };
  if ((access || []).length !== applicationIds.length) {
    return { error: "A helper can only use applications assigned to you." };
  }

  return {
    discordId,
    applicationIds,
    canGenerate: body.canGenerate === true,
    canResetHwid: body.canResetHwid === true,
    canBan: body.canBan === true,
  };
}

async function replaceHelperAccess(supabase, helperId, applicationIds) {
  const { error: clearError } = await supabase.from("helper_applications").delete().eq("helper_id", helperId);
  if (clearError) return clearError;
  const { error } = await supabase.from("helper_applications").insert(
    applicationIds.map((applicationId) => ({ helper_id: helperId, application_id: applicationId }))
  );
  return error;
}

async function discordConflict(supabase, discordId, resellerId, helperId) {
  if (discordId === String(resellerId)) return "You cannot add your own Discord ID.";
  const { data: owner } = await supabase.from("resellers").select("id, discord_id").eq("id", resellerId).maybeSingle();
  if (owner?.discord_id === discordId) return "You cannot add your own Discord ID.";

  const { data: reseller } = await supabase.from("resellers").select("id").eq("discord_id", discordId).maybeSingle();
  if (reseller) return "That Discord ID already belongs to a reseller.";

  const { data: helper } = await supabase.from("reseller_helpers").select("id").eq("discord_id", discordId).maybeSingle();
  if (helper && helper.id !== helperId) return "That Discord ID is already a helper.";
  return "";
}

export async function POST(request) {
  const auth = await requireReseller();
  const denied = deny(auth);
  if (denied) return denied;

  const parsed = await parseHelper(auth.supabase, auth.reseller.id, await request.json().catch(() => ({})));
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { count, error: countError } = await auth.supabase
    .from("reseller_helpers")
    .select("id", { count: "exact", head: true })
    .eq("reseller_id", auth.reseller.id);
  if (countError) {
    const missing = missingResponse(countError);
    if (missing) return missing;
    return NextResponse.json({ error: countError.message }, { status: 400 });
  }
  if (Number(count || 0) >= MAX_HELPERS) {
    return NextResponse.json({ error: "A reseller can have at most 3 helpers." }, { status: 400 });
  }

  const conflict = await discordConflict(auth.supabase, parsed.discordId, auth.reseller.id, "");
  if (conflict) return NextResponse.json({ error: conflict }, { status: 400 });

  const { data: created, error } = await auth.supabase
    .from("reseller_helpers")
    .insert({
      reseller_id: auth.reseller.id,
      discord_id: parsed.discordId,
      can_generate: parsed.canGenerate,
      can_reset_hwid: parsed.canResetHwid,
      can_ban: parsed.canBan,
    })
    .select("id")
    .single();
  if (error) {
    const missing = missingResponse(error);
    if (missing) return missing;
    if (error.code === "23505") return NextResponse.json({ error: "That Discord ID is already a helper." }, { status: 400 });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const accessError = await replaceHelperAccess(auth.supabase, created.id, parsed.applicationIds);
  if (accessError) {
    await auth.supabase.from("reseller_helpers").delete().eq("id", created.id);
    const missing = missingResponse(accessError);
    if (missing) return missing;
    return NextResponse.json({ error: accessError.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function PATCH(request) {
  const auth = await requireReseller();
  const denied = deny(auth);
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ error: "Helper id is required." }, { status: 400 });

  const { data: existing, error: existingError } = await auth.supabase
    .from("reseller_helpers")
    .select("id")
    .eq("id", id)
    .eq("reseller_id", auth.reseller.id)
    .maybeSingle();
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 400 });
  if (!existing) return NextResponse.json({ error: "Helper not found." }, { status: 404 });

  const parsed = await parseHelper(auth.supabase, auth.reseller.id, body);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const conflict = await discordConflict(auth.supabase, parsed.discordId, auth.reseller.id, id);
  if (conflict) return NextResponse.json({ error: conflict }, { status: 400 });

  const { error } = await auth.supabase
    .from("reseller_helpers")
    .update({
      discord_id: parsed.discordId,
      can_generate: parsed.canGenerate,
      can_reset_hwid: parsed.canResetHwid,
      can_ban: parsed.canBan,
    })
    .eq("id", id)
    .eq("reseller_id", auth.reseller.id);
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "That Discord ID is already a helper." }, { status: 400 });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const accessError = await replaceHelperAccess(auth.supabase, id, parsed.applicationIds);
  if (accessError) return NextResponse.json({ error: accessError.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request) {
  const auth = await requireReseller();
  const denied = deny(auth);
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ error: "Helper id is required." }, { status: 400 });

  const { error } = await auth.supabase.from("reseller_helpers").delete().eq("id", id).eq("reseller_id", auth.reseller.id);
  if (error) {
    const missing = missingResponse(error);
    if (missing) return missing;
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
