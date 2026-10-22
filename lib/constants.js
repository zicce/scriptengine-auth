export const APP_STATUSES = ["Active", "Maintenance", "Disabled"];

export const LICENSE_STATUSES = ["Not Activated", "Active", "Banned", "Expired"];

export const DURATION_UNITS = [
  { value: "hours", label: "Hours" },
  { value: "days", label: "Days" },
  { value: "months", label: "Months" },
  { value: "years", label: "Years" },
  { value: "lifetime", label: "Lifetime" },
];

export const MAX_LICENSE_QUANTITY = 200;

export function formatDuration(value, unit) {
  const normalized = String(unit || "").toLowerCase() === "unlimited" ? "lifetime" : String(unit || "").toLowerCase();
  const option = DURATION_UNITS.find((entry) => entry.value === normalized);
  if (!option) return "—";
  if (option.value === "lifetime") return "Lifetime";
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "—";
  const word = amount === 1 ? option.label.replace(/s$/, "").toLowerCase() : option.label.toLowerCase();
  return `${amount} ${word}`;
}

export function formatPrice(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return `€${amount.toFixed(2)}`;
}

export function isMissingTableError(error) {
  const message = String(error?.message || error || "");
  const code = String(error?.code || "");
  return code === "42P01" || /does not exist|schema cache|could not find the table/i.test(message);
}
