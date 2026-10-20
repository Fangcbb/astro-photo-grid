import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: ".portfolio/test-results",
  reporter: "list",
  workers: 2,
  use: {
    baseURL: "http://127.0.0.1:4330",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command:
      "pnpm exec astro preview --ignore-lock --host 127.0.0.1 --port 4330",
    port: 4330,
    reuseExistingServer: false,
    timeout: 30000,
    env: { ASTRO_TELEMETRY_DISABLED: "1" },
  },
});
