const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

async function login(page, baseUrl, email, password) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.getByRole("button", { name: /Commence Session/i }).click();
  await page.waitForURL(/\/organizations/, { timeout: 45000 });
}

async function getAuthCookieHeader(page, targetUrl) {
  const cookies = await page.context().cookies(targetUrl);
  if (!cookies.length) return null;
  return cookies.map(cookie => `${cookie.name}=${cookie.value}`).join("; ");
}

async function checkLoggedOutLanding(baseUrl) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const result = {
    landing_has_pricing_section: false,
    landing_lists_starter_tier: false,
  };

  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 45000 });
    result.landing_has_pricing_section = (await page.locator("#pricing").count()) > 0;
    const body = (await page.locator("body").innerText().catch(() => "")) || "";
    result.landing_lists_starter_tier = /\bStarter\b/i.test(body);
  } finally {
    await browser.close();
  }

  return result;
}

async function checkLoggedInLandingAndBilling(baseUrl, backendUrl, email, password, orgId) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1800, height: 1100 } });
  const result = {
    home_links_to_organizations: false,
    billing_h1_organization_usage: false,
    billing_shows_infrastructure_licenses: false,
    billing_account_managed_cta: false,
    details: {},
  };

  try {
    await login(page, baseUrl, email, password);

    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 45000 });
    const orgLink = page.locator('a[href="/organizations"]').first();
    result.home_links_to_organizations =
      (await orgLink.count()) > 0 && (await orgLink.first().isVisible());

    await page.waitForTimeout(1000);
    let resolvedOrgId = String(orgId || "").trim();
    const cookieHeader = await getAuthCookieHeader(page, backendUrl);
    let orgIdFromApi = null;
    let orgLookupStatus = null;
    let orgCreateStatus = null;
    let usageStatus = null;
    let usagePayload = null;
    if (cookieHeader) {
      try {
        const usageRes = await fetch(`${backendUrl}/api/v1/auth/me/usage`, {
          headers: { Cookie: cookieHeader },
        });
        usageStatus = usageRes.status;
        if (usageRes.ok) {
          usagePayload = await usageRes.json();
        }

        const listRes = await fetch(`${backendUrl}/api/v1/organizations`, {
          headers: { Cookie: cookieHeader },
        });
        orgLookupStatus = listRes.status;
        if (listRes.ok) {
          const arr = await listRes.json();
          if (Array.isArray(arr) && arr.length > 0 && arr[0] && arr[0].id != null) {
            orgIdFromApi = String(arr[0].id);
          }
        }
        if (!orgIdFromApi) {
          const createRes = await fetch(`${backendUrl}/api/v1/organizations`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Cookie: cookieHeader,
            },
            body: JSON.stringify({
              name: `qa-billing-org-${Date.now()}`,
              description: "QA org for pricing/billing UI checks",
              plan_type: "free",
            }),
          });
          orgCreateStatus = createRes.status;
          if (createRes.ok) {
            const created = await createRes.json();
            if (created && created.id != null) {
              orgIdFromApi = String(created.id);
            }
          }
        }
      } catch {
        // leave fallback orgId
      }
    }
    if (orgIdFromApi) {
      resolvedOrgId = orgIdFromApi;
    }

    await page.goto(`${baseUrl}/organizations/${resolvedOrgId}/billing`, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    const currentUrl = page.url();
    let h1Text = "";
    let bodyTextSample = "";
    let screenshotPath = null;
    const h1 = page.locator("h1").first();
    if ((await h1.count()) > 0) {
      h1Text = (await h1.innerText()).trim();
    }
    if (!h1Text) {
      bodyTextSample = (
        (await page.locator("body").innerText().catch(() => "")) || ""
      )
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 240);
      fs.mkdirSync(path.join(process.cwd(), "scripts", "artifacts"), { recursive: true });
      screenshotPath = path.join(process.cwd(), "scripts", "artifacts", "g-billing-ui-failure.png");
      await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => null);
    }

    const bodyText = (await page.locator("body").innerText().catch(() => "")) || "";
    result.billing_h1_organization_usage = /Organization Usage/i.test(h1Text);
    result.billing_shows_infrastructure_licenses = /Infrastructure Licenses/i.test(bodyText);
    result.billing_account_managed_cta = /Manage in Account Billing/i.test(bodyText);
    result.details = {
      orgIdUsed: resolvedOrgId,
      tokenPresent: Boolean(cookieHeader),
      usageStatus,
      usagePayload,
      orgLookupStatus,
      orgCreateStatus,
      currentUrl,
      h1Text,
      bodyTextSample,
      screenshotPath,
    };
  } finally {
    await browser.close();
  }

  return result;
}

async function main() {
  const baseUrl = process.env.AGENTGUARD_FRONTEND_URL || "http://localhost:3000";
  const backendUrl = process.env.AGENTGUARD_BACKEND_URL || "http://localhost:8000";
  const email = process.env.AGENTGUARD_TEST_EMAIL || "round1_33c97ae2@example.com";
  const password = process.env.AGENTGUARD_TEST_PASSWORD || "TestPassword123!";
  const orgId = process.env.AGENTGUARD_ORG_ID || "11";

  const out = {
    ok: false,
    scenario: "G-1~G-4 pricing and billing ui",
    checks: {},
  };

  try {
    const loggedOut = await checkLoggedOutLanding(baseUrl);
    const loggedIn = await checkLoggedInLandingAndBilling(baseUrl, backendUrl, email, password, orgId);
    out.checks = { ...loggedOut, ...loggedIn };
    out.ok = Object.values(out.checks)
      .filter(v => typeof v === "boolean")
      .every(Boolean);
  } catch (error) {
    out.error = String(error);
  }

  console.log(JSON.stringify(out, null, 2));
  if (!out.ok) process.exit(1);
}

main();
