import { cmsConfig } from "../src/lib/catalog.mjs";
export const config = cmsConfig({
  ...process.env,
  DIRECTUS_TOKEN: process.env.DIRECTUS_ADMIN_TOKEN,
});
if (!config.token)
  throw new Error(
    "Set DIRECTUS_ADMIN_TOKEN securely in .env before running administrator commands",
  );
export async function admin(path, method = "GET", body) {
  const response = await fetch(`${config.url}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new Error(
      `Directus admin ${method} ${path} failed (${response.status}). Check CMS logs and schema; no existing schema was overwritten.`,
    );
  return response.status === 204 ? null : (await response.json()).data;
}
