const { chromium } = require("playwright");

async function assertReauthLanding(page) {
  await page.waitForURL(/\/login/, { timeout: 30000 });
  const banner = page.getByText(/Please log in again\./i).first();
  await banner.waitFor({ state: "visible", timeout: 10000 });
  const firstUrl = page.url();
  await page.waitForTimeout(1000);
  const secondUrl = page.url();
  return {
    landedOnLogin: /\/login/.test(secondUrl),
    bannerVisible: true,
    urlStableAfterLanding: firstUrl === secondUrl,
    hasRecoveryQuery: secondUrl.includes("reauth=1") || secondUrl.includes("next="),
    finalUrl: secondUrl,
  };
}

async function runCase(baseUrl, route, tokenValue) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const result = {
    route,
    tokenType: tokenValue ? "invalid_token" : "missing_token",
    ok: false,
  };

  try {
    // Prime origin and storage
    await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 45000 });
    const url = new URL(baseUrl);
    await page.context().clearCookies();
    if (tokenValue) {
      await page.context().addCookies([
        {
          name: "access_token",
          value: tokenValue,
          domain: url.hostname,
          path: "/",
          httpOnly: false,
          secure: url.protocol === "https:",
          sameSite: "Lax",
        },
      ]);
    }

    await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    const checks = await assertReauthLanding(page);
    result.checks = checks;
    result.ok = Boolean(checks.landedOnLogin && checks.bannerVisible);
  } catch (error) {
    result.error = String(error);
  } finally {
    await browser.close();
  }

  return result;
}

async function main() {
  const baseUrl = process.env.AGENTGUARD_FRONTEND_URL || "http://localhost:3000";
  const invalidToken = "ey.invalid.token";

  const cases = [
    { route: "/organizations", token: null },
    { route: "/organizations", token: invalidToken },
    { route: "/settings/profile", token: null },
    { route: "/settings/profile", token: invalidToken },
  ];

  const results = [];
  for (const c of cases) {
    // serial run for deterministic redirects/state
    // eslint-disable-next-line no-await-in-loop
    results.push(await runCase(baseUrl, c.route, c.token));
  }

  const out = {
    ok: results.every(r => r.ok),
    scenario: "N-1 protected-route reauth matrix",
    results,
  };

  console.log(JSON.stringify(out, null, 2));
  if (!out.ok) process.exit(1);
}

main();
