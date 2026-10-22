import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { findAuthStamps, findBrandStamps, findLogoStamps, normalizeLoaderVersion, readEmbeddedVersion, readPeFileVersion, readPeInfo } from "../../../../lib/loader-brand";
import {
  createLoaderUpload,
  listBlacklist,
  loaderSetupError,
  normalizeLoaderStatus,
  readIncomingLoader,
  readLoaderBinary,
  logLoaderStatus,
  readLoaderMeta,
  readStatusHistory,
  removeIncomingLoader,
  resumeFrozenLicenses,
  saveLoaderBinary,
  saveLoaderStatus,
  saveLoaderVersion,
} from "../../../../lib/loader-store";
import { requireAdmin } from "../../../../lib/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 80 * 1024 * 1024;

function setupResponse(error) {
  const setup = loaderSetupError(error);
  return NextResponse.json({ error: setup.message }, { status: setup.missing ? 503 : 400 });
}

function describeBinary(bytes) {
  if (!bytes) return null;
  return {
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
    fileVersion: readPeFileVersion(bytes),
    embeddedVersion: readEmbeddedVersion(bytes),
    brandStamps: findBrandStamps(bytes).length,
    ...(readPeInfo(bytes) || {}),
  };
}

async function withDetails(supabase, loader, bytes = null) {
  if (!loader.uploaded) return { ...loader, details: null };
  return { ...loader, details: describeBinary(bytes || (await readLoaderBinary(supabase))) };
}

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const meta = await readLoaderMeta(auth.supabase);
  if (meta.error) return setupResponse(meta.error);
  let loader = meta.loader;
  const bytes = loader.uploaded ? await readLoaderBinary(auth.supabase) : null;
  const embedded = readEmbeddedVersion(bytes);
  if (loader.uploaded && !loader.version) {
    loader = { ...loader, version: embedded || (bytes && readPeFileVersion(bytes)) || "1.0.0" };
    await saveLoaderVersion(auth.supabase, loader.version);
  }
  const blacklist = await listBlacklist(auth.supabase);
  if (blacklist.error) return setupResponse(blacklist.error);
  return NextResponse.json({ loader: await withDetails(auth.supabase, loader, bytes), blacklist: blacklist.blacklist });
}

function rejectLoader(bytes) {
  if (!bytes || bytes.length < 1024 || bytes.length > MAX_BYTES) {
    return "Loader file must be between 1 KB and 80 MB.";
  }
  if (bytes[0] !== 0x4d || bytes[1] !== 0x5a) return "This file is not a Windows executable.";
  if (!findBrandStamps(bytes).length) return "This loader has no brand stamp. Upload the Loader.exe built from UNI - Loader.";
  if (!findAuthStamps(bytes).length) return "This loader has no update stamp. Upload the latest Loader.exe built from UNI - Loader.";
  if (!findLogoStamps(bytes).length) return "This loader has no logo slot. Upload the latest Loader.exe built from UNI - Loader.";
  if (!readEmbeddedVersion(bytes)) return "This loader has no LOADER_VERSION. Upload the latest Loader.exe built from UNI - Loader.";
  return "";
}

async function finishLoaderUpload(supabase, bytes, fileName) {
  const problem = rejectLoader(bytes);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  const saved = await saveLoaderBinary(supabase, bytes, fileName.slice(0, 180));
  if (saved.error) return setupResponse(saved.error);
  const meta = await readLoaderMeta(supabase);
  if (meta.error) return setupResponse(meta.error);
  return NextResponse.json({ loader: await withDetails(supabase, meta.loader, bytes) });
}

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    if (body.action === "prepare") {
      const upload = await createLoaderUpload(auth.supabase);
      if (upload.error) return setupResponse(upload.error);
      return NextResponse.json({ path: upload.path, token: upload.token });
    }
    if (body.action === "commit") {
      const incoming = await readIncomingLoader(auth.supabase, body.path);
      if (incoming.error) return setupResponse(incoming.error);
      const fileName = String(body.fileName || "Loader.exe");
      if (!fileName.toLowerCase().endsWith(".exe")) {
        await removeIncomingLoader(auth.supabase, body.path);
        return NextResponse.json({ error: "Only .exe files can be uploaded." }, { status: 400 });
      }
      const response = await finishLoaderUpload(auth.supabase, incoming.bytes, fileName);
      await removeIncomingLoader(auth.supabase, body.path);
      return response;
    }
    return NextResponse.json({ error: "Choose a .exe file." }, { status: 400 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Choose a .exe file." }, { status: 400 });
  }

  const fileName = String(file.name || "Loader.exe");
  if (!fileName.toLowerCase().endsWith(".exe")) {
    return NextResponse.json({ error: "Only .exe files can be uploaded." }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  return finishLoaderUpload(auth.supabase, bytes, fileName);
}

export async function PATCH(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  if (body.status !== undefined) {
    const status = normalizeLoaderStatus(body.status);
    if (status.error) return NextResponse.json({ error: status.error }, { status: 400 });
    const before = await readLoaderMeta(auth.supabase);
    if (before.error) return setupResponse(before.error);
    if (before.loader.status === status.status) {
      return NextResponse.json({ loader: await withDetails(auth.supabase, before.loader), resumed: null });
    }

    const resumedAt = new Date();
    const saved = await saveLoaderStatus(auth.supabase, status.status);
    if (saved.error) return setupResponse(saved.error);

    const past = await readStatusHistory(auth.supabase, 45);
    if (!past.error && !past.history.length && before.loader.statusUpdatedAt) {
      await logLoaderStatus(auth.supabase, before.loader.status, new Date(before.loader.statusUpdatedAt));
    }
    await logLoaderStatus(auth.supabase, status.status, resumedAt);

    let resumed = null;
    if (status.status === "online" && before.loader.status === "maintenance" && before.loader.statusUpdatedAt) {
      resumed = await resumeFrozenLicenses(auth.supabase, before.loader.statusUpdatedAt, resumedAt);
      if (resumed.error) {
        return NextResponse.json({ error: `Loader is online, but licenses could not be unfrozen: ${resumed.error.message}` }, { status: 500 });
      }
    }

    const meta = await readLoaderMeta(auth.supabase);
    if (meta.error) return setupResponse(meta.error);
    return NextResponse.json({ loader: await withDetails(auth.supabase, meta.loader), resumed });
  }

  const version = normalizeLoaderVersion(body.version);
  if (version.error) return NextResponse.json({ error: version.error }, { status: 400 });
  if (!version.version) return NextResponse.json({ error: "Enter a version." }, { status: 400 });

  const meta = await readLoaderMeta(auth.supabase);
  if (meta.error) return setupResponse(meta.error);
  if (!meta.loader.uploaded) return NextResponse.json({ error: "Upload a loader first." }, { status: 409 });

  const saved = await saveLoaderVersion(auth.supabase, version.version);
  if (saved.missingColumn) {
    return NextResponse.json(
      { error: "Loader version storage is missing. Run supabase/migrate-loader.sql in the Supabase SQL Editor." },
      { status: 503 }
    );
  }
  if (saved.error) return setupResponse(saved.error);

  return NextResponse.json({ loader: await withDetails(auth.supabase, { ...meta.loader, version: version.version }) });
}
