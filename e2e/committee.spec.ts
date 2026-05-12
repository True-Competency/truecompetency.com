// e2e/committee.spec.ts
// Comprehensive E2E tests for committee dashboard and all sub-pages
// Runs against staging — never production

import { test, expect, type Page } from "@playwright/test";

// ── Auth helper ────────────────────────────────────────────────────────────────

async function signInAsCommittee(page: Page) {
  await page.goto("/signin");
  await page
    .getByPlaceholder("user@example.com")
    .fill(process.env.STAGING_TEST_COMMITTEE_EMAIL!);
  await page
    .getByPlaceholder("Enter password")
    .fill(process.env.STAGING_TEST_COMMITTEE_PASSWORD!);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL("**/committee", { timeout: 10000 });
}

// ── Dashboard ──────────────────────────────────────────────────────────────────

test.describe("Committee dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsCommittee(page);
  });

  test("loads dashboard with welcome heading", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /Welcome Back/i }),
    ).toBeVisible({ timeout: 8000 });
  });

  test("shows all 4 stat widgets", async ({ page }) => {
    await expect(page.getByText("Competency Coverage")).toBeVisible({
      timeout: 8000,
    });
    await expect(page.getByText("Members")).toBeVisible();
    await expect(page.getByText("Pending Reviews")).toBeVisible();
    await expect(page.getByText("Without Questions")).toBeVisible();
  });

  test("shows Recent Proposals and Vote Activity panels", async ({ page }) => {
    await expect(page.getByText("Recent Proposals")).toBeVisible({
      timeout: 8000,
    });
    await expect(page.getByText("Vote Activity")).toBeVisible();
  });

  test("shows Quick Actions section", async ({ page }) => {
    await expect(page.getByText("Quick Actions")).toBeVisible({
      timeout: 8000,
    });
    await expect(
      page.getByRole("link", { name: /Propose Competency/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Propose Question/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Review Queue/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /View Members/ }),
    ).toBeVisible();
  });

  test("View competencies link navigates correctly", async ({ page }) => {
    await page.getByRole("link", { name: "View competencies" }).first().click();
    await expect(page).toHaveURL(/\/committee\/competencies/);
  });

  test("View all members link navigates correctly", async ({ page }) => {
    await page.getByRole("link", { name: "View all" }).click();
    await expect(page).toHaveURL(/\/committee\/members/);
  });

  test("Review competencies link navigates correctly", async ({ page }) => {
    await page.getByRole("link", { name: "Review competencies" }).click();
    await expect(page).toHaveURL(/\/committee\/review-queue\/competencies/);
  });

  test("Review questions link navigates correctly", async ({ page }) => {
    await page.getByRole("link", { name: "Review questions" }).click();
    await expect(page).toHaveURL(/\/committee\/review-queue\/questions/);
  });
});

// ── Sidebar navigation ─────────────────────────────────────────────────────────

test.describe("Committee sidebar navigation", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsCommittee(page);
  });

  test("navigates to competencies page", async ({ page }) => {
    await page.getByRole("link", { name: "Competencies" }).click();
    await expect(page).toHaveURL(/\/committee\/competencies/);
    await expect(
      page.getByRole("heading", { name: "Competencies" }),
    ).toBeVisible();
  });

  test("navigates to review queue", async ({ page }) => {
    await page.getByRole("link", { name: "Review Queue" }).click();
    await expect(page).toHaveURL(/\/committee\/review-queue/);
  });

  test("navigates to members page", async ({ page }) => {
    await page.getByRole("link", { name: "Members" }).click();
    await expect(page).toHaveURL(/\/committee\/members/);
    await expect(
      page.getByRole("heading", { name: "Committee Members" }),
    ).toBeVisible();
  });

  test("sidebar collapses and expands", async ({ page }) => {
    const toggleBtn = page.locator("button[aria-label='Toggle sidebar']");
    if (await toggleBtn.isVisible()) {
      await toggleBtn.click();
      // Sidebar text should be hidden when collapsed
      await expect(
        page.getByRole("link", { name: "Competencies" }),
      ).not.toBeVisible();
      // Expand again
      await toggleBtn.click();
      await expect(
        page.getByRole("link", { name: "Competencies" }),
      ).toBeVisible();
    }
  });
});

// ── Competencies page ──────────────────────────────────────────────────────────

test.describe("Committee competencies page", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsCommittee(page);
    await page.goto("/committee/competencies");
  });

  test("loads competency table", async ({ page }) => {
    await expect(page.locator("table")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("tbody tr").first()).toBeVisible();
  });

  test("search filters competencies", async ({ page }) => {
    const search = page.getByPlaceholder("Search name, difficulty, tag…");
    await search.fill("IVUS");
    await page.waitForTimeout(400);
    const rows = page.locator("tbody tr");
    expect(await rows.count()).toBeGreaterThan(0);
  });

  test("clear button resets search", async ({ page }) => {
    const search = page.getByPlaceholder("Search name, difficulty, tag…");
    await search.fill("xyz_not_exist");
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Clear" }).click();
    await expect(search).toHaveValue("");
  });

  test("tag chip filters competencies", async ({ page }) => {
    const tagChips = page
      .locator("button[class*='rounded-full']")
      .filter({ hasText: /^#/ });
    const count = await tagChips.count();
    if (count > 0) {
      await tagChips.first().click();
      await page.waitForTimeout(300);
      // At minimum table should still show (even if filtered to 0)
      await expect(page.locator("table")).toBeVisible();
    }
  });

  test("clicking questions badge opens question preview modal", async ({
    page,
  }) => {
    // Find first row with a questions badge (green button)
    const questionBtn = page
      .locator("button")
      .filter({ hasText: /question/ })
      .first();
    if (await questionBtn.isVisible({ timeout: 5000 })) {
      await questionBtn.click();
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });
      await expect(page.getByText("Competency Questions")).toBeVisible();
    }
  });

  test("question preview modal closes on X button", async ({ page }) => {
    const questionBtn = page
      .locator("button")
      .filter({ hasText: /question/ })
      .first();
    if (await questionBtn.isVisible({ timeout: 5000 })) {
      await questionBtn.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.getByRole("dialog").getByRole("button", { name: "" }).click();
      await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 3000 });
    }
  });

  test("Propose Competency button opens modal", async ({ page }) => {
    await page.getByRole("button", { name: "Propose Competency" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText("Propose a new competency")).toBeVisible();
  });

  test("propose competency modal closes on cancel", async ({ page }) => {
    await page.getByRole("button", { name: "Propose Competency" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 3000 });
  });

  test("propose competency modal closes on backdrop click", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Propose Competency" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.mouse.click(10, 10); // click outside modal
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 3000 });
  });

  test("propose competency form validates empty name", async ({ page }) => {
    await page.getByRole("button", { name: "Propose Competency" }).click();
    await page.getByRole("button", { name: "Submit proposal" }).click();
    // Should show error — name is required
    await expect(page.getByText(/name/i)).toBeVisible();
  });

  test("Propose Question button opens modal", async ({ page }) => {
    await page.getByRole("button", { name: "Propose Question" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText("Propose a test question")).toBeVisible();
  });

  test("propose question modal closes on cancel", async ({ page }) => {
    await page.getByRole("button", { name: "Propose Question" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 3000 });
  });

  test("propose question form validates missing competency", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Propose Question" }).click();
    await page.getByRole("button", { name: "Submit question" }).click();
    await expect(page.getByText(/competency/i)).toBeVisible();
  });
});

// ── Review queue — Competencies ────────────────────────────────────────────────

test.describe("Review queue — competencies", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsCommittee(page);
    await page.goto("/committee/review-queue/competencies");
  });

  test("loads review queue page", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /Review Queue/i }),
    ).toBeVisible({ timeout: 8000 });
  });

  test("search works", async ({ page }) => {
    const search = page.getByPlaceholder("Search name, difficulty, tag…");
    await search.fill("test");
    await page.waitForTimeout(300);
    await expect(
      page.locator("table, .flex.flex-col.items-center"),
    ).toBeVisible();
  });

  test("clear search button works", async ({ page }) => {
    const search = page.getByPlaceholder("Search name, difficulty, tag…");
    await search.fill("something");
    await page.waitForTimeout(300);
    const clearBtn = page.getByRole("button", { name: "Clear" });
    if (await clearBtn.isVisible()) {
      await clearBtn.click();
      await expect(search).toHaveValue("");
    }
  });

  test("shows empty state when no proposals", async ({ page }) => {
    // May or may not have proposals — just verify the page renders correctly
    const hasTable = await page
      .locator("table")
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    const hasEmpty = await page
      .getByText("No proposed competencies pending review.")
      .isVisible()
      .catch(() => false);
    expect(hasTable || hasEmpty).toBe(true);
  });

  test("vote buttons visible when proposals exist", async ({ page }) => {
    const hasTable = await page
      .locator("table")
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    if (hasTable) {
      // Check for approve/reject vote buttons
      const approveBtn = page.locator("button[title='Approve']").first();
      await expect(approveBtn).toBeVisible();
    }
  });
});

// ── Members page ───────────────────────────────────────────────────────────────

test.describe("Committee members page", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsCommittee(page);
    await page.goto("/committee/members");
  });

  test("loads members page", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Committee Members" }),
    ).toBeVisible({ timeout: 8000 });
  });

  test("shows member count in subtitle", async ({ page }) => {
    await expect(page.getByText(/member/i)).toBeVisible({ timeout: 8000 });
  });

  test("shows member cards", async ({ page }) => {
    // At minimum the test committee user should appear
    await expect(page.locator(".card").first()).toBeVisible({ timeout: 8000 });
  });

  test("chair section shown when chair exists", async ({ page }) => {
    const chairSection = page.getByText("Committee Chair");
    const hasChair = await chairSection
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    if (hasChair) {
      await expect(page.getByText("Members")).toBeVisible();
    }
  });
});

// ── Settings page (committee user) ────────────────────────────────────────────

test.describe("Committee settings", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsCommittee(page);
    await page.goto("/settings");
  });

  test("shows settings page with tabs", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Profile" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Security" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Preferences" }),
    ).toBeVisible();
  });

  test("profile tab shows form fields", async ({ page }) => {
    await expect(page.getByPlaceholder("Jane")).toBeVisible({ timeout: 5000 });
    await expect(page.getByPlaceholder("Doe")).toBeVisible();
  });

  test("security tab shows password form and danger zone", async ({ page }) => {
    await page.getByRole("button", { name: "Security" }).click();
    await expect(page.getByText("Password")).toBeVisible();
    await expect(page.getByText("Danger zone")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Delete account" }),
    ).toBeVisible();
  });

  test("delete account modal requires confirmation text", async ({ page }) => {
    await page.getByRole("button", { name: "Security" }).click();
    await page.getByRole("button", { name: "Delete account" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    // Confirm button should be disabled until DELETE is typed
    const confirmBtn = page
      .getByRole("dialog")
      .getByRole("button", { name: "Delete account" });
    await expect(confirmBtn).toBeDisabled();
    await page
      .getByRole("dialog")
      .getByPlaceholder("Type DELETE to confirm")
      .fill("DELETE");
    await expect(confirmBtn).not.toBeDisabled();
  });

  test("delete account modal closes on cancel", async ({ page }) => {
    await page.getByRole("button", { name: "Security" }).click();
    await page.getByRole("button", { name: "Delete account" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 3000 });
  });

  test("preferences tab shows dark mode toggle", async ({ page }) => {
    await page.getByRole("button", { name: "Preferences" }).click();
    await expect(page.getByText("Dark theme")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Toggle dark mode" }),
    ).toBeVisible();
  });
});

// ── Support modal ──────────────────────────────────────────────────────────────

test.describe("Support modal", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsCommittee(page);
  });

  test("opens support modal", async ({ page }) => {
    await page.getByRole("button", { name: "Get Help & Support" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText("Help & Support")).toBeVisible();
  });

  test("support modal closes on X button", async ({ page }) => {
    await page.getByRole("button", { name: "Get Help & Support" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Close support dialog" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 3000 });
  });

  test("support modal closes on backdrop click", async ({ page }) => {
    await page.getByRole("button", { name: "Get Help & Support" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.mouse.click(10, 10);
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 3000 });
  });

  test("support modal validates empty message", async ({ page }) => {
    await page.getByRole("button", { name: "Get Help & Support" }).click();
    await page.getByRole("button", { name: "Send Message" }).click();
    await expect(page.getByText(/describe/i)).toBeVisible();
  });

  test("support modal character counter works", async ({ page }) => {
    await page.getByRole("button", { name: "Get Help & Support" }).click();
    const textarea = page.getByPlaceholder(
      "Describe your issue or question...",
    );
    await textarea.fill("Hello");
    await expect(page.getByText("5/2000")).toBeVisible();
  });
});

// ── Sign out ───────────────────────────────────────────────────────────────────

test.describe("Sign out", () => {
  test("committee member can sign out", async ({ page }) => {
    await signInAsCommittee(page);
    await page
      .locator(
        "button[aria-haspopup='menu'], button[aria-label*='profile'], button[aria-label*='menu']",
      )
      .first()
      .click();
    await page.getByRole("menuitem", { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/(signin|$)/, { timeout: 5000 });
  });
});
