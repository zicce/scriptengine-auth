import { NextResponse } from "next/server";
import { isMissingTableError } from "../../../../lib/constants";
import { normalizeKeyFormat } from "../../../../lib/key-format";
import { requireAdmin } from "../../../../lib/require-admin";

export const dynamic = "force-dynamic";

export async function PATCH(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const format = normalizeKeyFormat(body);
  if (format.error) return NextResponse.json({ error: format.error }, { status: 400 });

  const { error } = await auth.supabase.from("panel_settings").upsert({
    id: "global",
    key_pattern: format.pattern,
    key_uppercase: format.uppercase,
    key_digits: format.digits,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    const missing = isMissingTableError(error);
    return NextResponse.json(
      {
        error: missing
          ? "Key format storage is missing. Run supabase/migrate-key-format.sql in the Supabase SQL Editor."
          : error.message,
      },
      { status: missing ? 503 : 400 }
    );
  }

  return NextResponse.json({ ok: true, keyFormat: format });
}
