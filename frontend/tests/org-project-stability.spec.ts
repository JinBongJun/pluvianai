import { test, expect } from "@playwright/test";

/**
 * Org/project stability E2E tests.
 * Run: npm run e2e
 * Requires: dev server + backend running.
 */
test.describe("Org/Project stability", () => {
  test("organizations page loads", async ({ page }) => {
    await page.goto("/organizations");
    await page.waitForLoadState("domcontentloaded");
    await expect(page).toHaveURL(/\/(organizations|login)/, { timeout: 15000 });
    await expect(page.locator("body")).toBeAttached({ timeout: 15000 });
  });

  test("new org page loads", async ({ page }) => {
    await page.goto("/organizations/new");
    await page.waitForLoadState("domcontentloaded");
    await expect(page).toHaveURL(/\/(organizations\/new|login)/, { timeout: 15000 });
    await expect(page.locator("body")).toBeAttached({ timeout: 15000 });
  });
});
