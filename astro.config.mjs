import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

if (existsSync(".env")) loadEnvFile(".env");
const site = process.env.SITE_URL;
if (site && !/^https?:\/\//.test(site))
  throw new Error("SITE_URL must be an absolute HTTP(S) URL");
export default defineConfig({
  site: site || "http://localhost:4321",
  devToolbar: { enabled: false },
  integrations: site ? [sitemap()] : [],
  prefetch: true,
});
