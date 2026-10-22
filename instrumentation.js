export async function register() {
  const { ensureServerEnv } = await import("./lib/server-env.js");
  await ensureServerEnv();
}
