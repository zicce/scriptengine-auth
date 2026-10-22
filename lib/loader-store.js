import fs from "fs/promises";
import path from "path";
import { isMissingTableError } from "./constants";

const BUCKET = "loader";
const OBJECT_PATH = "base.exe";

export function loaderDiskPath() {
  return path.join(process.cwd(), "data", "loader", "base.exe");
}

function missingMessage() {
  return "Loader storage is missing. Run supabase/migrate-loader.sql in the Supabase SQL Editor.";
}

export function loaderSetupError(error) {
  return {
    missing: isMissingTableError(error),
    message: isMissingTableError(error) ? missingMessage() : error?.message || "Loader storage failed.",
  };
}

async function ensureBucket(supabase) {
  const existing = await supabase.storage.getBucket(BUCKET);
  if (existing.data) return null;
  const created = await supabase.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: 80 * 1024 * 1024,
  });
  if (created.error && !/already exists|duplicate/i.test(created.error.message || "")) return created.error;
  return null;
}

export const LOADER_STATUSES = ["online", "maintenance"];

export function normalizeLoaderStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (!LOADER_STATUSES.includes(status)) return { error: "Choose Online or Maintenance." };
  return { status };
}

export async function readLoaderMeta(supabase) {
  let query = await supabase.from("loader_config").select("id, file_name, file_size, updated_at, version").in("id", ["base", "status"]);
  if (query.error && /version/i.test(query.error.message || "")) {
    query = await supabase.from("loader_config").select("id, file_name, file_size, updated_at").in("id", ["base", "status"]);
  }
  const { data, error } = query;
  if (error) return { error };
  const base = (data || []).find((row) => row.id === "base");
  const statusRow = (data || []).find((row) => row.id === "status");
  const status = LOADER_STATUSES.includes(statusRow?.file_name) ? statusRow.file_name : "online";
  const statusUpdatedAt = statusRow?.updated_at || null;
  if (!base) {
    return { loader: { uploaded: false, fileName: "", fileSize: 0, updatedAt: null, version: "", status, statusUpdatedAt } };
  }
  return {
    loader: {
      uploaded: true,
      fileName: base.file_name || "Loader.exe",
      fileSize: Number(base.file_size || 0),
      updatedAt: base.updated_at,
      version: String(base.version || ""),
      status,
      statusUpdatedAt,
    },
  };
}

// Status changes are kept as extra loader_config rows ("status-log:<time>"), so no new table is needed.
const STATUS_LOG_PREFIX = "status-log:";
const STATUS_LOG_KEEP_DAYS = 45;

export async function logLoaderStatus(supabase, status, at = new Date()) {
  const stamp = at.toISOString();
  const { error } = await supabase.from("loader_config").insert({
    id: `${STATUS_LOG_PREFIX}${stamp}:${Math.random().toString(36).slice(2, 8)}`,
    file_name: status,
    file_size: 0,
    updated_at: stamp,
  });
  if (error) return { error };
  const cutoff = new Date(at.getTime() - STATUS_LOG_KEEP_DAYS * 86400000).toISOString();
  await supabase.from("loader_config").delete().like("id", `${STATUS_LOG_PREFIX}%`).lt("updated_at", cutoff);
  return {};
}

export async function readStatusHistory(supabase, days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const [inside, before] = await Promise.all([
    supabase
      .from("loader_config")
      .select("file_name, updated_at")
      .like("id", `${STATUS_LOG_PREFIX}%`)
      .gte("updated_at", since)
      .order("updated_at", { ascending: true })
      .limit(500),
    supabase
      .from("loader_config")
      .select("file_name, updated_at")
      .like("id", `${STATUS_LOG_PREFIX}%`)
      .lt("updated_at", since)
      .order("updated_at", { ascending: false })
      .limit(1),
  ]);
  if (inside.error) return { error: inside.error };
  const rows = [...(before.data || []), ...(inside.data || [])];
  return {
    history: rows
      .filter((row) => LOADER_STATUSES.includes(row.file_name))
      .map((row) => ({ status: row.file_name, at: row.updated_at })),
  };
}

export async function readLicenseFreeze(supabase) {
  const { data, error } = await supabase.from("loader_config").select("file_name, updated_at").eq("id", "status").maybeSingle();
  if (error || data?.file_name !== "maintenance" || !data.updated_at) return null;
  return data.updated_at;
}

// Every running license gets the maintenance time added back, so time spent frozen is not lost.
export async function resumeFrozenLicenses(supabase, frozenSince, resumedAt = new Date()) {
  const since = new Date(frozenSince);
  const shift = resumedAt.getTime() - since.getTime();
  if (!Number.isFinite(shift) || shift <= 0) return { shifted: 0, shiftMs: 0 };

  const page = 1000;
  const rows = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from("licenses")
      .select("id, expires_at")
      .not("activated_at", "is", null)
      .not("expires_at", "is", null)
      .gt("expires_at", since.toISOString())
      .order("id")
      .range(from, from + page - 1);
    if (error) return { error };
    rows.push(...(data || []));
    if (!data || data.length < page) break;
  }

  let shifted = 0;
  for (let at = 0; at < rows.length; at += 25) {
    const batch = rows.slice(at, at + 25);
    const results = await Promise.all(
      batch.map((row) =>
        supabase
          .from("licenses")
          .update({ expires_at: new Date(new Date(row.expires_at).getTime() + shift).toISOString() })
          .eq("id", row.id)
          .eq("expires_at", row.expires_at)
      )
    );
    shifted += results.filter((result) => !result.error).length;
  }
  return { shifted, shiftMs: shift };
}

export async function saveLoaderStatus(supabase, status) {
  const { error } = await supabase
    .from("loader_config")
    .upsert({ id: "status", file_name: status, file_size: 0, updated_at: new Date().toISOString() });
  if (error) return { error };
  return {};
}

export async function saveLoaderBinary(supabase, bytes, fileName) {
  await fs.mkdir(path.dirname(loaderDiskPath()), { recursive: true });
  await fs.writeFile(loaderDiskPath(), bytes);

  const bucketError = await ensureBucket(supabase);
  let storageError = bucketError;
  if (!bucketError) {
    const uploaded = await supabase.storage.from(BUCKET).upload(OBJECT_PATH, new Uint8Array(bytes), {
      upsert: true,
      contentType: "application/octet-stream",
    });
    storageError = uploaded.error || null;
  }

  const row = {
    id: "base",
    file_name: fileName,
    file_size: bytes.length,
    updated_at: new Date().toISOString(),
  };
  let { error } = await supabase.from("loader_config").upsert(row);
  if (error && /version/i.test(error.message || "")) {
    delete row.version;
    ({ error } = await supabase.from("loader_config").upsert(row));
  }
  if (error) return { error };
  return { storageError };
}

export async function saveLoaderVersion(supabase, version) {
  const { error } = await supabase.from("loader_config").update({ version }).eq("id", "base");
  if (error && /version/i.test(error.message || "")) return { missingColumn: true };
  if (error) return { error };
  return {};
}

export async function readLoaderBinary(supabase) {
  try {
    const disk = await fs.readFile(loaderDiskPath());
    if (disk.length) return disk;
  } catch {
    // The cloud copy is the fallback when this server has no local file.
  }

  const downloaded = await supabase.storage.from(BUCKET).download(OBJECT_PATH);
  if (downloaded.error || !downloaded.data) return null;
  const bytes = Buffer.from(await downloaded.data.arrayBuffer());
  if (!bytes.length) return null;
  try {
    await fs.mkdir(path.dirname(loaderDiskPath()), { recursive: true });
    await fs.writeFile(loaderDiskPath(), bytes);
  } catch {
    // A readable buffer is enough for this request.
  }
  return bytes;
}

export async function listBlacklist(supabase) {
  const { data, error } = await supabase
    .from("loader_blacklist")
    .select("discord_id, created_at")
    .order("created_at", { ascending: false });
  if (error) return { error };

  const ids = (data || []).map((row) => row.discord_id).filter(Boolean);
  let people = [];
  if (ids.length) {
    let lookup = await supabase.from("resellers").select("discord_id, username, service_name, avatar_url").in("discord_id", ids);
    if (lookup.error && /avatar_url/i.test(lookup.error.message || "")) {
      lookup = await supabase.from("resellers").select("discord_id, username, service_name").in("discord_id", ids);
    }
    if (!lookup.error) people = lookup.data || [];
  }
  const byId = new Map(people.map((row) => [row.discord_id, row]));
  return {
    blacklist: (data || []).map((row) => ({
      discordId: row.discord_id,
      createdAt: row.created_at,
      username: byId.get(row.discord_id)?.username || "",
      serviceName: byId.get(row.discord_id)?.service_name || "",
      avatarUrl: byId.get(row.discord_id)?.avatar_url || "",
    })),
  };
}

export function normalizeDiscordId(value) {
  const discordId = String(value || "").trim();
  if (!/^\d{15,22}$/.test(discordId)) return { error: "Enter a Discord user ID." };
  return { discordId };
}

function logoKey(resellerId) {
  const id = String(resellerId || "").trim();
  if (!/^[0-9a-f-]{16,80}$/i.test(id)) return "";
  return id;
}

export function loaderLogoDiskPath(resellerId) {
  const id = logoKey(resellerId);
  return id ? path.join(process.cwd(), "data", "loader", "logos", `${id}.png`) : "";
}

function pngSize(buffer) {
  if (!buffer || buffer.length < 24 || buffer.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

export async function readResellerLogo(supabase, resellerId) {
  const diskPath = loaderLogoDiskPath(resellerId);
  const objectPath = `logos/${logoKey(resellerId)}.png`;
  if (!diskPath) return { logo: null };
  try {
    const disk = await fs.readFile(diskPath);
    const size = pngSize(disk);
    if (disk.length && size) return { logo: { png: disk, ...size } };
  } catch {
    // The cloud copy is the fallback when this server has no local file.
  }
  const downloaded = await supabase.storage.from(BUCKET).download(objectPath);
  if (downloaded.error || !downloaded.data) return { logo: null };
  const png = Buffer.from(await downloaded.data.arrayBuffer());
  const size = pngSize(png);
  if (!png.length || !size) return { logo: null };
  try {
    await fs.mkdir(path.dirname(diskPath), { recursive: true });
    await fs.writeFile(diskPath, png);
  } catch {
    // A cloud copy is enough for this build.
  }
  return { logo: { png, ...size } };
}

export async function saveResellerLogo(supabase, resellerId, png) {
  const diskPath = loaderLogoDiskPath(resellerId);
  if (!diskPath) return { error: { message: "Logo could not be stored." } };
  await fs.mkdir(path.dirname(diskPath), { recursive: true });
  await fs.writeFile(diskPath, png);
  const bucketError = await ensureBucket(supabase);
  if (bucketError) return { storageError: bucketError };
  const uploaded = await supabase.storage.from(BUCKET).upload(`logos/${logoKey(resellerId)}.png`, new Uint8Array(png), {
    upsert: true,
    contentType: "image/png",
  });
  return { storageError: uploaded.error || null };
}

export async function deleteResellerLogo(supabase, resellerId) {
  const diskPath = loaderLogoDiskPath(resellerId);
  if (!diskPath) return {};
  await fs.rm(diskPath, { force: true }).catch(() => {});
  await supabase.storage.from(BUCKET).remove([`logos/${logoKey(resellerId)}.png`]);
  return {};
}

export async function isOwnerBlacklisted(supabase, discordId) {
  const { data, error } = await supabase
    .from("loader_blacklist")
    .select("discord_id")
    .eq("discord_id", discordId)
    .maybeSingle();
  if (error) return { error };
  return { blacklisted: Boolean(data) };
}
