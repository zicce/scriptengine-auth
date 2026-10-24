// Card top-ups in the last 30 days unlock a discount automatically. Keep in sync with
// supabase/migrate-discount-tiers.sql, which applies the discount when a payment lands.
export const DEPOSIT_TIERS = [
  { amount: 25, discount: 30 },
  { amount: 50, discount: 40 },
  { amount: 100, discount: 50 },
  { amount: 250, discount: 60 },
  { amount: 500, discount: 65 },
  { amount: 1000, discount: 70 },
  { amount: 2000, discount: 80 },
];
export const DEPOSIT_TIER_DAYS = 30;
// Crypto top-ups get this much extra balance on top of what was paid.
export const CRYPTO_BONUS_PERCENT = 10;

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
