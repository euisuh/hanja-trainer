import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    // scripts/** runs under node:test, and e2e/** under Playwright.
    include: ["src/**/*.test.{ts,tsx}", "shared/**/*.test.{ts,tsx}", "worker/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
