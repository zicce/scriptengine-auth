import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  let db = false;
  let dbMs = null;
  try {
    const supabase = await getSupabaseAdmin();
    const started = performance.now();
    const { error } = await supabase.from("admins").select("id").limit(1);
    db = !error;
    dbMs = db ? Math.max(1, Math.round(performance.now() - started)) : null;
  } catch {
    db = false;
    dbMs = null;
  }
  return NextResponse.json({ ok: true, db, dbMs });
}
