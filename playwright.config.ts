import { defineConfig, devices } from "@playwright/test";

const port = process.env.E2E_PORT ?? "8787";
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
    command: `npm run e2e:prepare && npm run dev -- --port ${port}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
