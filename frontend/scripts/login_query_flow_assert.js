const { chromium } = require("playwright");

async function login(page, email, password) {
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.getByRole("button", { name: /Commence Session/i }).click();
}

async function main() {
  const baseUrl = process.env.AGENTGUARD_FRONTEND_URL || "http://localhost:3000";
  const email = process.env.AGENTGUARD_TEST_EMAIL || "round1_33c97ae2@example.com";
  const password = process.env.AGENTGUARD_TEST_PASSWORD || "TestPassword123!";

  const out = {
    ok: false,
    scenario: "I-1~I-3 + N-1(login reauth consistency)",
    checks: {
      signup_mode_visible: false,
      signup_mode_has_full_name_field: false,
      login_next_redirect_to_organizations: false,
      reauth_banner_visible: false,
      reauth_param_cleared_from_url: false,
    },
  };

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

  try {
    // I-1: signup query mode
    await page.goto(`${baseUrl}/login?mode=signup&intent=trial`, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    const fullNameField = page.locator('input[name="fullName"]').first();
    await fullNameField.waitFor({ state: "visible", timeout: 15000 });
    out.checks.signup_mode_has_full_name_field = true;
    out.checks.signup_mode_visible = await page.getByRole("button", { name: /Port Protocol/i }).first().isVisible();

    // I-2: safe internal next path redirect after login
    await page.goto(`${baseUrl}/login?next=/organizations`, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await login(page, email, password);
    await page.waitForURL(/\/organizations/, { timeout: 60000 });
    out.checks.login_next_redirect_to_organizations = /\/organizations/.test(page.url());

    // I-3 + N-1: reauth message appears and query param is normalized away
    await page.goto(`${baseUrl}/login?reauth=1`, { waitUntil: "domcontentloaded", timeout: 45000 });
    const banner = page.getByText(/Please log in again\./i).first();
    await banner.waitFor({ state: "visible", timeout: 10000 });
    out.checks.reauth_banner_visible = true;
    await page.waitForTimeout(800); // allow replaceState to settle
    out.checks.reauth_param_cleared_from_url = !page.url().includes("reauth=1");
  } catch (error) {
    out.error = String(error);
  } finally {
    await browser.close();
  }

  out.ok = Object.values(out.checks).every(Boolean);
  console.log(JSON.stringify(out, null, 2));
  if (!out.ok) process.exit(1);
}

main();
