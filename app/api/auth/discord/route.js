import { NextResponse } from "next/server";
import { discordConfig, discordRedirectUri } from "../../../../lib/discord";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { clientId } = await discordConfig();
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: discordRedirectUri(request),
      response_type: "code",
      scope: "identify",
      prompt: "consent",
    });
    return NextResponse.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
  } catch {
    return NextResponse.redirect(new URL("/?error=config", request.url));
  }
}
