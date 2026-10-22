import { NextResponse } from "next/server";
import { discordAvatarUrl, discordConfig, discordRedirectUri } from "../../../../../lib/discord";
import { resellerCookieOptions, signResellerSession } from "../../../../../lib/reseller-session";
import { getSupabaseAdmin } from "../../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

function fail(request, code) {
  return NextResponse.redirect(new URL(`/?error=${code}`, request.url));
}

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code) return fail(request, url.searchParams.get("error") ? "denied" : "discord");

  try {
    const { clientId, clientSecret } = await discordConfig();
    const redirectUri = discordRedirectUri(request);
    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });
    const tokenPayload = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !tokenPayload.access_token) return fail(request, "discord");

    const userResponse = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenPayload.access_token}` },
    });
    const user = await userResponse.json().catch(() => ({}));
    if (!userResponse.ok || !user.id) return fail(request, "discord");

    const supabase = await getSupabaseAdmin();
    const username = String(user.global_name || user.username || "").slice(0, 80);
    const avatarUrl = discordAvatarUrl(user);

    const { data: reseller, error } = await supabase
      .from("resellers")
      .select("id")
      .eq("discord_id", String(user.id))
      .maybeSingle();
    if (error) return fail(request, "discord");

    if (reseller) {
      const { error: updateError } = await supabase.from("resellers").update({ username, avatar_url: avatarUrl }).eq("id", reseller.id);
      if (updateError) await supabase.from("resellers").update({ username }).eq("id", reseller.id);
      const response = NextResponse.redirect(new URL("/panel/applications", request.url));
      response.cookies.set("se_reseller", signResellerSession(reseller.id, "reseller"), resellerCookieOptions(request));
      return response;
    }

    const { data: helper, error: helperError } = await supabase
      .from("reseller_helpers")
      .select("id, resellers (team_management)")
      .eq("discord_id", String(user.id))
      .maybeSingle();
    if (helperError) {
      if (/does not exist|schema cache|could not find/i.test(helperError.message || "")) return fail(request, "not_reseller");
      return fail(request, "discord");
    }
    if (!helper) return fail(request, "not_reseller");
    if (helper.resellers?.team_management !== true) return fail(request, "team_off");

    const { error: helperUpdateError } = await supabase
      .from("reseller_helpers")
      .update({ username, avatar_url: avatarUrl })
      .eq("id", helper.id);
    if (helperUpdateError) await supabase.from("reseller_helpers").update({ username }).eq("id", helper.id);

    const response = NextResponse.redirect(new URL("/panel/applications", request.url));
    response.cookies.set("se_reseller", signResellerSession(helper.id, "helper"), resellerCookieOptions(request));
    return response;
  } catch {
    return fail(request, "discord");
  }
}
