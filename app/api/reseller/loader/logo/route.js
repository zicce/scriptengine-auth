import { NextResponse } from "next/server";
import { readResellerLogo } from "../../../../../lib/loader-store";
import { requireReseller } from "../../../../../lib/require-reseller";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireReseller();
  if (auth.error) return auth.error;
  if (auth.actor.role === "helper") {
    return NextResponse.json({ error: "Helpers cannot access the loader." }, { status: 403 });
  }
  const stored = await readResellerLogo(auth.supabase, auth.reseller.id);
  if (!stored.logo) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(stored.logo.png), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, no-store",
    },
  });
}
