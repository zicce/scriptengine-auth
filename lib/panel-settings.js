import { isMissingTableError } from "./constants";
import { DEFAULT_KEY_FORMAT, normalizeKeyFormat } from "./key-format";

export async function readKeyFormat(supabase) {
  const { data, error } = await supabase
    .from("panel_settings")
    .select("key_pattern, key_uppercase, key_digits")
    .eq("id", "global")
    .maybeSingle();

  if (error || !data) {
    return { format: DEFAULT_KEY_FORMAT, missing: Boolean(error && isMissingTableError(error)) };
  }

  const normalized = normalizeKeyFormat({
    pattern: data.key_pattern,
    uppercase: data.key_uppercase,
    digits: data.key_digits,
  });
  if (normalized.error) return { format: DEFAULT_KEY_FORMAT, missing: false };
  return { format: normalized, missing: false };
}
