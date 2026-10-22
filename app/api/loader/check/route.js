import { readEmbeddedVersion } from "../../../../lib/loader-brand";
import { readLoaderBinary, readLoaderMeta } from "../../../../lib/loader-store";
import { LOADER_REPLACED_MESSAGE, loaderGeneration } from "../../../../lib/loader-token";
import { getSupabaseAdmin } from "../../../../lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function reply(lines, status = 200) {
  return new Response(`${Object.entries(lines).map(([key, value]) => `${key}=${value}`).join("\n")}\n`, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function GET(request) {
  let supabase;
  try {
    supabase = await getSupabaseAdmin();
  } catch {
    return reply({ status: "error" }, 503);
  }
  const token = new URL(request.url).searchParams.get("token") || "";
  if (token) {
    const generation = await loaderGeneration(supabase, token);
    if (generation.error === "replaced") return reply({ status: "replaced", message: LOADER_REPLACED_MESSAGE });
    if (generation.error === "invalid") return reply({ status: "error" }, 401);
    if (generation.error === "unavailable") return reply({ status: "error" }, 503);
    if (generation.error === "missing") return reply({ status: "error" }, 404);
  }
  const meta = await readLoaderMeta(supabase);
  if (meta.error) return reply({ status: "error" }, 503);
  const latest = meta.loader.uploaded ? readEmbeddedVersion(await readLoaderBinary(supabase)) : "";
  return reply({
    status: meta.loader.status === "maintenance" ? "maintenance" : "online",
    version: meta.loader.version || "",
    latest: latest || "",
  });
}
