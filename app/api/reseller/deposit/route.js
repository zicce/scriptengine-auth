import { NextResponse } from "next/server";
import { requireReseller } from "../../../../lib/require-reseller";
import { createInvoice, missingTable } from "../../../../lib/nowpayments";
import { createDepositSession, creditPaidSession, retrieveSession } from "../../../../lib/stripe";

export const dynamic = "force-dynamic";

const MIN_DEPOSIT = 25;
const MAX_DEPOSIT = 2500;

function owner(auth) {
  if (auth.error) return auth.error;
  if (auth.actor.role === "helper") {
    return NextResponse.json({ error: "Helpers cannot deposit." }, { status: 403 });
  }
  return null;
}

function fail(error) {
  return NextResponse.json({ error: error.message || "Payment failed." }, { status: error.status || 500 });
}

export async function POST(request) {
  const auth = await requireReseller();
  const denied = owner(auth);
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  if (body.method !== "card" && body.method !== "crypto") {
    return NextResponse.json({ error: "That payment method is not available yet." }, { status: 400 });
  }
  const amount = Math.round(Number(body.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount < MIN_DEPOSIT || amount > MAX_DEPOSIT) {
    return NextResponse.json({ error: `Enter an amount from €${MIN_DEPOSIT} to €${MAX_DEPOSIT}.` }, { status: 400 });
  }

  try {
    if (body.method === "crypto") {
      const origin = new URL(request.url).origin;
      const { data: deposit, error } = await auth.supabase
        .from("reseller_deposits")
        .insert({ reseller_id: auth.reseller.id, provider: "nowpayments", amount })
        .select("id")
        .single();
      if (error) throw missingTable(error);
      const invoice = await createInvoice({ depositId: deposit.id, amount, origin });
      await auth.supabase.from("reseller_deposits").update({ provider_ref: String(invoice.id) }).eq("id", deposit.id);
      return NextResponse.json({ url: invoice.invoice_url });
    }
    const session = await createDepositSession({
      resellerId: auth.reseller.id,
      amount,
      origin: new URL(request.url).origin,
    });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    return fail(error);
  }
}

// Called when the reseller comes back from Stripe. Confirms the payment directly with
// Stripe so the balance is right even if the webhook has not arrived yet.
export async function GET(request) {
  const auth = await requireReseller();
  const denied = owner(auth);
  if (denied) return denied;

  const params = new URL(request.url).searchParams;
  const sessionId = params.get("session_id") || "";
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
    return NextResponse.json({ error: "Missing payment session." }, { status: 400 });
  }

  try {
    const session = await retrieveSession(sessionId);
    if (session.metadata?.reseller_id !== auth.reseller.id) {
      return NextResponse.json({ error: "That payment belongs to another account." }, { status: 403 });
    }
    const result = await creditPaidSession(auth.supabase, session);
    return NextResponse.json({ paid: session.payment_status === "paid", credited: result.credited === true });
  } catch (error) {
    return fail(error);
  }
}
