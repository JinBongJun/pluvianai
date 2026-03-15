const path = require("path");
const { chromium } = require("playwright");

const BASE_URL = "http://localhost:3001";
const EMAIL = "test@example.com";
const PASSWORD = "password123";
const SHOT_DIR = path.join(process.cwd(), "tmp-artifacts");

function shot(name) {
  return path.join(SHOT_DIR, name);
}

async function clickFirstVisible(page, texts) {
  for (const text of texts) {
    const locator = page.getByRole("button", { name: text }).first();
    if (await locator.isVisible().catch(() => false)) {
      await locator.click();
      return true;
    }
  }
  return false;
}

async function main() {
  const browser = await chromium.launch({ headless: false, slowMo: 350 });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const out = { ok: false, shots: [] };

  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.getByRole("button", { name: /Commence Session/i }).click();
    await page.waitForURL(/\/organizations/, { timeout: 60000 });

    await page.goto(`${BASE_URL}/organizations/3/projects/8/live-view`, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await page.getByText(/support-bot/i).first().waitFor({ state: "visible", timeout: 45000 });
    await page.waitForTimeout(1500);
    const liveNode = shot("01-live-view-node.png");
    await page.screenshot({ path: liveNode, fullPage: true });
    out.shots.push(liveNode);

    await page.getByText(/support-bot/i).first().click();
    await page.getByText(/Clinical Log/i).first().waitFor({ state: "visible", timeout: 30000 });
    await page.waitForTimeout(2500);
    const clinicalLog = shot("02-live-view-clinical-log.png");
    await page.screenshot({ path: clinicalLog, fullPage: true });
    out.shots.push(clinicalLog);

    await page.getByText(/^Evaluation$/i).first().click();
    await page.getByText(/Latency Spikes/i).first().waitFor({ state: "visible", timeout: 30000 });
    await page.waitForTimeout(1500);
    const evaluation = shot("03-live-view-evaluation.png");
    await page.screenshot({ path: evaluation, fullPage: true });
    out.shots.push(evaluation);

    await page.getByText(/^Settings$/i).first().click();
    await page.getByText(/Provider API Keys/i).first().waitFor({ state: "visible", timeout: 30000 });
    await page.waitForTimeout(1500);
    const settings = shot("04-live-view-settings.png");
    await page.screenshot({ path: settings, fullPage: true });
    out.shots.push(settings);

    await page.goto(`${BASE_URL}/organizations/3/projects/8/release-gate`, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await page.getByText(/support-bot/i).first().waitFor({ state: "visible", timeout: 45000 });
    await page.getByText(/support-bot/i).first().click();
    await page.getByText(/Live Logs/i).first().waitFor({ state: "visible", timeout: 30000 });
    await page.waitForTimeout(5000);
    const gateSelected = shot("05-release-gate-selected.png");
    await page.screenshot({ path: gateSelected, fullPage: true });
    out.shots.push(gateSelected);

    await page.getByRole("button", { name: /^Settings$/i }).click();
    await page.waitForTimeout(2000);

    const checkboxes = page.locator('input[type="checkbox"][data-testid^="rg-live-log-checkbox-"]');
    const total = await checkboxes.count();
    for (let i = 0; i < Math.min(3, total); i += 1) {
      await checkboxes.nth(i).evaluate((el) => {
        const input = el;
        input.checked = true;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.click();
      });
      await page.waitForTimeout(300);
    }

    const promptBox = page.locator('textarea[placeholder="Override system prompt for the candidate run"]').first();
    await promptBox.fill("Reply in five words or fewer. No explanations.");
    await page.waitForTimeout(1000);
    const gateConfig = shot("06-release-gate-config-before-start.png");
    await page.screenshot({ path: gateConfig, fullPage: true });
    out.shots.push(gateConfig);

    const startBtn = page.locator('[data-testid="rg-run-start-btn"]').first();
    const canStart = await startBtn.isEnabled().catch(() => false);
    out.canStart = canStart;
    if (canStart) {
      await startBtn.click();
      await page.waitForTimeout(8000);
    }
    const closeSettingsBtn = page.locator('button[title="Close settings"]').first();
    if (await closeSettingsBtn.isVisible().catch(() => false)) {
      await closeSettingsBtn.click();
      await page.waitForTimeout(1200);
    }
    await page.locator('[data-testid="rg-main-tab-history"]').evaluate((el) => el.click());
    await page.waitForTimeout(12000);
    const gateHistory = shot("07-release-gate-history-after-run.png");
    await page.screenshot({ path: gateHistory, fullPage: true });
    out.shots.push(gateHistory);

    out.ok = true;
  } catch (error) {
    out.error = String(error);
    out.currentUrl = page.url();
    out.preview = ((await page.locator("body").innerText().catch(() => "")) || "").slice(0, 3000);
    const errorShot = shot("zz-capture-error.png");
    await page.screenshot({ path: errorShot, fullPage: true }).catch(() => {});
    out.shots.push(errorShot);
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify(out, null, 2));
  if (!out.ok) process.exit(1);
}

main();
