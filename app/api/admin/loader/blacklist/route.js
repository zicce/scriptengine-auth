import { NextResponse } from "next/server";
import { listBlacklist, loaderSetupError, normalizeDiscordId } from "../../../../../lib/loader-store";
import { requireAdmin } from "../../../../../lib/require-admin";

export const dynamic = "force-dynamic";

function setupResponse(error) {
  const setup = loaderSetupError(error);
  return NextResponse.json({ error: setup.message }, { status: setup.missing ? 503 : 400 });
}

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const discord = normalizeDiscordId(body.discordId);
  if (discord.error) return NextResponse.json({ error: discord.error }, { status: 400 });

  const { error } = await auth.supabase.from("loader_blacklist").upsert({
    discord_id: discord.discordId,
    created_at: new Date().toISOString(),
  });
  if (error) return setupResponse(error);

  const blacklist = await listBlacklist(auth.supabase);
  if (blacklist.error) return setupResponse(blacklist.error);
  return NextResponse.json({ blacklist: blacklist.blacklist });
}

export async function DELETE(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const discord = normalizeDiscordId(body.discordId);
  if (discord.error) return NextResponse.json({ error: discord.error }, { status: 400 });

  const { error } = await auth.supabase.from("loader_blacklist").delete().eq("discord_id", discord.discordId);
  if (error) return setupResponse(error);

  const blacklist = await listBlacklist(auth.supabase);
  if (blacklist.error) return setupResponse(blacklist.error);
  return NextResponse.json({ blacklist: blacklist.blacklist });
}
