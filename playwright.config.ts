import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  workers: 1,
  use: {
    baseURL: "http://localhost:5174",
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: "node tests/serve-e2e.mjs",
    url: "http://localhost:5174",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
