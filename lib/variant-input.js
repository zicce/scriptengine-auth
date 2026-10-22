import { DURATION_UNITS } from "./constants";

export function parseVariantInput(body) {
  const label = String(body?.label || body?.name || "").trim().slice(0, 60);
  if (!label) return { error: "Variant name is required." };

  const rawUnit = String(body?.durationUnit || body?.duration_unit || "days").trim().toLowerCase();
  const unit = rawUnit === "unlimited" ? "lifetime" : rawUnit;
  if (!DURATION_UNITS.some((entry) => entry.value === unit)) {
    return { error: "Choose hours, days, months, years, or lifetime." };
  }

  let durationValue = null;
  if (unit !== "lifetime") {
    durationValue = Math.trunc(Number(body?.durationValue ?? body?.duration_value));
    if (!Number.isFinite(durationValue) || durationValue <= 0) {
      return { error: "Enter a length greater than 0." };
    }
  }

  const rawPrice = body?.price;
  if (rawPrice === "" || rawPrice === null || rawPrice === undefined) {
    return { error: "Enter a valid price." };
  }
  const price = Number(rawPrice);
  if (!Number.isFinite(price) || price < 0) {
    return { error: "Enter a valid price." };
  }

  return {
    label,
    duration_value: durationValue,
    duration_unit: unit,
    price: Math.round(price * 100) / 100,
  };
}
