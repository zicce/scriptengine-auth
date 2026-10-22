export const DEFAULT_KEY_FORMAT = {
  pattern: "SE-****-****-****",
  uppercase: true,
  digits: true,
};

export const KEY_PATTERN_MAX = 80;

export const KEY_TOKENS = [
  { id: "*", label: "Any", hint: "Letter or digit" },
  { id: "?", label: "Letter", hint: "A–Z only" },
  { id: "#", label: "Digit", hint: "0–9" },
  { id: "@", label: "Hex", hint: "0–9 and A–F" },
  { id: "~", label: "Clean", hint: "No 0, O, 1, I or L" },
  { id: "$", label: "Check", hint: "Checksum of the key so far" },
  { id: "-", label: "Dash", hint: "Separator" },
];

export const KEY_PRESETS = [
  { id: "classic", name: "Classic", pattern: "SE-****-****-****", uppercase: true, digits: true },
  { id: "blocks", name: "5×5", pattern: "*****-*****-*****", uppercase: true, digits: true },
  { id: "digits", name: "PIN groups", pattern: "####-####-####", uppercase: true, digits: true },
  { id: "hex", name: "Hex", pattern: "SE-@@@@@@@@", uppercase: true, digits: true },
  { id: "clean", name: "Clean", pattern: "SE-~~~~-~~~~-~~~~", uppercase: true, digits: true },
  { id: "typed", name: "Typed", pattern: "SE-????-####-****", uppercase: true, digits: true },
  { id: "check", name: "Checksum", pattern: "SE-****-****-***$", uppercase: true, digits: true },
];

const LOWER = "abcdefghijklmnopqrstuvwxyz";
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";
const HEX_UPPER = "0123456789ABCDEF";
const HEX_LOWER = "0123456789abcdef";
const CLEAN_UPPER = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CLEAN_LOWER = "abcdefghjkmnpqrstuvwxyz23456789";
const RANDOM_TOKENS = new Set(["*", "?", "#", "@", "~", "$"]);
const ALLOWED = /^[A-Za-z0-9*?#@~$_.\-]+$/;

export function keyAlphabet({ uppercase }) {
  return `${uppercase ? UPPER : LOWER}${DIGITS}`;
}

export function alphabetForToken(token, format) {
  const upper = Boolean(format?.uppercase);
  if (token === "#") return DIGITS;
  if (token === "?") return upper ? UPPER : LOWER;
  if (token === "@") return upper ? HEX_UPPER : HEX_LOWER;
  if (token === "~" || token === "$") return upper ? CLEAN_UPPER : CLEAN_LOWER;
  if (token === "*") return keyAlphabet(format);
  return "";
}

export function isRandomToken(char) {
  return RANDOM_TOKENS.has(char);
}

export function normalizeKeyFormat(input) {
  const pattern = String(input?.pattern ?? "").trim().slice(0, KEY_PATTERN_MAX);
  const uppercase = Boolean(input?.uppercase);
  const digits = Boolean(input?.digits);
  if (!pattern) return { error: "Enter a license pattern." };
  if (![...pattern].some((char) => RANDOM_TOKENS.has(char))) {
    return { error: "Add at least one random token: * ? # @ ~ or $." };
  }
  if (!ALLOWED.test(pattern)) {
    return { error: "Use letters, numbers, - _ . and tokens * ? # @ ~ $ only." };
  }
  return { pattern, uppercase, digits };
}

function checksumChar(text, alphabet) {
  if (!alphabet) return "0";
  let sum = 0;
  for (let index = 0; index < text.length; index += 1) {
    sum += text.charCodeAt(index) * (index + 3);
  }
  return alphabet[sum % alphabet.length];
}

export function fillKeyPattern(format, randomIndex) {
  let key = "";
  for (const char of format.pattern) {
    if (char === "$") {
      key += checksumChar(key, alphabetForToken("$", format));
      continue;
    }
    const alphabet = alphabetForToken(char, format);
    if (!alphabet) {
      key += char;
      continue;
    }
    key += alphabet[randomIndex(alphabet.length)] || alphabet[0];
  }
  return key;
}

export function previewKeys(format, count = 1) {
  const parsed = normalizeKeyFormat(format);
  if (parsed.error) return [];
  return Array.from({ length: count }, () => fillKeyPattern(parsed, (length) => Math.floor(Math.random() * length)));
}

export function keyFormatStats(format) {
  const parsed = normalizeKeyFormat(format);
  if (parsed.error) {
    return { error: parsed.error, log10: 0, random: 0, checks: 0, length: String(format?.pattern || "").length };
  }
  let log10 = 0;
  let random = 0;
  let checks = 0;
  for (const char of parsed.pattern) {
    if (char === "$") {
      checks += 1;
      continue;
    }
    const alphabet = alphabetForToken(char, parsed);
    if (alphabet) {
      log10 += Math.log10(alphabet.length);
      random += 1;
    }
  }
  return { log10, random, checks, length: parsed.pattern.length };
}

export function formatCombinations(log10) {
  if (!log10 || log10 <= 0) return "0";
  if (log10 < 3) return String(Math.max(1, Math.round(10 ** log10)));
  if (log10 >= 15) return `10^${Math.round(log10)}`;
  const units = [
    [12, "T"],
    [9, "B"],
    [6, "M"],
    [3, "K"],
  ];
  for (const [power, suffix] of units) {
    if (log10 >= power) {
      const value = 10 ** (log10 - power);
      return `${value.toFixed(value >= 10 ? 0 : 1)}${suffix}`;
    }
  }
  return `10^${Math.round(log10)}`;
}

export function keyFormatStrength(format) {
  const stats = keyFormatStats(format);
  if (stats.error) return { id: "low", label: "Invalid", ...stats };
  if (stats.log10 >= 12) return { id: "high", label: "High", ...stats };
  if (stats.log10 >= 8) return { id: "good", label: "Good", ...stats };
  if (stats.log10 >= 5) return { id: "ok", label: "Fair", ...stats };
  return { id: "low", label: "Low", ...stats };
}

export function describeKeyFormat(format) {
  const stats = keyFormatStats(format);
  if (stats.error) return stats.error;
  return `${stats.length} chars · ${stats.random} random${stats.checks ? ` · ${stats.checks} checksum` : ""}`;
}
