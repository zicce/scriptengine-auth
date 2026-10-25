import { isMissingTableError } from "./constants";

export function mapTransaction(row) {
  const paid = Number(row.amount);
  const bonus = Number(row.bonus) || 0;
  return {
    id: row.id,
    kind: row.kind === "topup" ? "topup" : "license",
    amount: Number.isFinite(paid) ? paid + bonus : null,
    paid: Number.isFinite(paid) ? paid : null,
    bonus,
    applicationName: row.application_name || "",
    variantLabel: row.variant_label || "",
    licenseKey: row.license_key || "",
    licenseId: row.license_id || "",
    viaStripe: Boolean(row.stripe_session_id),
    createdAt: row.created_at,
  };
}

export async function listResellerTransactions(supabase, resellerId) {
  const query = (columns) =>
    supabase
      .from("reseller_transactions")
      .select(columns)
      .eq("reseller_id", resellerId)
      .order("created_at", { ascending: false })
      .limit(2000);
  const columns = "id, kind, amount, application_name, variant_label, license_key, license_id, created_at";
  let { data, error } = await query(`${columns}, stripe_session_id, bonus`);
  // Older databases do not have these columns until the Stripe and NOWPayments migrations are run.
  if (error && /stripe_session_id|bonus/i.test(error.message || "")) ({ data, error } = await query(columns));
  if (error) {
    if (isMissingTableError(error)) return { transactions: [], missing: true };
    return { error };
  }
  return { transactions: (data || []).map(mapTransaction), missing: false };
}

export function withUnloggedLicenses(transactions, licenses, { applicationNames, variantPrices }) {
  const logged = new Set(transactions.map((entry) => entry.licenseId).filter(Boolean));
  const extras = [];
  for (const license of licenses || []) {
    if (!license?.id || logged.has(license.id)) continue;
    const price = variantPrices.get(license.variant_id);
    extras.push({
      id: `license:${license.id}`,
      kind: "license",
      amount: Number.isFinite(price) ? price : null,
      applicationName: applicationNames.get(license.application_id) || "",
      variantLabel: license.variant_label || "",
      licenseKey: license.license_key || "",
      licenseId: license.id,
      createdAt: license.created_at,
    });
  }
  return [...transactions, ...extras].sort((a, b) => {
    const left = new Date(b.createdAt).getTime();
    const right = new Date(a.createdAt).getTime();
    return (Number.isFinite(left) ? left : 0) - (Number.isFinite(right) ? right : 0);
  });
}

export async function recordTopup(supabase, resellerId, amount) {
  const value = Math.round(Number(amount) * 100) / 100;
  if (!resellerId || !Number.isFinite(value) || value <= 0) return { ok: true };
  const { error } = await supabase.from("reseller_transactions").insert({
    reseller_id: resellerId,
    kind: "topup",
    amount: value,
  });
  if (!error) return { ok: true };
  if (isMissingTableError(error)) return { ok: false, missing: true };
  return { ok: false, error };
}

export async function recordLicensePurchases(supabase, rows) {
  const payload = (rows || []).filter((row) => row.reseller_id && row.license_id);
  if (!payload.length) return { ok: true };
  const { error } = await supabase.from("reseller_transactions").insert(payload);
  if (!error) return { ok: true };
  if (error.code === "23505" || isMissingTableError(error)) return { ok: true };
  return { ok: false, error };
}
