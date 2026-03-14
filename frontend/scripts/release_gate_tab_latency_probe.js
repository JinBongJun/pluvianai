const { chromium } = require("playwright");

function summarize(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const pick = p => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return {
    count: values.length,
    min_ms: Math.round(sorted[0]),
    p50_ms: Math.round(pick(50)),
    p95_ms: Math.round(pick(95)),
    max_ms: Math.round(sorted[sorted.length - 1]),
    avg_ms: Math.round(avg),
  };
}

async function waitForTabSettled(page, tabId, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ready = await page.evaluate(targetTab => {
      const has = sel => {
        const el = document.querySelector(sel);
        if (!el) return false;
        const style = window.getComputedStyle(el);
        return style.display !== "none" && style.visibility !== "hidden";
      };

      if (targetTab === "logs") {
        if (!has('[data-testid="rg-data-panel-logs"]')) return false;
        return (
          has('[data-testid="rg-logs-state-list"]') ||
          has('[data-testid="rg-logs-state-empty"]') ||
          has('[data-testid="rg-logs-state-error"]') ||
          has('[data-testid="rg-logs-state-loading"]')
        );
      }

      if (!has('[data-testid="rg-data-panel-datasets"]')) return false;
      return (
        has('[data-testid="rg-datasets-state-list"]') ||
        has('[data-testid="rg-datasets-state-empty"]') ||
        has('[data-testid="rg-datasets-state-error"]') ||
        has('[data-testid="rg-datasets-state-loading"]')
      );
    }, tabId);

    if (ready) return Date.now() - start;
    await page.waitForTimeout(80);
  }
  throw new Error(`Timeout waiting for tab "${tabId}" settle`);
}

async function main() {
  const baseUrl = process.env.AGENTGUARD_FRONTEND_URL || "http://localhost:3000";
  const email = process.env.AGENTGUARD_TEST_EMAIL || "round1_33c97ae2@example.com";
  const password = process.env.AGENTGUARD_TEST_PASSWORD || "TestPassword123!";
  const orgId = process.env.AGENTGUARD_ORG_ID || "11";
  const projectId = process.env.AGENTGUARD_PROJECT_ID || "18";
  const agentId = process.env.AGENTGUARD_AGENT_ID || "agent-A";
  const rounds = Number(process.env.AGENTGUARD_TAB_PROBE_ROUNDS || "8");

  const result = {
    ok: false,
    rounds,
    logs_switch_ms: [],
    datasets_switch_ms: [],
    logs_summary: null,
    datasets_summary: null,
    note: "",
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

    const logsTab = page.locator('[data-testid="rg-data-tab-logs"]').first();
    const datasetsTab = page.locator('[data-testid="rg-data-tab-datasets"]').first();
    await logsTab.waitFor({ state: "visible", timeout: 30000 });
    await datasetsTab.waitFor({ state: "visible", timeout: 30000 });

    // Warmup
    await waitForTabSettled(page, "logs");
    await datasetsTab.click({ timeout: 6000 });
    await waitForTabSettled(page, "datasets");
    await logsTab.click({ timeout: 6000 });
    await waitForTabSettled(page, "logs");

    for (let i = 0; i < rounds; i++) {
      await datasetsTab.click({ timeout: 6000 });
      const dMs = await waitForTabSettled(page, "datasets");
      result.datasets_switch_ms.push(dMs);

      await logsTab.click({ timeout: 6000 });
      const lMs = await waitForTabSettled(page, "logs");
      result.logs_switch_ms.push(lMs);
    }

    result.logs_summary = summarize(result.logs_switch_ms);
    result.datasets_summary = summarize(result.datasets_switch_ms);

    const logsP95 = result.logs_summary?.p95_ms ?? 999999;
    const datasetsP95 = result.datasets_summary?.p95_ms ?? 999999;
    const logsMax = result.logs_summary?.max_ms ?? 999999;
    const datasetsMax = result.datasets_summary?.max_ms ?? 999999;

    // Practical SMB guardrail for this headless local probe.
    result.ok = logsP95 <= 2500 && datasetsP95 <= 2500 && logsMax <= 5000 && datasetsMax <= 5000;
    result.note = result.ok
      ? "Latency probe within guardrails (p95<=2500ms, max<=5000ms)."
      : "Latency exceeded guardrails.";
  } catch (error) {
    result.note = String(error);
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}

main();
