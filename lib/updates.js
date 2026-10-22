import { isMissingTableError } from "./constants";

export const UPDATE_BADGE_COLORS = [
  { id: "red", label: "Red", value: "#fe4438" },
  { id: "orange", label: "Orange", value: "#c2410c" },
  { id: "amber", label: "Amber", value: "#b45309" },
  { id: "green", label: "Green", value: "#15803d" },
  { id: "teal", label: "Teal", value: "#0f766e" },
  { id: "blue", label: "Blue", value: "#1d4ed8" },
  { id: "indigo", label: "Indigo", value: "#4338ca" },
  { id: "purple", label: "Purple", value: "#7e22ce" },
  { id: "pink", label: "Pink", value: "#be185d" },
  { id: "slate", label: "Slate", value: "#475569" },
];

export const UPDATE_BADGE_MAX = 3;
export const UPDATE_TAG_MAX = 8;
export const UPDATE_CUSTOM_TAG_MAX_LENGTH = 32;
export const UPDATE_TAG_ICONS = [
  "tag",
  "package",
  "shield",
  "zap",
  "bug",
  "wrench",
  "sparkles",
  "rocket",
  "star",
  "monitor",
  "cpu",
  "server",
  "gamepad",
  "globe",
  "lock",
  "key",
  "download",
  "bell",
];

const TAG_ICONS = new Set(UPDATE_TAG_ICONS);

const BADGE_COLORS = new Set(UPDATE_BADGE_COLORS.map((color) => color.value));

export function emptyUpdateBadge() {
  return { label: "", color: UPDATE_BADGE_COLORS[0].value };
}

export function mapUpdate(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    badges: Array.isArray(row.badges) ? row.badges : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
    createdAt: row.created_at,
  };
}

export function normalizeBadges(input) {
  if (!Array.isArray(input)) return [];
  const badges = [];
  for (const item of input) {
    const label = String(item?.label || "").trim().slice(0, 24);
    if (!label) continue;
    badges.push({
      label,
      color: BADGE_COLORS.has(item?.color) ? item.color : UPDATE_BADGE_COLORS[0].value,
    });
    if (badges.length >= UPDATE_BADGE_MAX) break;
  }
  return badges;
}

export function normalizeTags(input, applications) {
  const apps = new Map();
  const variants = new Map();
  for (const app of applications || []) {
    apps.set(app.id, app);
    for (const variant of app.application_variants || app.variants || []) {
      if (variant.active === false) continue;
      variants.set(variant.id, { variant, app });
    }
  }

  const tags = [];
  const seen = new Set();
  for (const item of Array.isArray(input) ? input : []) {
    const kind = ["variant", "application", "custom"].includes(item?.kind) ? item.kind : "";
    if (!kind) continue;
    if (kind === "custom") {
      const name = String(item?.name || "").replace(/\s+/g, " ").trim().slice(0, UPDATE_CUSTOM_TAG_MAX_LENGTH);
      if (!name) continue;
      const key = `custom:${name.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      tags.push({
        kind: "custom",
        id: `custom-${tags.length}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "tag"}`,
        name,
        icon: TAG_ICONS.has(item?.icon) ? item.icon : "tag",
      });
    } else if (kind === "application") {
      const app = apps.get(item.id);
      const key = `application:${app?.id || ""}`;
      if (!app || seen.has(key)) return { error: "One of the tagged products no longer exists." };
      seen.add(key);
      tags.push({ kind: "application", id: app.id, name: app.name });
    } else {
      const match = variants.get(item.id);
      const key = `variant:${match?.variant.id || ""}`;
      if (!match || seen.has(key)) return { error: "One of the tagged variants no longer exists." };
      seen.add(key);
      tags.push({
        kind: "variant",
        id: match.variant.id,
        applicationId: match.app.id,
        name: match.variant.label,
        applicationName: match.app.name,
      });
    }
    if (tags.length > UPDATE_TAG_MAX) return { error: `Add at most ${UPDATE_TAG_MAX} affected items.` };
  }
  return { tags };
}

export async function listUpdates(supabase) {
  const { data, error } = await supabase
    .from("updates")
    .select("id, title, description, badges, tags, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    if (isMissingTableError(error)) return { updates: [], missing: true };
    return { error };
  }
  return { updates: (data || []).map(mapUpdate) };
}
