export const BRAND_MAGIC = Buffer.from("SEBRANDCFG000001", "ascii");
export const BRAND_TAIL = Buffer.from("SEBRAND!", "ascii");
export const BRAND_NAME_OFFSET = 16;
export const BRAND_NAME_LENGTH = 48;
export const BRAND_PRIMARY_LENGTH = 24;
export const BRAND_SECONDARY_LENGTH = 24;
export const BRAND_COLOR_OFFSET = 64;
export const BRAND_MARK_OFFSET = 67;
export const BRAND_MARK = 0xa7;
export const BRAND_TAIL_OFFSET = 68;
export const BRAND_STAMP_LENGTH = 76;
export const DEFAULT_PRIMARY = "SCRIPT";
export const DEFAULT_SECONDARY = "ENGINE";
export const DEFAULT_COLOR = "#E94438";
const BRAND_PART_BYTES = BRAND_PRIMARY_LENGTH - 1;

export function findBrandStamps(buffer) {
  const hits = [];
  let from = 0;
  while (from <= buffer.length - BRAND_STAMP_LENGTH) {
    const index = buffer.indexOf(BRAND_MAGIC, from);
    if (index < 0) break;
    const tail = buffer.subarray(index + BRAND_TAIL_OFFSET, index + BRAND_TAIL_OFFSET + BRAND_TAIL.length);
    if (
      index + BRAND_STAMP_LENGTH <= buffer.length &&
      buffer[index + BRAND_MARK_OFFSET] === BRAND_MARK &&
      tail.equals(BRAND_TAIL)
    ) {
      hits.push(index);
    }
    from = index + 1;
  }
  return hits;
}

export function normalizeBrandPart(value, { required = false, label = "Text" } = {}) {
  const name = String(value || "").trim();
  if (!name) {
    if (required) return { error: `Enter ${label}.` };
    return { name: "" };
  }
  if (/[\u0000-\u001F\u007F]/.test(name)) return { error: `${label} contains invalid characters.` };
  if (Buffer.byteLength(name, "utf8") > BRAND_PART_BYTES) return { error: `${label} is too long.` };
  return { name };
}

export function encodeSavedBrand(primary, secondary, generatedAt = "", buildId = "") {
  return [primary, secondary || "", generatedAt || "", buildId || ""].join("\u001f");
}

export function decodeSavedBrand(value) {
  const raw = String(value || "");
  if (raw.includes("\u001f")) {
    const [primary = "", secondary = "", generatedAt = "", buildId = ""] = raw.split("\u001f");
    return { primary, secondary, generatedAt, buildId };
  }
  const space = raw.indexOf(" ");
  if (space > 0) return { primary: raw.slice(0, space), secondary: raw.slice(space + 1), generatedAt: "", buildId: "" };
  return { primary: raw, secondary: "", generatedAt: "", buildId: "" };
}

export function normalizeLoaderVersion(value) {
  const version = String(value || "").trim().slice(0, 31);
  if (!version) return { version: "" };
  if (!/^[0-9A-Za-z][0-9A-Za-z._+-]{0,30}$/.test(version)) return { error: "Version can use letters, numbers, dots, and dashes." };
  return { version };
}

export function readPeFileVersion(buffer) {
  if (!buffer || buffer.length < 64) return "";
  const signature = Buffer.from([0xbd, 0x04, 0xef, 0xfe]);
  let from = 0;
  while (from < buffer.length - 16) {
    const index = buffer.indexOf(signature, from);
    if (index < 0 || index + 16 > buffer.length) return "";
    const ms = buffer.readUInt32LE(index + 8);
    const ls = buffer.readUInt32LE(index + 12);
    const parts = [ms >>> 16, ms & 0xffff, ls >>> 16, ls & 0xffff];
    if (parts.every((part) => part <= 9999) && parts.some((part) => part > 0)) return parts.join(".");
    from = index + 4;
  }
  return "";
}

const EMBEDDED_VERSION_MARK = Buffer.from("SE_LOADER_VERSION=", "ascii");

export function readEmbeddedVersion(buffer) {
  if (!buffer) return "";
  let from = 0;
  while (from < buffer.length) {
    const index = buffer.indexOf(EMBEDDED_VERSION_MARK, from);
    if (index < 0) return "";
    const start = index + EMBEDDED_VERSION_MARK.length;
    let end = start;
    while (end < buffer.length && end - start < 31) {
      const code = buffer[end];
      if (!code) break;
      const char = String.fromCharCode(code);
      if (!/[0-9A-Za-z._+-]/.test(char)) break;
      end += 1;
    }
    const parsed = normalizeLoaderVersion(buffer.subarray(start, end).toString("ascii"));
    if (!parsed.error && parsed.version) return parsed.version;
    from = index + 1;
  }
  return "";
}

const PE_MACHINES = { 0x14c: "x86", 0x8664: "x64", 0xaa64: "ARM64" };
const PE_SUBSYSTEMS = { 2: "Windows GUI", 3: "Console" };

export function readPeInfo(buffer) {
  if (!buffer || buffer.length < 0x40 || buffer[0] !== 0x4d || buffer[1] !== 0x5a) return null;
  const pe = buffer.readUInt32LE(0x3c);
  if (pe + 24 > buffer.length || buffer.readUInt32LE(pe) !== 0x4550) return null;
  const machine = buffer.readUInt16LE(pe + 4);
  const sections = buffer.readUInt16LE(pe + 6);
  const timestamp = buffer.readUInt32LE(pe + 8);
  const optional = pe + 24;
  const hasOptional = optional + 70 <= buffer.length;
  const linker = hasOptional ? `${buffer[optional + 2]}.${String(buffer[optional + 3]).padStart(2, "0")}` : "";
  const subsystem = hasOptional ? buffer.readUInt16LE(optional + 68) : 0;
  return {
    architecture: PE_MACHINES[machine] || `0x${machine.toString(16)}`,
    sections,
    builtAt: timestamp ? new Date(timestamp * 1000).toISOString() : null,
    linker,
    subsystem: PE_SUBSYSTEMS[subsystem] || (subsystem ? `Subsystem ${subsystem}` : ""),
  };
}

export function parseHexColor(value) {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(String(value || "").trim());
  if (!match) return { error: "Pick a color." };
  const hex = match[1].toUpperCase();
  return {
    color: `#${hex}`,
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

export function patchLoaderBrand(source, parts, color) {
  const hits = findBrandStamps(source);
  if (!hits.length) {
    return { error: "This loader has no brand stamp. Upload the Loader.exe built from UNI - Loader." };
  }
  const primaryBytes = Buffer.from(parts.primary || "", "utf8");
  const secondaryBytes = Buffer.from(parts.secondary || "", "utf8");
  if (!primaryBytes.length) return { error: "Enter primary text." };
  if (primaryBytes.length > BRAND_PART_BYTES || secondaryBytes.length > BRAND_PART_BYTES) {
    return { error: "Brand text is too long." };
  }

  const out = Buffer.from(source);
  const nameField = Buffer.alloc(BRAND_NAME_LENGTH, 0);
  primaryBytes.copy(nameField, 0);
  secondaryBytes.copy(nameField, BRAND_PRIMARY_LENGTH);
  for (const index of hits) {
    nameField.copy(out, index + BRAND_NAME_OFFSET);
    out[index + BRAND_COLOR_OFFSET] = color.r;
    out[index + BRAND_COLOR_OFFSET + 1] = color.g;
    out[index + BRAND_COLOR_OFFSET + 2] = color.b;
  }
  return { buffer: out };
}

export const AUTH_MAGIC = Buffer.from("SEAUTHCFG0000001", "ascii");
export const AUTH_TAIL = Buffer.from("SEAUTH!!", "ascii");
export const AUTH_STAMP_LENGTH = 256;
const AUTH_FIELDS = {
  version: { offset: 16, length: 32 },
  token: { offset: 48, length: 96 },
  url: { offset: 144, length: 104 },
};
const AUTH_TAIL_OFFSET = 248;

export function findAuthStamps(buffer) {
  const hits = [];
  let from = 0;
  while (from <= buffer.length - AUTH_STAMP_LENGTH) {
    const index = buffer.indexOf(AUTH_MAGIC, from);
    if (index < 0) break;
    const tail = buffer.subarray(index + AUTH_TAIL_OFFSET, index + AUTH_TAIL_OFFSET + AUTH_TAIL.length);
    if (index + AUTH_STAMP_LENGTH <= buffer.length && tail.equals(AUTH_TAIL)) hits.push(index);
    from = index + 1;
  }
  return hits;
}

export function patchLoaderAuth(source, values) {
  const hits = findAuthStamps(source);
  if (!hits.length) {
    return { error: "This loader has no update stamp. Upload the latest Loader.exe built from UNI - Loader." };
  }
  const fields = {};
  for (const [name, spec] of Object.entries(AUTH_FIELDS)) {
    const bytes = Buffer.from(String(values[name] || ""), "utf8");
    if (bytes.length > spec.length - 1) return { error: `Loader ${name} is too long.` };
    const field = Buffer.alloc(spec.length, 0);
    bytes.copy(field, 0);
    fields[name] = field;
  }
  const out = Buffer.from(source);
  for (const index of hits) {
    for (const [name, spec] of Object.entries(AUTH_FIELDS)) fields[name].copy(out, index + spec.offset);
  }
  return { buffer: out };
}

export const LOGO_MAGIC = Buffer.from("SELOGOCFG0000001", "ascii");
export const LOGO_TAIL = Buffer.from("SELOGO!!", "ascii");
export const LOGO_HEADER = 32;
export const LOGO_PAYLOAD = 96 * 1024;
export const LOGO_STAMP_LENGTH = LOGO_HEADER + LOGO_PAYLOAD + LOGO_TAIL.length;

export function findLogoStamps(buffer) {
  const hits = [];
  if (!buffer) return hits;
  let from = 0;
  while (from <= buffer.length - LOGO_STAMP_LENGTH) {
    const index = buffer.indexOf(LOGO_MAGIC, from);
    if (index < 0) break;
    const tail = buffer.subarray(index + LOGO_HEADER + LOGO_PAYLOAD, index + LOGO_STAMP_LENGTH);
    if (index + LOGO_STAMP_LENGTH <= buffer.length && tail.equals(LOGO_TAIL)) hits.push(index);
    from = index + 1;
  }
  return hits;
}

export function patchLoaderLogo(source, png, width, height) {
  const hits = findLogoStamps(source);
  if (!hits.length) {
    return { error: "This loader has no logo slot. Upload the latest Loader.exe built from UNI - Loader." };
  }
  if (!png?.length || png.length > LOGO_PAYLOAD) return { error: "Logo is too large after processing." };
  const out = Buffer.from(source);
  for (const index of hits) {
    out.writeUInt32LE(png.length, index + 16);
    out.writeUInt16LE(Math.max(1, Math.min(65535, width || 256)), index + 20);
    out.writeUInt16LE(Math.max(1, Math.min(65535, height || 256)), index + 22);
    out.fill(0, index + LOGO_HEADER, index + LOGO_HEADER + LOGO_PAYLOAD);
    png.copy(out, index + LOGO_HEADER);
  }
  return { buffer: out };
}

export function loaderDownloadName(brandName) {
  const ascii = String(brandName || "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${ascii || "Loader"}.exe`;
}
