// e2e/trainee.spec.ts
// E2E tests for critical trainee flows — runs against staging environment

import { test, expect } from "@playwright/test";

// ── Auth helper ────────────────────────────────────────────────────────────────

async function signIn(
  page: any,
  role: "trainee" | "instructor" | "committee" = "trainee",
) {
  const emails = {
    trainee: process.env.STAGING_TEST_TRAINEE_EMAIL!,
    instructor: process.env.STAGING_TEST_INSTRUCTOR_EMAIL!,
    committee: process.env.STAGING_TEST_COMMITTEE_EMAIL!,
  };
  const passwords = {
    trainee: process.env.STAGING_TEST_TRAINEE_PASSWORD!,
    instructor: process.env.STAGING_TEST_INSTRUCTOR_PASSWORD!,
    committee: process.env.STAGING_TEST_COMMITTEE_PASSWORD!,
  };

  await page.goto("/signin");
  await page.getByPlaceholder("user@example.com").fill(emails[role]);
  await page.getByPlaceholder("Enter password").fill(passwords[role]);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL(`**/${role}`, { timeout: 10000 });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe("Sign in flow", () => {
  test("trainee can sign in and reach dashboard", async ({ page }) => {
    await signIn(page);
    await expect(page).toHaveURL(/\/trainee/);
    // Dashboard should show Welcome back heading
    await expect(
      page.getByRole("heading", { name: /Welcome back/i }),
    ).toBeVisible();
  });

  test("wrong password shows error", async ({ page }) => {
    await page.goto("/signin");
    await page
      .getByPlaceholder("user@example.com")
      .fill(process.env.STAGING_TEST_EMAIL!);
    await page.getByPlaceholder("Enter password").fill("wrongpassword123");
    await page.getByRole("button", { name: "Sign In" }).click();
    // Should stay on signin and show error
    await expect(page).toHaveURL(/\/signin/);
    await expect(page.locator("text=Invalid")).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Trainee dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("shows all 6 stat cards", async ({ page }) => {
    await expect(page.getByText("Enrolled")).toBeVisible();
    await expect(page.getByText("In Progress")).toBeVisible();
    await expect(page.getByText("Completed")).toBeVisible();
    await expect(page.getByText("Overall")).toBeVisible();
    await expect(page.getByText("Accuracy")).toBeVisible();
    await expect(page.getByText("Your Rank")).toBeVisible();
  });

  test("sidebar navigation works", async ({ page }) => {
    // Navigate to competencies
    await page.getByRole("link", { name: "Competencies" }).click();
    await expect(page).toHaveURL(/\/trainee\/competencies/);

    // Navigate to progress
    await page.getByRole("link", { name: "My Progress" }).click();
    await expect(page).toHaveURL(/\/trainee\/progress/);

    // Navigate back to dashboard
    await page.getByRole("link", { name: "Dashboard" }).click();
    await expect(page).toHaveURL(/\/trainee$/);
  });
});

test.describe("Competencies page", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await page.goto("/trainee/competencies");
  });

  test("loads competency list", async ({ page }) => {
    // Table should render with at least one row
    await expect(page.locator("table")).toBeVisible();
    await expect(page.locator("tbody tr").first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("search filters competencies", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Search name, difficulty, tag…");
    await searchInput.fill("IVUS");
    // Results should update
    await page.waitForTimeout(300);
    const rows = page.locator("tbody tr");
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
  });

  test("clicking a row opens detail panel", async ({ page }) => {
    await page.locator("tbody tr").first().click();
    // Detail modal should appear
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Settings page", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await page.goto("/settings");
  });

  test("shows three tabs", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Profile" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Security" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Preferences" }),
    ).toBeVisible();
  });

  test("switching tabs works", async ({ page }) => {
    await page.getByRole("button", { name: "Security" }).click();
    await expect(page.getByText("Password")).toBeVisible();
    await expect(page.getByText("Danger zone")).toBeVisible();

    await page.getByRole("button", { name: "Preferences" }).click();
    await expect(page.getByText("Dark theme")).toBeVisible();
  });

  test("dark mode toggle works", async ({ page }) => {
    await page.getByRole("button", { name: "Preferences" }).click();
    const toggle = page.getByRole("button", { name: "Toggle dark mode" });
    await toggle.click();
    // html element should have dark class
    await expect(page.locator("html")).toHaveClass(/dark/, { timeout: 2000 });
    // Toggle back
    await toggle.click();
    await expect(page.locator("html")).not.toHaveClass(/dark/, {
      timeout: 2000,
    });
  });
});

test.describe("Sign out", () => {
  test("trainee can sign out", async ({ page }) => {
    await signIn(page);
    // Open profile menu in sidebar
    await page.locator("button[aria-haspopup='menu']").click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    // Should redirect to signin or home
    await expect(page).toHaveURL(/\/(signin|$)/, { timeout: 5000 });
  });
});
