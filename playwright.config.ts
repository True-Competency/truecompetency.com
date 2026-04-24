// playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests always run against staging — never production.
 * Set STAGING_URL in CI secrets or locally in .env.test
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI, // fail if test.only is committed
  retries: process.env.CI ? 2 : 0, // retry flaky tests in CI only
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",

  use: {
    // Always point at staging — never production
    baseURL: process.env.STAGING_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
