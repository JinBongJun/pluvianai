import { test, expect } from "@playwright/test";

/**
 * Org/project stability E2E tests.
 * Run: npm run e2e
 * Requires: dev server + backend running.
 */
test.describe("Org/Project stability", () => {
  test("organizations page loads", async ({ page }) => {
    await page.goto("/organizations");
    await expect(
      page.getByRole("heading", { name: /organizations|your organizations/i })
    ).toBeVisible({ timeout: 15000 });
  });

  test("new org page loads", async ({ page }) => {
    await page.goto("/organizations/new");
    await expect(
      page.getByRole("heading", { name: /create|new organization/i })
    ).toBeVisible({ timeout: 10000 });
  });
});
