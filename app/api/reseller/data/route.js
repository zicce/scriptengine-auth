import { NextResponse } from "next/server";
import { isMissingTableError } from "../../../../lib/constants";
import { readLicenseFreeze } from "../../../../lib/loader-store";
import { discountedPrice, normalizeDiscount } from "../../../../lib/pricing";
import { requireReseller } from "../../../../lib/require-reseller";
import { listResellerTransactions, withUnloggedLicenses } from "../../../../lib/transactions";
import { listUpdates } from "../../../../lib/updates";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireReseller();
  if (auth.error) return auth.error;

  const { data: access, error: accessError } = await auth.supabase
    .from("reseller_applications")
    .select("application_id")
    .eq("reseller_id", auth.reseller.id);
  if (accessError) {
    const missing = isMissingTableError(accessError);
    return NextResponse.json(
      { error: missing ? "Reseller tables are missing. Run supabase/migrate-resellers.sql in the Supabase SQL Editor." : accessError.message },
      { status: missing ? 503 : 500 }
    );
  }

  const ownerIds = (access || []).map((row) => row.application_id);
  const applicationIds =
    auth.actor.role === "helper" ? ownerIds.filter((id) => auth.actor.applicationIds.includes(id)) : ownerIds;
  const discountPercent = normalizeDiscount(auth.reseller.discount_percent);
  const applicationNames = new Map();
  const variantPrices = new Map();
  let applications = [];
  if (applicationIds.length) {
    const { data, error } = await auth.supabase
      .from("applications")
      .select("id, app_id, name, version, status, keys_locked, created_at, updated_at, application_variants (id, label, duration_value, duration_unit, price, sort_order, active)")
      .in("id", applicationIds)
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    applications = (data || []).map((app) => {
      applicationNames.set(app.id, app.name || "");
      for (const variant of app.application_variants || []) {
        const price = Number(variant.price);
        if (Number.isFinite(price)) variantPrices.set(variant.id, price);
      }
      return {
        ...app,
        variants: (app.application_variants || [])
          .filter((variant) => variant.active !== false)
          .map((variant) => ({
            ...variant,
            listPrice: Number(variant.price),
            price: discountedPrice(variant.price, discountPercent),
          }))
          .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)),
      };
    });
  }

  let licenses = [];
  if (applicationIds.length) {
    const { data, error } = await auth.supabase
      .from("licenses")
      .select("id, license_key, application_id, variant_id, variant_label, status, duration_value, duration_unit, hwid, ban_reason, activated_at, expires_at, created_at, reseller_id")
      .eq("reseller_id", auth.reseller.id)
      .in("application_id", applicationIds)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    licenses = data || [];
  }

  const purchaseNames = new Map(applicationNames);
  const purchasePrices = new Map(variantPrices);
  let purchaseLicenses = licenses;
  const { data: ownedLicenses, error: ownedError } = await auth.supabase
    .from("licenses")
    .select("id, license_key, application_id, variant_id, variant_label, created_at, applications(name), application_variants(price)")
    .eq("reseller_id", auth.reseller.id)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (!ownedError && ownedLicenses) {
    purchaseLicenses = ownedLicenses.map((row) => {
      const name = row.applications?.name || "";
      if (name) purchaseNames.set(row.application_id, name);
      const price = Number(row.application_variants?.price);
      if (Number.isFinite(price)) purchasePrices.set(row.variant_id, price);
      return row;
    });
  }

  const ledger = await listResellerTransactions(auth.supabase, auth.reseller.id);
  if (ledger.error) return NextResponse.json({ error: ledger.error.message }, { status: 500 });
  const transactions = withUnloggedLicenses(ledger.transactions, purchaseLicenses, {
    applicationNames: purchaseNames,
    variantPrices: purchasePrices,
  });

  const updatesResult = await listUpdates(auth.supabase);
  if (updatesResult.error) return NextResponse.json({ error: updatesResult.error.message }, { status: 500 });

  let helpers = [];
  if (auth.actor.role === "reseller" && auth.reseller.team_management) {
    const { data, error } = await auth.supabase
      .from("reseller_helpers")
      .select("id, discord_id, username, avatar_url, can_generate, can_reset_hwid, can_ban, helper_applications (application_id)")
      .eq("reseller_id", auth.reseller.id)
      .order("created_at", { ascending: true });
    if (error && !isMissingTableError(error)) return NextResponse.json({ error: error.message }, { status: 500 });
    helpers = (data || []).map((row) => ({
      id: row.id,
      discordId: row.discord_id,
      username: row.username || "",
      avatarUrl: row.avatar_url || "",
      canGenerate: row.can_generate === true,
      canResetHwid: row.can_reset_hwid === true,
      canBan: row.can_ban === true,
      applicationIds: (row.helper_applications || []).map((entry) => entry.application_id),
    }));
  }

  const helper = auth.actor.role === "helper";
  return NextResponse.json({
    account: {
      id: helper ? auth.actor.id : auth.reseller.id,
      discordId: helper ? auth.actor.discordId : auth.reseller.discord_id,
      username: helper ? auth.actor.username : auth.reseller.username || "",
      avatarUrl: helper ? auth.actor.avatarUrl : auth.reseller.avatar_url || "",
      email: (helper ? auth.actor.username : auth.reseller.username) || (helper ? auth.actor.discordId : auth.reseller.discord_id),
      role: helper ? "Helper" : "Reseller",
      balance: Number(auth.reseller.balance || 0),
      discountPercent,
      createdAt: helper ? auth.actor.createdAt : auth.reseller.created_at,
      teamManagement: !helper && auth.reseller.team_management === true,
      permissions: {
        generate: !helper || auth.actor.canGenerate,
        resetHwid: !helper || auth.actor.canResetHwid,
        ban: !helper || auth.actor.canBan,
      },
    },
    applications,
    licenses,
    licenseFrozenSince: await readLicenseFreeze(auth.supabase),
    transactions,
    transactionsReady: !ledger.missing,
    updates: updatesResult.updates,
    helpers,
  });
}
