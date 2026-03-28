const { chromium } = require("playwright");

async function login(page, baseUrl, email, password) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.getByRole("button", { name: /Commence Session/i }).click();
  await page.waitForURL(/\/organizations/, { timeout: 60000 });
}

async function main() {
  const baseUrl = process.env.AGENTGUARD_FRONTEND_URL || "https://www.pluvianai.com";
  const email = process.env.AGENTGUARD_TEST_EMAIL || "round1_33c97ae2@example.com";
  const password = process.env.AGENTGUARD_TEST_PASSWORD || "TestPassword123!";
  const orgId = process.env.AGENTGUARD_ORG_ID || "11";
  const projectId = process.env.AGENTGUARD_PROJECT_ID || "18";
  const agentId = process.env.AGENTGUARD_AGENT_ID || "agent-A";
  const datasetLabel = process.env.AGENTGUARD_DATASET_LABEL || "r1-ds-a";

  const out = {
    baseUrl,
    orgId,
    projectId,
    agentId,
    datasetLabel,
    ok: false,
    checks: {
      datasetTabVisible: false,
      datasetListVisible: false,
      datasetSelectable: false,
      startEnabledAfterDataset: false,
      resultsVisible: false,
    },
  };

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1800, height: 1100 } });

  try {
    await login(page, baseUrl, email, password);
    await page.goto(`${baseUrl}/organizations/${orgId}/projects/${projectId}/release-gate`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    const node = page.locator(`[data-testid="rg-node-${agentId}"]`).first();
    await node.waitFor({ state: "visible", timeout: 60000 });
    await node.click({ timeout: 10000 });

    const datasetTab = page.locator('[data-testid="rg-data-tab-datasets"]').first();
    await datasetTab.waitFor({ state: "visible", timeout: 20000 });
    out.checks.datasetTabVisible = true;
    await datasetTab.click({ timeout: 5000 });

    const datasetPanel = page.locator('[data-testid="rg-data-panel-datasets"]').first();
    await datasetPanel.waitFor({ state: "visible", timeout: 20000 });
    const datasetList = page.locator('[data-testid="rg-datasets-state-list"]').first();
    await datasetList.waitFor({ state: "visible", timeout: 20000 });
    out.checks.datasetListVisible = true;

    const datasetRow = datasetList.getByText(datasetLabel, { exact: false }).first();
    await datasetRow.waitFor({ state: "visible", timeout: 15000 });
    const datasetCheckbox = datasetPanel.locator('input[type="checkbox"]').first();
    await datasetCheckbox.click({ timeout: 5000 });
    out.checks.datasetSelectable = true;

    const startBtn = page.locator('[data-testid="rg-run-start-btn"]').first();
    await startBtn.waitFor({ state: "visible", timeout: 20000 });
    await page.waitForTimeout(800);
    out.checks.startEnabledAfterDataset = !(await startBtn.isDisabled());

    if (!out.checks.startEnabledAfterDataset) {
      throw new Error("Start button remained disabled after dataset selection");
    }

    await startBtn.click({ timeout: 5000 });
    const resultRows = page.locator('[data-testid^="rg-result-case-"]');
    await resultRows.first().waitFor({ state: "visible", timeout: 180000 });
    out.checks.resultsVisible = (await resultRows.count()) > 0;

    out.ok = Object.values(out.checks).every(Boolean);
  } catch (error) {
    out.error = String(error);
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify(out, null, 2));
  if (!out.ok) process.exit(1);
}

main();
