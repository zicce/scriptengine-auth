import { NextResponse } from "next/server";
import { creditPaidIntent, creditPaidSession, verifyWebhook } from "../../../../lib/stripe";
import { ensureServerEnv, serverEnv } from "../../../../lib/server-env";
import { getSupabaseAdmin } from "../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

const PAID_EVENTS = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded"]);
const INTENT_EVENT = "payment_intent.succeeded";

export async function POST(request) {
  await ensureServerEnv();
  const secret = serverEnv("STRIPE_WEBHOOK_SECRET");
  if (!secret) return NextResponse.json({ error: "Webhook is not configured." }, { status: 503 });

  const rawBody = await request.text();
  const valid = await verifyWebhook(rawBody, request.headers.get("stripe-signature"), secret);
  if (!valid) return NextResponse.json({ error: "Invalid signature." }, { status: 400 });

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  if (PAID_EVENTS.has(event.type) || event.type === INTENT_EVENT) {
    try {
      const supabase = await getSupabaseAdmin();
      if (event.type === INTENT_EVENT) await creditPaidIntent(supabase, event.data?.object);
      else await creditPaidSession(supabase, event.data?.object);
    } catch (error) {
      // A non-2xx answer makes Stripe retry the event.
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }
  return NextResponse.json({ received: true });
}
