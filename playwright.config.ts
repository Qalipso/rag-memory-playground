import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config. Boots the Next dev server and runs browser tests against it.
 * Assertions are structural (stages present, ≥1 block, graph populated) so the
 * suite passes whether providers run real (keys present) or stub (CI).
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
    // Force deterministic stub providers: fast, offline, no flaky LLM latency.
    env: { FRAMEWORK_MODE: "local" },
  },
});
