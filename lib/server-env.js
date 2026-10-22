let ready = null;

async function loadCloudflareEnv() {
  try {
    const load = new Function("return import('cloudflare:workers')");
    const mod = await load();
    return mod?.env || null;
  } catch {
    return null;
  }
}

export async function ensureServerEnv() {
  if (!ready) {
    ready = (async () => {
      const env = await loadCloudflareEnv();
      if (!env) return;
      for (const key of Object.keys(env)) {
        const value = env[key];
        if (typeof value === "string" && value && !process.env[key]) {
          process.env[key] = value;
        }
      }
    })();
  }
  await ready;
}

export function serverEnv(name) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}
