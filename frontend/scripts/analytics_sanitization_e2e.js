const { chromium } = require("playwright");

const TARGET_EVENT = "qa_analytics_sanitization_probe";

function parseBody(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    // no-op
  }

  try {
    const params = new URLSearchParams(raw);
    const data = params.get("data");
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch {
      return JSON.parse(decodeURIComponent(data));
    }
  } catch {
    return null;
  }
}

function extractTargetEvent(payload) {
  if (!payload || typeof payload !== "object") return null;
  if (payload.event === TARGET_EVENT) return payload;
  if (Array.isArray(payload.batch)) {
    return payload.batch.find(item => item && item.event === TARGET_EVENT) || null;
  }
  return null;
}

async function maybeLogin(page, baseUrl, email, password) {
  if (!page.url().includes("/login")) return;
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.getByRole("button", { name: /Commence Session/i }).click();
  await page.waitForURL(/\/organizations|\/internal/, { timeout: 45000 });
}

async function main() {
  const baseUrl = process.env.AGENTGUARD_FRONTEND_URL || "http://localhost:3000";
  const email = process.env.AGENTGUARD_TEST_EMAIL || "round1_33c97ae2@example.com";
  const password = process.env.AGENTGUARD_TEST_PASSWORD || "TestPassword123!";
  const probePath = "/internal/analytics-sanitization";

  const output = {
    ok: false,
    event: TARGET_EVENT,
    captured_url: null,
    checks: {},
    message: "",
  };

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

  let captured = null;
  let sinkCaptured = null;

  await page.addInitScript(() => {
    window.__AGENTGUARD_ANALYTICS_SINK__ = payload => {
      window.__AGENTGUARD_ANALYTICS_LAST__ = payload;
    };
  });

  await page.route("**/*", async route => {
    const req = route.request();
    if (req.method() === "POST") {
      const raw = req.postData();
      const parsed = parseBody(raw);
      const evt = extractTargetEvent(parsed);
      if (evt && !captured) {
        captured = { url: req.url(), payload: evt };
      }
    }
    await route.continue();
  });

  try {
    await page.goto(`${baseUrl}${probePath}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await maybeLogin(page, baseUrl, email, password);

    if (!page.url().includes(probePath)) {
      await page.goto(`${baseUrl}${probePath}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    }

    await page.locator('[data-testid="analytics-sanitization-send"]').click({ timeout: 8000 });
    await page.locator('[data-testid="analytics-sanitization-status"]').waitFor({ state: "visible" });

    const started = Date.now();
    while ((!captured && !sinkCaptured) && Date.now() - started < 30000) {
      sinkCaptured = await page.evaluate(() => window.__AGENTGUARD_ANALYTICS_LAST__ || null);
      await page.waitForTimeout(400);
    }

    const source = sinkCaptured
      ? { url: "window.__AGENTGUARD_ANALYTICS_SINK__", payload: sinkCaptured }
      : captured;

    if (!source) {
      output.message = "No analytics payload observed (network or local sink).";
      console.log(JSON.stringify(output, null, 2));
      process.exit(1);
    }

    const props = source.payload.properties || {};
    const longText = String(props.long_text || "");
    const items = Array.isArray(props.items) ? props.items : [];
    const nestedSecret = props.nested && typeof props.nested === "object" ? props.nested.secret : undefined;

    output.captured_url = source.url;
    output.checks = {
      email_redacted: props.email === "[REDACTED]",
      password_redacted: props.password === "[REDACTED]",
      api_key_redacted: props.api_key === "[REDACTED]",
      access_token_redacted: props.access_token === "[REDACTED]",
      nested_secret_redacted: nestedSecret === "[REDACTED]",
      email_value_redacted: props.contact === "[REDACTED]",
      long_text_truncated_200: longText.length === 200,
      array_capped_20: items.length === 20,
    };

    output.ok = Object.values(output.checks).every(Boolean);
    output.message = output.ok ? "Frontend analytics sanitization checks passed." : "One or more sanitization checks failed.";
  } catch (error) {
    output.message = String(error);
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify(output, null, 2));
  if (!output.ok) process.exit(1);
}

main();
