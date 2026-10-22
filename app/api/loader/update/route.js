import { NextResponse } from "next/server";
import { DEFAULT_COLOR, DEFAULT_PRIMARY, DEFAULT_SECONDARY, decodeSavedBrand, parseHexColor, patchLoaderAuth, readEmbeddedVersion } from "../../../../lib/loader-brand";
import { buildBrandedLoader } from "../../../../lib/loader-build";
import { isOwnerBlacklisted, loaderSetupError, readLoaderBinary, readLoaderMeta } from "../../../../lib/loader-store";
import { LOADER_REPLACED_MESSAGE, loaderGeneration, loaderPublicUrl } from "../../../../lib/loader-token";
import { getSupabaseAdmin } from "../../../../lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sameVersion(a, b) {
  const clean = (value) => String(value || "").trim().replace(/^v/i, "").toLowerCase();
  return Boolean(clean(a)) && clean(a) === clean(b);
}

async function latestUploaded(supabase) {
  const meta = await readLoaderMeta(supabase);
  if (meta.error) {
    const setup = loaderSetupError(meta.error);
    return { error: NextResponse.json({ error: setup.message }, { status: setup.missing ? 503 : 400 }) };
  }
  if (!meta.loader.uploaded) return { error: NextResponse.json({ error: "No loader has been uploaded yet." }, { status: 409 }) };
  if (meta.loader.status === "maintenance") {
    return { error: NextResponse.json({ error: "Loader is under maintenance." }, { status: 423 }) };
  }
  const source = await readLoaderBinary(supabase);
  if (!source) return { error: NextResponse.json({ error: "Loader file is missing on the server. Try again later." }, { status: 409 }) };
  if (!sameVersion(readEmbeddedVersion(source), meta.loader.version)) {
    return { error: NextResponse.json({ error: "The newest loader has not been uploaded yet. Try again later." }, { status: 409 }) };
  }
  return { meta, source };
}

export async function GET(request) {
  const token = new URL(request.url).searchParams.get("token") || "";

  let supabase;
  try {
    supabase = await getSupabaseAdmin();
  } catch {
    return NextResponse.json({ error: "Server is not configured." }, { status: 503 });
  }

  const latest = await latestUploaded(supabase);
  if (latest.error) return latest.error;

  if (!token) {
    const stamped = patchLoaderAuth(latest.source, { version: latest.meta.loader.version || "1.0.0", token: "", url: loaderPublicUrl(request) });
    if (stamped.error) return NextResponse.json({ error: stamped.error }, { status: 400 });
    return new NextResponse(new Uint8Array(stamped.buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": 'attachment; filename="Loader.exe"',
        "Content-Length": String(stamped.buffer.length),
        "Cache-Control": "no-store",
      },
    });
  }

  const generation = await loaderGeneration(supabase, token);
  if (generation.error === "replaced") return NextResponse.json({ error: LOADER_REPLACED_MESSAGE }, { status: 403 });
  if (generation.error === "invalid") return NextResponse.json({ error: "This loader is not linked to a reseller." }, { status: 401 });
  if (generation.error === "unavailable") return NextResponse.json({ error: "Could not read the reseller." }, { status: 503 });
  if (generation.error === "missing") return NextResponse.json({ error: "This reseller no longer exists." }, { status: 404 });

  const { data: reseller, error } = await supabase
    .from("resellers")
    .select("id, discord_id, loader_brand, loader_color")
    .eq("id", generation.resellerId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Could not read the reseller." }, { status: 503 });
  if (!reseller) return NextResponse.json({ error: "This reseller no longer exists." }, { status: 404 });

  const blocked = await isOwnerBlacklisted(supabase, reseller.discord_id);
  if (blocked.error) return NextResponse.json({ error: "Could not check the blacklist." }, { status: 503 });
  if (blocked.blacklisted) return NextResponse.json({ error: "This reseller has been blacklisted." }, { status: 403 });

  const saved = decodeSavedBrand(reseller.loader_brand || "");
  const color = parseHexColor(reseller.loader_color);
  const file = await buildBrandedLoader(supabase, {
    primary: saved.primary || DEFAULT_PRIMARY,
    secondary: saved.primary ? saved.secondary : DEFAULT_SECONDARY,
    color: color.error ? parseHexColor(DEFAULT_COLOR) : color,
    resellerId: reseller.id,
    url: loaderPublicUrl(request),
    buildId: generation.active || "",
  });
  if (file.error) return file.error;
  return file.response;
}
