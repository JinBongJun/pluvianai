import { test, expect } from "@playwright/test";

/**
 * Smoke-level checks for Release Gate / Live View routes (no auth seed).
 * Full tool-timeline E2E requires authenticated project + fixture data.
 */
test.describe("Release Gate tool IO (smoke)", () => {
  test("organizations page still loads (sanity)", async ({ page }) => {
    await page.goto("/organizations");
    await expect(page.locator("body")).toBeVisible({ timeout: 15000 });
  });

  test("release gate URL does not 500 (may redirect to login)", async ({ page }) => {
    const res = await page.goto("/organizations/1/projects/1/release-gate", {
      waitUntil: "domcontentloaded",
    });
    expect(res?.status() ?? 0).toBeLessThan(500);
  });
});
