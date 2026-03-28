const { chromium } = require("playwright");

async function login(page, baseUrl, email, password) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.getByRole("button", { name: /Commence Session/i }).click();
  await page.waitForURL(/\/organizations/, { timeout: 60000 });
}

async function closeSettings(page) {
  const closeBtn = page.getByRole("button", { name: /Close Release Gate settings/i }).first();
  await closeBtn.waitFor({ state: "visible", timeout: 10000 });
  await closeBtn.click({ timeout: 5000 });
  await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 10000 });
}

async function main() {
  const baseUrl = process.env.AGENTGUARD_FRONTEND_URL || "http://localhost:3000";
  const projectId = String(process.env.AGENTGUARD_PROJECT_ID || "18");
  const orgId = String(process.env.AGENTGUARD_ORG_ID || "11");
  const email = process.env.AGENTGUARD_TEST_EMAIL || "round1_33c97ae2@example.com";
  const password = process.env.AGENTGUARD_TEST_PASSWORD || "TestPassword123!";
  const mockAgentId = "warn-agent-A";
  const mockSnapshotId = "900001";

  const out = {
    ok: false,
    scenario: "Release Gate WARN-2/5/6/9 UI checks",
    checks: {
      warn9_requires_baseline_before_start: false,
      warn2_platform_override_bypasses_key_block_ui: false,
      warn5_invalid_json_message_visible: false,
      warn6_invalid_tool_params_blocks_start_with_error: false,
    },
    details: {},
  };

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1800, height: 1100 } });

  try {
    await login(page, baseUrl, email, password);

    // Deterministic mocks for warning checks.
    await page.route(new RegExp(`/api/v1/projects/${projectId}/release-gate/agents(\\?.*)?$`), async route => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [{ agent_id: mockAgentId, display_name: "WARN Agent A" }],
        }),
      });
    });
    await page.route(
      new RegExp(`/api/v1/projects/${projectId}/release-gate/agents/${mockAgentId}/recent-snapshots(\\?.*)?$`),
      async route => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            items: [{ id: mockSnapshotId, trace_id: "warn-trace-1", created_at: new Date().toISOString() }],
            total: 1,
          }),
        });
      }
    );
    await page.route(new RegExp(`/api/v1/projects/${projectId}/live-view/snapshots(\\?.*)?$`), async route => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [
            {
              id: Number(mockSnapshotId),
              trace_id: "warn-trace-1",
              agent_id: mockAgentId,
              provider: "openai",
              model: "gpt-4.1-mini",
              user_message: "hello",
              response: "world",
              payload: {
                model: "gpt-4.1-mini",
                temperature: 0.3,
              },
              created_at: new Date().toISOString(),
            },
          ],
          total: 1,
        }),
      });
    });
    await page.route(new RegExp(`/api/v1/projects/${projectId}/user-api-keys(\\?.*)?$`), async route => {
      // Empty list forces missing-key warning in detected mode.
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });

    await page.goto(`${baseUrl}/organizations/${orgId}/projects/${projectId}/release-gate`, {
      waitUntil: "networkidle",
      timeout: 60000,
    });

    const node = page.locator(`[data-testid="rg-node-${mockAgentId}"]`).first();
    await node.waitFor({ state: "visible", timeout: 60000 });
    await node.click({ timeout: 10000 });

    const startBtn = page.locator('[data-testid="rg-run-start-btn"]').first();
    await startBtn.waitFor({ state: "visible", timeout: 20000 });

    // WARN-9: no baseline selected => disabled start + guidance text.
    const initiallyDisabled = await startBtn.isDisabled();
    const baselineGuideVisible = await page
      .getByText(/Select baseline data in Live Logs or Saved Data/i)
      .first()
      .isVisible();
    out.checks.warn9_requires_baseline_before_start = Boolean(initiallyDisabled && baselineGuideVisible);

    // Select one baseline snapshot (enables further checks).
    const firstLiveLogCheckbox = page.locator('[data-testid^="rg-live-log-checkbox-"]').first();
    await firstLiveLogCheckbox.waitFor({ state: "visible", timeout: 20000 });
    await firstLiveLogCheckbox.click({ timeout: 5000 });
    await page.waitForTimeout(400);

    // Open settings panel.
    await page.getByRole("button", { name: /^Settings$/i }).first().click();
    await page.getByRole("dialog").waitFor({ state: "visible", timeout: 10000 });

    // WARN-5: invalid JSON warning on blur.
    const configJsonArea = page.locator("textarea").nth(1);
    await configJsonArea.fill("[");
    await configJsonArea.blur();
    const invalidJsonVisible = await page.getByText(/Invalid JSON|Must be a JSON object/i).first().isVisible();
    out.checks.warn5_invalid_json_message_visible = invalidJsonVisible;
    await configJsonArea.fill("{}");
    await configJsonArea.blur();
    await page.waitForTimeout(250);

    // WARN-2 prep: enable platform override by selecting a model from provider tab.
    await page.getByRole("button", { name: /OpenAI/i }).first().click();
    await page.locator("button", { hasText: "gpt-4o-mini" }).first().click();
    await closeSettings(page);
    await page.waitForTimeout(300);

    // WARN-2: key missing warning should not be shown once override is active.
    const keyWarningCount = await page.getByText(/API key is not registered/i).count();
    const startEnabledWithOverride = !(await startBtn.isDisabled());
    out.checks.warn2_platform_override_bypasses_key_block_ui = Boolean(
      keyWarningCount === 0 && startEnabledWithOverride
    );

    // WARN-6: invalid tool params -> start triggers top error.
    await page.getByRole("button", { name: /^Settings$/i }).first().click();
    await page.getByRole("dialog").waitFor({ state: "visible", timeout: 10000 });
    await page.getByRole("tab", { name: /Environment parity/i }).click();
    await page.getByRole("button", { name: /Tools \(definitions \+ recorded calls\)/i }).click();
    await page.getByRole("button", { name: /Add tool/i }).click();
    const nameInput = page.getByPlaceholder("e.g. get_weather").first();
    await nameInput.fill("bad_tool");
    const paramsArea = page.locator("textarea").last();
    await paramsArea.fill("{");
    const inlineToolParamsErrorVisible = await page
      .getByText(/Parameters must be valid JSON\./i)
      .first()
      .isVisible();
    await closeSettings(page);
    await page.waitForTimeout(300);
    await startBtn.click();
    await page.waitForTimeout(800);
    const topToolErrorCount = await page.getByText(/Tool "bad_tool": parameters must be valid JSON\./i).count();
    const genericToolErrorCount = await page.getByText(/parameters must be valid JSON/i).count();
    const resultCaseCount = await page.locator('[data-testid^="rg-result-case-"]').count();
    out.details.warn6 = {
      inlineToolParamsErrorVisible,
      topToolErrorCount,
      genericToolErrorCount,
      resultCaseCount,
    };
    out.checks.warn6_invalid_tool_params_blocks_start_with_error = Boolean(
      inlineToolParamsErrorVisible &&
        (topToolErrorCount > 0 || genericToolErrorCount > 0 || resultCaseCount === 0)
    );

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
