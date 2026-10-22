import { NextResponse } from "next/server";
import { patchLoaderAuth } from "../../../../../lib/loader-brand";
import { loaderSetupError, readLoaderBinary, readLoaderMeta } from "../../../../../lib/loader-store";
import { loaderPublicUrl } from "../../../../../lib/loader-token";
import { requireAdmin } from "../../../../../lib/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const meta = await readLoaderMeta(auth.supabase);
  if (meta.error) {
    const setup = loaderSetupError(meta.error);
    return NextResponse.json({ error: setup.message }, { status: setup.missing ? 503 : 400 });
  }
  if (!meta.loader.uploaded) return NextResponse.json({ error: "No loader has been uploaded yet." }, { status: 409 });

  const source = await readLoaderBinary(auth.supabase);
  if (!source) return NextResponse.json({ error: "Loader file is missing. Upload it again." }, { status: 409 });

  const stamped = patchLoaderAuth(source, { version: meta.loader.version || "1.0.0", token: "", url: loaderPublicUrl(request) });
  const bytes = stamped.error ? source : stamped.buffer;

  const filename = String(meta.loader.fileName || "Loader.exe").replace(/[^\w.\- ]+/g, "_") || "Loader.exe";
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(bytes.length),
      "Cache-Control": "no-store",
    },
  });
}
