import { ensureServerEnv, serverEnv } from "./server-env";

export function discordRedirectUri(request) {
  return `${new URL(request.url).origin}/api/auth/discord/callback`;
}

export async function discordConfig() {
  await ensureServerEnv();
  const clientId = serverEnv("DISCORD_CLIENT_ID");
  const clientSecret = serverEnv("DISCORD_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    const error = new Error("Discord client ID or secret is missing.");
    error.code = "CONFIG_MISSING";
    throw error;
  }
  return { clientId, clientSecret };
}

export function isDiscordId(value) {
  return /^\d{17,20}$/.test(String(value || "").trim());
}

export function discordAvatarUrl(user) {
  const id = String(user?.id || "");
  if (!id) return "";
  if (user.avatar) {
    const ext = String(user.avatar).startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${id}/${user.avatar}.${ext}?size=64`;
  }
  let index = 0;
  try {
    index = Number((BigInt(id) >> 22n) % 6n);
  } catch {
    index = 0;
  }
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}
