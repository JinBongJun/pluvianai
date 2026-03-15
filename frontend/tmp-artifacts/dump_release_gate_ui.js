const { chromium } = require("playwright");

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  try {
    await page.goto("http://localhost:3001/login", { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.fill('input[name="email"]', "test@example.com");
    await page.fill('input[name="password"]', "password123");
    await page.getByRole("button", { name: /Commence Session/i }).click();
    await page.waitForURL(/\/organizations/, { timeout: 60000 });
    await page.goto("http://localhost:3001/organizations/3/projects/8/release-gate", {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await page.getByText(/support-bot/i).first().waitFor({ state: "visible", timeout: 45000 });
    await page.getByText(/support-bot/i).first().click();
    await page.waitForTimeout(4000);
    const buttons = await page.locator("button:visible").evaluateAll(nodes =>
      nodes.map(n => (n.textContent || "").trim()).filter(Boolean)
    );
    const tabs = await page.locator('[role="tab"], button:visible').evaluateAll(nodes =>
      nodes.map(n => (n.textContent || "").trim()).filter(Boolean)
    );
    const body = ((await page.locator("body").innerText()) || "").slice(0, 4000);
    console.log(JSON.stringify({ buttons, tabs, body }, null, 2));
  } finally {
    await browser.close();
  }
}

main();
