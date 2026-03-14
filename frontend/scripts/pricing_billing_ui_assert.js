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

async function checkLoggedOutLanding(baseUrl) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const result = {
    free_cta_to_signup_or_login: false,
    paid_cta_disabled: false,
    free_href: null,
    paid_disabled_count: 0,
  };

  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 45000 });
    const freeLink = page.locator('a[href*="/login?mode=signup"]').first();
    await freeLink.waitFor({ state: "visible", timeout: 10000 });
    const href = await freeLink.getAttribute("href");
    result.free_href = href;
    result.free_cta_to_signup_or_login = String(href || "").includes("/login?mode=signup");

    const paidButtons = page.getByRole("button", { name: /join waitlist|contact sales/i });
    const count = await paidButtons.count();
    let disabledCount = 0;
    for (let i = 0; i < count; i++) {
      if (await paidButtons.nth(i).isDisabled()) {
        disabledCount += 1;
      }
    }
    result.paid_disabled_count = disabledCount;
    result.paid_cta_disabled = count >= 2 && disabledCount >= 2;
  } finally {
    await browser.close();
  }

  return result;
}

async function checkLoggedInLandingAndBilling(baseUrl, backendUrl, email, password, orgId) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1800, height: 1100 } });
  const result = {
    free_cta_to_org_console: false,
    billing_free_plan_badge: false,
    billing_snapshots_ratio: false,
    billing_platform_credits_ratio: false,
    billing_free_current_plan: false,
    billing_paid_preview_only_disabled: false,
    details: {},
  };

  try {
    await login(page, baseUrl, email, password);

    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 45000 });
    const freeLink = page.locator('a[href="/organizations"]').first();
    await freeLink.waitFor({ state: "visible", timeout: 10000 });
    result.free_cta_to_org_console = true;

    await page.waitForTimeout(1000);
    let resolvedOrgId = String(orgId || "").trim();
    const token = await page.evaluate(() => localStorage.getItem("access_token"));
    let orgIdFromApi = null;
    let orgLookupStatus = null;
    let orgCreateStatus = null;
    let usageStatus = null;
    let usagePayload = null;
    if (token) {
      try {
        const usageRes = await fetch(`${backendUrl}/api/v1/auth/me/usage`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        usageStatus = usageRes.status;
        if (usageRes.ok) {
          usagePayload = await usageRes.json();
        }

        const listRes = await fetch(`${backendUrl}/api/v1/organizations`, {
          headers: { Authorization: `Bearer ${token}` },
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
              Authorization: `Bearer ${token}`,
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
    // SWR can populate usage after initial paint; allow a short polling window.
    for (let i = 0; i < 20; i++) {
      const hasSnapshotSection = await page.evaluate(() =>
        (document.body?.innerText || "").includes("Snapshots this month")
      );
      if (hasSnapshotSection) break;
      await page.waitForTimeout(500);
    }
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

    const freeBadge = page.getByText(/Free plan/i).first();
    result.billing_free_plan_badge = await freeBadge.isVisible();

    const snapshotsLine = page.getByText(/Snapshots this month/i).first();
    const snapshotsLineVisible = (await snapshotsLine.count()) > 0 && (await snapshotsLine.isVisible());
    const snapshotsRatioFound = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll("*"));
      const label = all.find(el => /Snapshots this month/i.test(el.textContent || ""));
      if (!label) return false;
      const scopeText =
        label.closest("div")?.parentElement?.textContent ||
        label.parentElement?.textContent ||
        label.textContent ||
        "";
      return /\d+\s*\/\s*\d+/.test(scopeText);
    });
    result.billing_snapshots_ratio = snapshotsLineVisible && snapshotsRatioFound;

    const creditsLine = page.getByText(/Platform replay credits this month/i).first();
    const creditsValue = page.getByText(/\d[\d,]*\s*\/\s*\d[\d,]*/).first();
    result.billing_platform_credits_ratio =
      (await creditsLine.isVisible()) && (await creditsValue.isVisible());

    const currentPlanBtn = page.getByRole("button", { name: /Current Plan/i }).first();
    result.billing_free_current_plan = await currentPlanBtn.isVisible();

    const previewButtons = page.getByRole("button", { name: /Preview Only/i });
    const previewCount = await previewButtons.count();
    let previewDisabled = 0;
    for (let i = 0; i < previewCount; i++) {
      if (await previewButtons.nth(i).isDisabled()) {
        previewDisabled += 1;
      }
    }
    result.billing_paid_preview_only_disabled = previewCount >= 2 && previewDisabled >= 2;
    result.details = {
      orgIdUsed: resolvedOrgId,
      tokenPresent: Boolean(token),
      usageStatus,
      usagePayload,
      orgLookupStatus,
      orgCreateStatus,
      currentUrl,
      h1Text,
      bodyTextSample,
      screenshotPath,
      snapshotsLineVisible,
      snapshotsRatioFound,
      previewCount,
      previewDisabled,
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
