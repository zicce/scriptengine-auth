import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import {
  DEFAULT_COLOR,
  DEFAULT_PRIMARY,
  DEFAULT_SECONDARY,
  decodeSavedBrand,
  encodeSavedBrand,
  normalizeBrandPart,
  parseHexColor,
  readEmbeddedVersion,
  readPeFileVersion,
} from "../../../../lib/loader-brand";
import { buildBrandedLoader } from "../../../../lib/loader-build";
import { prepareResellerLogo } from "../../../../lib/loader-logo";
import { deleteResellerLogo, isOwnerBlacklisted, loaderSetupError, readLoaderBinary, readLoaderMeta, readResellerLogo, readStatusHistory, saveLoaderVersion, saveResellerLogo } from "../../../../lib/loader-store";
import { loaderPublicUrl } from "../../../../lib/loader-token";
import { requireReseller } from "../../../../lib/require-reseller";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUILD_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function nextBuildAt(generatedAt) {
  const time = new Date(generatedAt || "").getTime();
  return Number.isFinite(time) && time > 0 ? time + BUILD_COOLDOWN_MS : 0;
}

function formatWait(ms) {
  const minutes = Math.max(1, Math.ceil(ms / 60000));
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

function setupResponse(error) {
  const setup = loaderSetupError(error);
  return NextResponse.json({ error: setup.message }, { status: setup.missing ? 503 : 400 });
}

function denyHelper(auth) {
  if (auth.error) return auth.error;
  if (auth.actor.role === "helper") {
    return NextResponse.json({ error: "Helpers cannot access the loader." }, { status: 403 });
  }
  return null;
}

async function readSavedBrand(supabase, resellerId) {
  const { data, error } = await supabase
    .from("resellers")
    .select("loader_brand, loader_color")
    .eq("id", resellerId)
    .maybeSingle();
  if (error) return { primary: "", secondary: "", color: "" };
  const parts = decodeSavedBrand(data?.loader_brand || "");
  return {
    primary: parts.primary,
    secondary: parts.secondary,
    generatedAt: parts.generatedAt,
    buildId: parts.buildId || "",
    color: String(data?.loader_color || "").trim(),
  };
}

export async function GET() {
  const auth = await requireReseller();
  const denied = denyHelper(auth);
  if (denied) return denied;

  const blocked = await isOwnerBlacklisted(auth.supabase, auth.reseller.discord_id);
  if (blocked.error) return setupResponse(blocked.error);
  if (blocked.blacklisted) {
    return NextResponse.json({
      blacklisted: true,
      uploaded: false,
      primary: DEFAULT_PRIMARY,
      secondary: DEFAULT_SECONDARY,
      color: DEFAULT_COLOR,
    });
  }

  const meta = await readLoaderMeta(auth.supabase);
  if (meta.error) return setupResponse(meta.error);
  let loader = meta.loader;
  const bytes = loader.uploaded ? await readLoaderBinary(auth.supabase) : null;
  if (loader.uploaded && !loader.version) {
    loader = { ...loader, version: (bytes && readPeFileVersion(bytes)) || "1.0.0" };
    await saveLoaderVersion(auth.supabase, loader.version);
  }
  const statusLog = await readStatusHistory(auth.supabase, 30);
  const statusHistory = statusLog.error ? [] : statusLog.history;
  if (!statusHistory.length && loader.statusUpdatedAt) statusHistory.push({ status: loader.status, at: loader.statusUpdatedAt });
  loader = { ...loader, latestVersion: readEmbeddedVersion(bytes) || "", statusHistory };
  const saved = await readSavedBrand(auth.supabase, auth.reseller.id);
  const color = parseHexColor(saved.color);
  const hasBuild = Boolean(saved.primary);
  const storedLogo = await readResellerLogo(auth.supabase, auth.reseller.id);
  return NextResponse.json({
    blacklisted: false,
    uploaded: loader.uploaded,
    primary: hasBuild ? saved.primary : DEFAULT_PRIMARY,
    secondary: hasBuild ? saved.secondary : DEFAULT_SECONDARY,
    color: hasBuild && color.color ? color.color : DEFAULT_COLOR,
    loader,
    current: {
      hasBuild,
      primary: saved.primary,
      secondary: saved.secondary,
      color: hasBuild && color.color ? color.color : "",
      generatedAt: saved.generatedAt || "",
      hasLogo: Boolean(storedLogo.logo),
    },
  });
}

export async function POST(request) {
  const auth = await requireReseller();
  const denied = denyHelper(auth);
  if (denied) return denied;

  const blocked = await isOwnerBlacklisted(auth.supabase, auth.reseller.discord_id);
  if (blocked.error) return setupResponse(blocked.error);
  if (blocked.blacklisted) {
    return NextResponse.json({ error: "You have been blacklisted." }, { status: 403 });
  }

  const contentType = request.headers.get("content-type") || "";
  let body = {};
  let logoFile = null;
  try {
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    body = {
      primary: form?.get("primary"),
      secondary: form?.get("secondary"),
      color: form?.get("color"),
      logoAction: String(form?.get("logoAction") || "keep"),
      downloadCurrent: form?.get("downloadCurrent"),
    };
    const file = form?.get("logo");
    if (file && typeof file !== "string") logoFile = Buffer.from(await file.arrayBuffer());
  } else {
    body = await request.json().catch(() => ({}));
  }
  if (body.downloadCurrent) {
    const saved = await readSavedBrand(auth.supabase, auth.reseller.id);
    const primary = normalizeBrandPart(saved.primary, { required: true, label: "primary text" });
    if (primary.error) return NextResponse.json({ error: "Generate a loader before downloading the current one." }, { status: 409 });
    const secondary = normalizeBrandPart(saved.secondary, { label: "secondary text" });
    if (secondary.error) return NextResponse.json({ error: secondary.error }, { status: 400 });
    const color = parseHexColor(saved.color);
    if (color.error) return NextResponse.json({ error: "The current loader has no color yet." }, { status: 409 });
    const file = await buildBrandedLoader(auth.supabase, {
      primary: primary.name,
      secondary: secondary.name,
      color,
      resellerId: auth.reseller.id,
      url: loaderPublicUrl(request),
      buildId: saved.buildId || "",
    });
    if (file.error) return file.error;
    return file.response;
  }

  const previous = await readSavedBrand(auth.supabase, auth.reseller.id);
  const nextAt = nextBuildAt(previous.generatedAt);
  if (nextAt && nextAt > Date.now()) {
    return NextResponse.json(
      { error: `You can generate a new loader once every 24 hours. Try again in ${formatWait(nextAt - Date.now())}.`, nextBuildAt: new Date(nextAt).toISOString() },
      { status: 429 }
    );
  }

  const primary = normalizeBrandPart(body.primary, { required: true, label: "primary text" });
  if (primary.error) return NextResponse.json({ error: primary.error }, { status: 400 });
  const secondary = normalizeBrandPart(body.secondary, { label: "secondary text" });
  if (secondary.error) return NextResponse.json({ error: secondary.error }, { status: 400 });
  const color = parseHexColor(body.color);
  if (color.error) return NextResponse.json({ error: color.error }, { status: 400 });

  const logoAction = body.logoAction === "clear" || body.logoAction === "replace" ? body.logoAction : "keep";
  let logo;
  if (logoAction === "clear") {
    await deleteResellerLogo(auth.supabase, auth.reseller.id);
    logo = null;
  } else if (logoAction === "replace") {
    const prepared = await prepareResellerLogo(logoFile);
    if (prepared.error) return NextResponse.json({ error: prepared.error }, { status: 400 });
    const savedLogo = await saveResellerLogo(auth.supabase, auth.reseller.id, prepared.png);
    if (savedLogo.error) return setupResponse(savedLogo.error);
    logo = prepared;
  }

  const buildId = randomBytes(8).toString("hex");
  const file = await buildBrandedLoader(auth.supabase, {
    primary: primary.name,
    secondary: secondary.name,
    color,
    resellerId: auth.reseller.id,
    url: loaderPublicUrl(request),
    logo,
    buildId,
  });
  if (file.error) return file.error;

  await auth.supabase
    .from("resellers")
    .update({ loader_brand: encodeSavedBrand(primary.name, secondary.name, new Date().toISOString(), buildId), loader_color: color.color })
    .eq("id", auth.reseller.id);

  return file.response;
  } catch (error) {
    return NextResponse.json({ error: error?.message || "Could not generate the loader." }, { status: 500 });
  }
}
