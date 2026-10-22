import { NextResponse } from "next/server";
import { loaderDownloadName, patchLoaderAuth, patchLoaderBrand, patchLoaderLogo } from "./loader-brand";
import { loaderSetupError, readLoaderBinary, readLoaderMeta, readResellerLogo } from "./loader-store";
import { signLoaderToken } from "./loader-token";

function fail(message, status) {
  return { error: NextResponse.json({ error: message }, { status }) };
}

export async function buildBrandedLoader(supabase, { primary, secondary, color, resellerId, url, logo, buildId }) {
  const meta = await readLoaderMeta(supabase);
  if (meta.error) {
    const setup = loaderSetupError(meta.error);
    return fail(setup.message, setup.missing ? 503 : 400);
  }
  if (!meta.loader.uploaded) return fail("No loader has been uploaded yet.", 409);
  if (meta.loader.status === "maintenance") return fail("The loader is under maintenance. Try again later.", 423);

  const source = await readLoaderBinary(supabase);
  if (!source) return fail("Loader file is missing. Ask an administrator to upload it again.", 409);

  const branded = patchLoaderBrand(source, { primary, secondary }, color);
  if (branded.error) return fail(branded.error, 400);

  const stamped = patchLoaderAuth(branded.buffer, {
    version: meta.loader.version || "1.0.0",
    token: signLoaderToken(resellerId, buildId || ""),
    url,
  });
  if (stamped.error) return fail(stamped.error, 400);

  let logoPatch = logo;
  if (logoPatch === undefined) {
    const stored = await readResellerLogo(supabase, resellerId);
    logoPatch = stored.logo || null;
  }
  let buffer = stamped.buffer;
  if (logoPatch?.png) {
    const patched = patchLoaderLogo(buffer, logoPatch.png, logoPatch.width, logoPatch.height);
    if (patched.error) return fail(patched.error, 400);
    buffer = patched.buffer;
  }

  const filename = loaderDownloadName(`${primary}${secondary}`);
  return {
    response: new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "no-store",
      },
    }),
  };
}
