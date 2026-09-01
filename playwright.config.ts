import { defineConfig, devices } from "@playwright/test";
import { parsePort } from "./scripts/e2e-server.mjs";

const port = parsePort(process.env.E2E_PORT ?? "8787");
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: "line",
  use: {
    baseURL,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    // Wrangler workerd can exit on EPIPE when Playwright captures its output: workers-sdk#15202.
    command: "npm run e2e:prepare && node scripts/e2e-server.mjs",
    env: { E2E_PORT: String(port) },
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
  },
});
