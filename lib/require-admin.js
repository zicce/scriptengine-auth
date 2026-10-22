import { NextResponse } from "next/server";
import { isMissingTableError } from "./constants";
import { getSupabaseAdmin } from "./supabase-admin";

export async function requireAdmin(request) {
  try {
    const header = request.headers.get("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) {
      return { error: NextResponse.json({ error: "Sign in required." }, { status: 401 }) };
    }

    const supabase = await getSupabaseAdmin();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return { error: NextResponse.json({ error: "Session expired. Sign in again." }, { status: 401 }) };
    }

    const { data: adminRow, error: adminError } = await supabase
      .from("admins")
      .select("id, email")
      .eq("id", data.user.id)
      .maybeSingle();

    if (adminError) {
      const missing = isMissingTableError(adminError);
      return {
        error: NextResponse.json(
          {
            error: missing
              ? "Database tables are missing. Run supabase/schema.sql in the Supabase SQL Editor."
              : adminError.message,
          },
          { status: missing ? 503 : 500 }
        ),
      };
    }

    if (!adminRow) {
      return { error: NextResponse.json({ error: "This account is not an admin." }, { status: 403 }) };
    }

    return { supabase, user: data.user, adminRow };
  } catch (error) {
    const missing = error?.code === "CONFIG_MISSING";
    return {
      error: NextResponse.json(
        { error: error?.message || "Server is not configured." },
        { status: missing ? 503 : 500 }
      ),
    };
  }
}
