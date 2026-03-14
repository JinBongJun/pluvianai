const { chromium } = require("playwright");

async function main() {
  const baseUrl = process.env.AGENTGUARD_FRONTEND_URL || "http://localhost:3000";
  const email = process.env.AGENTGUARD_TEST_EMAIL || "round1_33c97ae2@example.com";
  const password = process.env.AGENTGUARD_TEST_PASSWORD || "TestPassword123!";
  const orgId = process.env.AGENTGUARD_ORG_ID || "11";
  const projectId = process.env.AGENTGUARD_PROJECT_ID || "18";
  const agentId = process.env.AGENTGUARD_AGENT_ID || "agent-A";
  const repeat = Number(process.env.AGENTGUARD_REPEAT_RUNS || "10");

  const out = {
    baseUrl,
    orgId,
    projectId,
    agentId,
    repeat,
    ok: false,
    statuses: [],
    ratios: [],
    hasFlaky: false,
  };

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1800, height: 1100 } });

  try {
    await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.getByRole("button", { name: /Commence Session/i }).click();
    await page.waitForURL(/\/organizations/, { timeout: 45000 });

    await page.goto(
      `${baseUrl}/organizations/${orgId}/projects/${projectId}/release-gate`,
      { waitUntil: "domcontentloaded", timeout: 45000 }
    );

    const node = page.locator(`[data-testid="rg-node-${agentId}"]`).first();
    await node.waitFor({ state: "visible", timeout: 60000 });
    await node.click({ timeout: 8000 });

    const startBtn = page.locator('[data-testid="rg-run-start-btn"]').first();
    await startBtn.waitFor({ state: "visible", timeout: 60000 });

    const disabled = await startBtn.isDisabled();
    if (disabled) {
      const firstLiveLogCheckbox = page.locator('[data-testid^="rg-live-log-checkbox-"]').first();
      await firstLiveLogCheckbox.waitFor({ state: "visible", timeout: 30000 });
      await firstLiveLogCheckbox.click({ timeout: 5000 });
      await page.waitForTimeout(600);
    }

    if (repeat > 0) {
      const repeatTrigger = page.locator('[data-testid="rg-repeat-trigger"]').first();
      await repeatTrigger.click({ timeout: 5000 });
      const repeatOption = page.locator(`[data-testid="rg-repeat-option-${repeat}"]`).first();
      await repeatOption.waitFor({ state: "visible", timeout: 8000 });
      await repeatOption.click({ timeout: 5000 });
      await page.waitForTimeout(600);
    }

    await startBtn.click({ timeout: 5000 });

    const firstStatus = page.locator('[data-testid^="rg-result-case-status-"]').first();
    await firstStatus.waitFor({ state: "visible", timeout: 180000 });

    const statusNodes = page.locator('[data-testid^="rg-result-case-status-"]');
    const ratioNodes = page.locator('[data-testid^="rg-result-case-ratio-"]');
    const statusCount = await statusNodes.count();
    const ratioCount = await ratioNodes.count();

    for (let i = 0; i < statusCount; i++) {
      const txt = (await statusNodes.nth(i).innerText()).trim().toUpperCase();
      out.statuses.push(txt);
    }
    for (let i = 0; i < ratioCount; i++) {
      const txt = (await ratioNodes.nth(i).innerText()).trim();
      out.ratios.push(txt);
    }

    out.hasFlaky = out.statuses.includes("FLAKY");
    const allStatusesValid = out.statuses.every(s => ["PASS", "FAIL", "FLAKY"].includes(s));
    const allRatiosValid = out.ratios.every(r => /^\d+\s*\/\s*\d+\s+passed$/i.test(r));
    out.ok = statusCount > 0 && ratioCount > 0 && allStatusesValid && allRatiosValid;
  } catch (error) {
    out.error = String(error);
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify(out, null, 2));
  if (!out.ok) process.exit(1);
}

main();
