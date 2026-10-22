import { NextResponse } from "next/server";
import { isMissingTableError } from "../../../../lib/constants";
import { readLicenseFreeze } from "../../../../lib/loader-store";
import { readKeyFormat } from "../../../../lib/panel-settings";
import { requireAdmin } from "../../../../lib/require-admin";
import { listUpdates } from "../../../../lib/updates";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const { data: applications, error: appError } = await auth.supabase
    .from("applications")
    .select("id, app_id, name, version, status, keys_locked, created_at, updated_at, application_variants (id, label, duration_value, duration_unit, price, sort_order, active)")
    .order("created_at", { ascending: false });

  if (appError) {
    const missing = isMissingTableError(appError);
    return NextResponse.json(
      {
        error: missing
          ? "Database tables are missing. Run supabase/schema.sql in the Supabase SQL Editor."
          : appError.message,
      },
      { status: missing ? 503 : 500 }
    );
  }

  const { data: licenses, error: licenseError } = await auth.supabase
    .from("licenses")
    .select("id, license_key, application_id, variant_id, variant_label, status, duration_value, duration_unit, hwid, ban_reason, activated_at, expires_at, created_at, reseller_id")
    .is("reseller_id", null)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (licenseError) {
    return NextResponse.json({ error: licenseError.message }, { status: 500 });
  }

  const { format: keyFormat } = await readKeyFormat(auth.supabase);
  const updatesResult = await listUpdates(auth.supabase);
  if (updatesResult.error) {
    return NextResponse.json({ error: updatesResult.error.message }, { status: 500 });
  }

  let resellers = [];
  let resellerQuery = await auth.supabase
    .from("resellers")
    .select("id, discord_id, username, avatar_url, service_name, balance, created_at, team_management, reseller_applications (application_id)")
    .order("created_at", { ascending: false });
  if (resellerQuery.error && /team_management|avatar_url|service_name/i.test(resellerQuery.error.message || "")) {
    resellerQuery = await auth.supabase
      .from("resellers")
      .select("id, discord_id, username, balance, created_at, reseller_applications (application_id)")
      .order("created_at", { ascending: false });
  }
  const { data: resellerRows, error: resellerError } = resellerQuery;
  if (!resellerError) {
    resellers = (resellerRows || []).map((row) => ({
      id: row.id,
      discordId: row.discord_id,
      username: row.username || "",
      avatarUrl: row.avatar_url || "",
      serviceName: row.service_name || "",
      balance: Number(row.balance || 0),
      createdAt: row.created_at,
      applicationIds: (row.reseller_applications || []).map((entry) => entry.application_id),
      teamManagement: row.team_management !== false,
    }));
  }

  const normalized = (applications || []).map((app) => ({
    ...app,
    variants: (app.application_variants || [])
      .filter((variant) => variant.active !== false)
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)),
  }));

  return NextResponse.json({
    email: auth.adminRow.email || auth.user.email || "",
    account: {
      email: auth.adminRow.email || auth.user.email || "",
      role: "Administrator",
      id: auth.user.id,
      createdAt: auth.user.created_at || null,
      lastSignInAt: auth.user.last_sign_in_at || null,
    },
    applications: normalized,
    licenses: licenses || [],
    licenseFrozenSince: await readLicenseFreeze(auth.supabase),
    resellers,
    updates: updatesResult.updates,
    keyFormat,
  });
}
