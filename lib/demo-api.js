// In-browser stand-in for the reseller API, used by the public /demo panel.
// Nothing here talks to a server: window.fetch is wrapped for /api/reseller/* and
// /api/health, and every answer is built from the sample data below.

const DAY = 86400000;
const HOUR = 3600000;

function iso(offsetMs) {
  return new Date(Date.now() + offsetMs).toISOString();
}

function randomKey() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return `ENGINE-${out}`;
}

function buildState() {
  const app = {
    id: "demo-app",
    app_id: "demo-app-id",
    name: "Script Engine",
    version: "1.6.7",
    status: "Active",
    keys_locked: false,
    created_at: iso(-90 * DAY),
    updated_at: iso(-2 * DAY),
    variants: [
      { id: "v1", label: "1 Day License", duration_value: 1, duration_unit: "days", price: 1.5, sort_order: 1, active: true },
      { id: "v7", label: "7 Days License", duration_value: 7, duration_unit: "days", price: 6, sort_order: 2, active: true },
      { id: "v30", label: "30 Days License", duration_value: 30, duration_unit: "days", price: 14, sort_order: 3, active: true },
    ],
  };

  const license = (id, key, variant, status, createdAgo, extra = {}) => ({
    id,
    license_key: key,
    application_id: app.id,
    variant_id: variant.id,
    variant_label: variant.label,
    status,
    duration_value: variant.duration_value,
    duration_unit: variant.duration_unit,
    hwid: null,
    ban_reason: null,
    activated_at: null,
    expires_at: null,
    created_at: iso(-createdAgo),
    reseller_id: "demo-reseller",
    ...extra,
  });
  const [d1, d7, d30] = app.variants;
  const licenses = [
    license("l1", "ENGINE-K7QX2M9PLA4C", d30, "Active", 6 * DAY, { hwid: "demo-hwid-1", activated_at: iso(-5 * DAY), expires_at: iso(25 * DAY) }),
    license("l2", "ENGINE-9TBHW3NF6RZD", d7, "Active", 3 * DAY, { hwid: "demo-hwid-2", activated_at: iso(-2 * DAY), expires_at: iso(5 * DAY) }),
    license("l3", "ENGINE-ZP4MC8VQ2LKE", d1, "Active", 5 * HOUR, { hwid: "demo-hwid-3", activated_at: iso(-4 * HOUR), expires_at: iso(20 * HOUR) }),
    license("l4", "ENGINE-QW6N3YJ8HDTA", d30, "Not activated", 1 * DAY),
    license("l5", "ENGINE-F2VKX7R9MCBG", d7, "Not activated", 1 * DAY),
    license("l6", "ENGINE-LS8D4PH5WNQU", d1, "Not activated", 2 * HOUR),
    license("l7", "ENGINE-C5JRY2T6AZEM", d1, "Expired", 9 * DAY, { hwid: "demo-hwid-4", activated_at: iso(-8 * DAY), expires_at: iso(-7 * DAY) }),
    license("l8", "ENGINE-X3HGB9K4NVPW", d7, "Banned", 12 * DAY, { hwid: "demo-hwid-5", activated_at: iso(-11 * DAY), expires_at: iso(-4 * DAY), ban_reason: "Chargeback" }),
  ];

  const tx = (id, ago, lic) => ({
    id,
    kind: "license",
    createdAt: iso(-ago),
    applicationName: app.name,
    variantLabel: lic.variant_label,
    licenseKey: lic.license_key,
    amount: app.variants.find((v) => v.id === lic.variant_id).price,
  });
  const transactions = [
    ...licenses.slice(0, 6).map((lic, index) => tx(`t${index}`, [3, 26, 50, 70, 80, 90][index] * HOUR, lic)),
    { id: "top1", kind: "topup", viaStripe: true, createdAt: iso(-4 * DAY), amount: 100 },
    { id: "top2", kind: "topup", viaStripe: true, createdAt: iso(-20 * DAY), amount: 250 },
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return {
    app,
    account: {
      id: "demo-reseller",
      discordId: "123456789012345678",
      username: "yourbrand",
      avatarUrl: "",
      email: "yourbrand",
      role: "Reseller",
      balance: 184.5,
      discountPercent: 60,
      createdAt: iso(-60 * DAY),
      teamManagement: true,
      permissions: { generate: true, resetHwid: true, ban: true },
    },
    licenses,
    transactions,
    helpers: [],
    updates: [
      {
        id: "u1",
        title: "Loader v1.6.7 is live",
        description: "Rebranded loaders update themselves on launch. There is nothing to rebuild or resend to customers.",
        badges: [{ label: "Update", color: "#15803d" }],
        tags: [
          { kind: "application", id: "demo-app", name: "Script Engine" },
          { kind: "variant", id: "v30", applicationId: "demo-app", name: "30 Days License", applicationName: "Script Engine" },
        ],
        createdAt: iso(-2 * DAY),
      },
      {
        id: "u2",
        title: "Scheduled maintenance",
        description: "Builds pause for about 20 minutes on Sunday 02:00 UTC.",
        badges: [{ label: "Notice", color: "#b45309" }],
        tags: [],
        createdAt: iso(-9 * DAY),
      },
    ],
    loader: {
      uploaded: true,
      fileName: "Loader.exe",
      fileSize: 15.1 * 1024 * 1024,
      updatedAt: iso(-2 * DAY),
      version: "1.6.7",
      latestVersion: "1.6.7",
      status: "online",
      statusUpdatedAt: iso(-3 * HOUR),
      statusHistory: [{ status: "online", at: iso(-3 * HOUR) }],
    },
    current: {
      hasBuild: true,
      primary: "YOUR",
      secondary: "BRAND",
      color: "#FE4438",
      generatedAt: iso(-1 * DAY),
      hasLogo: false,
    },
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function parseBody(init) {
  try {
    return typeof init?.body === "string" ? JSON.parse(init.body) : {};
  } catch {
    return {};
  }
}

let installed = false;

export function installDemoApi() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const state = buildState();
  const realFetch = window.fetch.bind(window);

  function dataPayload() {
    return {
      account: state.account,
      applications: [state.app],
      licenses: state.licenses,
      licenseFrozenSince: null,
      transactions: state.transactions,
      transactionsReady: true,
      updates: state.updates,
      helpers: state.helpers,
    };
  }

  function loaderPayload() {
    return {
      blacklisted: false,
      uploaded: true,
      primary: state.current.primary,
      secondary: state.current.secondary,
      color: state.current.color,
      loader: state.loader,
      current: state.current,
    };
  }

  window.fetch = async function demoFetch(input, init = {}) {
    const url = typeof input === "string" ? input : input?.url || "";
    const path = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0];
    const method = String(init.method || "GET").toUpperCase();
    if (!path.startsWith("/api/reseller/") && path !== "/api/health") return realFetch(input, init);

    await new Promise((resolve) => window.setTimeout(resolve, 120));

    if (path === "/api/health") return json({ ok: true, db: true, dbMs: 38 });
    if (path === "/api/reseller/data") return json(dataPayload());

    if (path === "/api/reseller/loader") {
      if (method === "GET") return json(loaderPayload());
      const demoNote = "Demo only: no loader is built here.";
      return json({ error: demoNote }, 403);
    }

    if (path === "/api/reseller/licenses") {
      const body = parseBody(init);
      if (method === "POST") {
        const variant = state.app.variants.find((v) => v.id === body.variantId);
        const quantity = Math.max(1, Math.min(50, Number(body.quantity) || 1));
        if (!variant) return json({ error: "Select a variant." }, 400);
        const cost = Math.round(variant.price * quantity * 100) / 100;
        if (cost > state.account.balance) return json({ error: `Not enough balance. This order costs €${cost.toFixed(2)}.` }, 400);
        state.account.balance = Math.round((state.account.balance - cost) * 100) / 100;
        const keys = [];
        for (let i = 0; i < quantity; i++) {
          const key = randomKey();
          keys.push(key);
          const id = `n${Date.now()}${i}`;
          state.licenses.unshift({
            id,
            license_key: key,
            application_id: state.app.id,
            variant_id: variant.id,
            variant_label: variant.label,
            status: "Not activated",
            duration_value: variant.duration_value,
            duration_unit: variant.duration_unit,
            hwid: null,
            ban_reason: null,
            activated_at: null,
            expires_at: null,
            created_at: new Date().toISOString(),
            reseller_id: state.account.id,
          });
          state.transactions.unshift({
            id: `tx${id}`,
            kind: "license",
            createdAt: new Date().toISOString(),
            applicationName: state.app.name,
            variantLabel: variant.label,
            licenseKey: key,
            amount: variant.price,
          });
        }
        return json({ keys, cost });
      }
      if (method === "PATCH") {
        const lic = state.licenses.find((entry) => entry.id === body.id);
        if (!lic) return json({ error: "License not found." }, 404);
        if (body.action === "reset_hwid") lic.hwid = null;
        if (body.action === "ban") {
          lic.status = "Banned";
          lic.ban_reason = "Banned from the demo";
        }
        if (body.action === "unban") {
          lic.status = lic.activated_at ? "Active" : "Not activated";
          lic.ban_reason = null;
        }
        return json({ ok: true });
      }
    }

    if (path === "/api/reseller/team") {
      const body = parseBody(init);
      if (method === "POST") {
        if (state.helpers.length >= 3) return json({ error: "You can add up to 3 helpers." }, 400);
        state.helpers.push({
          id: `h${Date.now()}`,
          discordId: String(body.discordId || "").trim(),
          username: "helper",
          avatarUrl: "",
          canGenerate: Boolean(body.canGenerate),
          canResetHwid: Boolean(body.canResetHwid),
          canBan: Boolean(body.canBan),
          applicationIds: Array.isArray(body.applicationIds) ? body.applicationIds : [],
        });
        return json({ ok: true });
      }
      if (method === "PATCH") {
        const helper = state.helpers.find((entry) => entry.id === body.id);
        if (helper) Object.assign(helper, {
          canGenerate: Boolean(body.canGenerate),
          canResetHwid: Boolean(body.canResetHwid),
          canBan: Boolean(body.canBan),
          applicationIds: Array.isArray(body.applicationIds) ? body.applicationIds : helper.applicationIds,
        });
        return json({ ok: true });
      }
      if (method === "DELETE") {
        state.helpers = state.helpers.filter((entry) => entry.id !== body.id);
        return json({ ok: true });
      }
    }

    return json({ error: "Demo only." }, 403);
  };
}
