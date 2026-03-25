import { test, expect } from "@playwright/test";

test.describe("Trust / Live View data page", () => {
  test("/trust loads marketing copy", async ({ page }) => {
    await page.goto("/trust", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Live View & ingest data/i })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText(/ingest API/i).first()).toBeVisible();
  });
});
