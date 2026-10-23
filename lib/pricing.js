export function normalizeDiscount(value) {
  const percent = Number(value);
  if (!Number.isFinite(percent)) return 0;
  return Math.min(100, Math.max(0, Math.round(percent * 100) / 100));
}

export function discountedPrice(price, discountPercent) {
  const amount = Number(price);
  if (!Number.isFinite(amount)) return amount;
  const percent = normalizeDiscount(discountPercent);
  if (!percent) return amount;
  return Math.round(amount * (100 - percent)) / 100;
}
