import { NextResponse } from "next/server";
import { requestIp, verifyTurnstile } from "../../../../lib/turnstile";

export const dynamic = "force-dynamic";

export async function POST(request) {
  let token = "";
  try {
    const body = await request.json();
    token = body?.token || "";
  } catch {
    token = "";
  }
  try {
    await verifyTurnstile(token, requestIp(request));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Cloudflare verification failed." }, { status: error.status || 403 });
  }
}
