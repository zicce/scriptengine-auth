import { createClient } from "@supabase/supabase-js";
import { ensureServerEnv, serverEnv } from "./server-env";

let client;

export async function getSupabaseAdmin() {
  await ensureServerEnv();
  if (client) return client;

  const url = serverEnv("SUPABASE_URL") || serverEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = serverEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    const error = new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    error.code = "CONFIG_MISSING";
    throw error;
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
