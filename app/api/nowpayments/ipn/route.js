import { NextResponse } from "next/server";
import { creditFinishedPayment, verifyIpn } from "../../../../lib/nowpayments";
import { ensureServerEnv, serverEnv } from "../../../../lib/server-env";
import { getSupabaseAdmin } from "../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function POST(request) {
  await ensureServerEnv();
  const secret = serverEnv("NOWPAYMENTS_IPN_SECRET");
  if (!secret) return NextResponse.json({ error: "Not configured." }, { status: 503 });

  const rawBody = await request.text();
  const verified = await verifyIpn(rawBody, request.headers.get("x-nowpayments-sig"), secret);
  if (!verified.ok) return NextResponse.json({ error: "Invalid signature." }, { status: 400 });

  try {
    const supabase = await getSupabaseAdmin();
    await creditFinishedPayment(supabase, verified.body);
  } catch (error) {
    // A non-2xx answer makes NOWPayments send the notification again.
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
