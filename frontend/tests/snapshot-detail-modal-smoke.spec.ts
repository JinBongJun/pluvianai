import { test, expect } from "@playwright/test";

/**
 * Smoke: Live View route and shell (full SnapshotDetailModal copy requires auth + open modal).
 * Run: npm run e2e
 */
test.describe("Snapshot detail modal (smoke)", () => {
  test("live-view route does not 500 (may redirect to login)", async ({ page }) => {
    const res = await page.goto("/organizations/1/projects/1/live-view", {
      waitUntil: "domcontentloaded",
    });
    expect(res?.status() ?? 0).toBeLessThan(500);
    await expect(page.locator("body")).toBeVisible({ timeout: 15000 });
  });
});
