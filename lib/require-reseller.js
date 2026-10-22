import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { readResellerSession, resellerCookieName } from "./reseller-session";
import { ensureServerEnv } from "./server-env";
import { getSupabaseAdmin } from "./supabase-admin";

async function loadOwner(supabase, id) {
  let query = await supabase
    .from("resellers")
    .select("id, discord_id, username, avatar_url, balance, created_at, team_management")
    .eq("id", id)
    .maybeSingle();

  if (query.error && /team_management|avatar_url/i.test(query.error.message || "")) {
    query = await supabase
      .from("resellers")
      .select("id, discord_id, username, avatar_url, balance, created_at")
      .eq("id", id)
      .maybeSingle();
  }
  if (query.error && /avatar_url/i.test(query.error.message || "")) {
    query = await supabase.from("resellers").select("id, discord_id, username, balance, created_at").eq("id", id).maybeSingle();
  }

  if (query.error) return { error: NextResponse.json({ error: query.error.message }, { status: 400 }) };
  if (!query.data) return { error: NextResponse.json({ error: "Sign in required." }, { status: 401 }) };

  const reseller = query.data;
  return {
    supabase,
    reseller: { ...reseller, team_management: reseller.team_management === true },
    actor: {
      role: "reseller",
      id: reseller.id,
      discordId: reseller.discord_id,
      username: reseller.username || "",
      avatarUrl: reseller.avatar_url || "",
      createdAt: reseller.created_at,
      canGenerate: true,
      canResetHwid: true,
      canBan: true,
      applicationIds: null,
    },
  };
}

async function loadHelper(supabase, id) {
  const { data, error } = await supabase
    .from("reseller_helpers")
    .select("id, reseller_id, discord_id, username, avatar_url, can_generate, can_reset_hwid, can_ban, created_at, helper_applications (application_id), resellers (id, discord_id, username, avatar_url, balance, created_at, team_management)")
    .eq("id", id)
    .maybeSingle();

  if (error) return { error: NextResponse.json({ error: error.message }, { status: 400 }) };
  const owner = data?.resellers;
  if (!data || !owner || owner.team_management !== true) {
    return { error: NextResponse.json({ error: "Sign in required." }, { status: 401 }) };
  }

  return {
    supabase,
    reseller: owner,
    actor: {
      role: "helper",
      id: data.id,
      discordId: data.discord_id,
      username: data.username || "",
      avatarUrl: data.avatar_url || "",
      createdAt: data.created_at,
      canGenerate: data.can_generate === true,
      canResetHwid: data.can_reset_hwid === true,
      canBan: data.can_ban === true,
      applicationIds: (data.helper_applications || []).map((entry) => entry.application_id),
    },
  };
}

export async function requireReseller() {
  try {
    await ensureServerEnv();
    const jar = await cookies();
    const session = readResellerSession(jar.get(resellerCookieName())?.value);
    if (!session?.id) {
      return { error: NextResponse.json({ error: "Sign in required." }, { status: 401 }) };
    }

    const supabase = await getSupabaseAdmin();
    if (session.role === "helper") return loadHelper(supabase, session.id);
    return loadOwner(supabase, session.id);
  } catch (error) {
    const missing = error?.code === "CONFIG_MISSING";
    return {
      error: NextResponse.json({ error: error?.message || "Server is not configured." }, { status: missing ? 503 : 500 }),
    };
  }
}
