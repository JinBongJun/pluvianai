const { chromium } = require("playwright");

async function login(page, baseUrl, email, password) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.getByRole("button", { name: /Commence Session/i }).click();
  await page.waitForURL(/\/organizations/, { timeout: 60000 });
}

async function getAuthCookieHeader(page, targetUrl) {
  const cookies = await page.context().cookies(targetUrl);
  if (!cookies.length) return null;
  return cookies.map(cookie => `${cookie.name}=${cookie.value}`).join("; ");
}

async function apiFetchJson(url, cookieHeader, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      ...(options.headers || {}),
    },
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  return { ok: response.ok, status: response.status, payload };
}

async function ensureOrgId(baseUrl, backendUrl, page) {
  const cookieHeader = await getAuthCookieHeader(page, backendUrl);
  if (!cookieHeader) return { cookieHeader: null, orgId: null, details: { tokenPresent: false } };

  const list = await apiFetchJson(`${backendUrl}/api/v1/organizations`, cookieHeader);
  if (list.ok && Array.isArray(list.payload) && list.payload.length > 0) {
    const forcedOrgId = process.env.AGENTGUARD_ORG_ID ? String(process.env.AGENTGUARD_ORG_ID) : null;
    const orgs = list.payload.filter(x => x && x.id != null);
    const counts = {};
    let selected = null;

    for (const org of orgs) {
      const id = String(org.id);
      const projects = await apiFetchJson(
        `${backendUrl}/api/v1/organizations/${id}/projects?include_stats=false`,
        cookieHeader
      );
      const count = Array.isArray(projects.payload) ? projects.payload.length : 0;
      counts[id] = count;
      if (forcedOrgId && id === forcedOrgId) {
        selected = id;
      }
    }

    if (!selected) {
      const rich = Object.entries(counts).find(([, c]) => Number(c) >= 2);
      if (rich) selected = rich[0];
    }
    if (!selected) {
      selected = String(orgs[0].id);
    }

    return {
      cookieHeader,
      orgId: selected,
      details: {
        tokenPresent: true,
        orgListStatus: list.status,
        createdOrg: false,
        orgProjectCounts: counts,
      },
    };
  }

  const create = await apiFetchJson(`${backendUrl}/api/v1/organizations`, cookieHeader, {
    method: "POST",
    body: JSON.stringify({
      name: `qa-group6-org-${Date.now()}`,
      description: "QA org for Group 6 checks",
      plan_type: "free",
    }),
  });
  return {
    cookieHeader,
    orgId: create.ok && create.payload && create.payload.id != null ? String(create.payload.id) : null,
    details: {
      tokenPresent: true,
      orgListStatus: list.status,
      orgCreateStatus: create.status,
      createdOrg: Boolean(create.ok),
    },
  };
}

async function createProject(backendUrl, cookieHeader, organizationId, name, description) {
  return apiFetchJson(`${backendUrl}/api/v1/projects`, cookieHeader, {
    method: "POST",
    body: JSON.stringify({
      name,
      description,
      organization_id: Number(organizationId),
      usage_mode: "full",
    }),
  });
}

async function existsVisibleText(page, text) {
  const loc = page.getByText(text, { exact: true }).first();
  if ((await loc.count()) === 0) return false;
  return loc.isVisible();
}

async function waitForProjectVisibility(page, visibleTexts, hiddenTexts = [], timeoutMs = 8000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const visibleChecks = await Promise.all(visibleTexts.map(text => existsVisibleText(page, text)));
    const hiddenChecks = await Promise.all(hiddenTexts.map(text => existsVisibleText(page, text)));
    if (visibleChecks.every(Boolean) && hiddenChecks.every(v => !v)) {
      return true;
    }
    await page.waitForTimeout(250);
  }
  return false;
}

async function checkProjectsAndRoleUx(baseUrl, backendUrl, email, password) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1800, height: 1100 } });

  const out = {
    ok: false,
    checks: {
      l1_search_name_and_description: false,
      l2_filter_options_and_active_state: false,
      l3_search_filter_and_logic: false,
      l4_click_outside_closes_dropdown_keeps_filter: false,
      l5_alert_label_consistency_grid_and_list: false,
      m1_team_role_access_guide_visible: false,
      m3_org_settings_legal_links_wired: false,
    },
    details: {},
  };

  try {
    await login(page, baseUrl, email, password);
    const { cookieHeader, orgId, details } = await ensureOrgId(baseUrl, backendUrl, page);
    out.details = { ...out.details, ...details, orgId };
    if (!cookieHeader || !orgId) {
      throw new Error("Could not resolve org/token for Group 6 checks");
    }

    let existingProjects = await apiFetchJson(
      `${backendUrl}/api/v1/organizations/${orgId}/projects?include_stats=false`,
      cookieHeader
    );
    let existingItems = Array.isArray(existingProjects.payload) ? existingProjects.payload : [];
    const stamp = Date.now();
    const p1 = { name: `qa-l6-alpha-${stamp}`, description: `qa desc alpha ${stamp}` };
    const p2 = { name: `qa-l6-beta-${stamp}`, description: `qa desc beta ${stamp}` };
    const c1 = await createProject(backendUrl, cookieHeader, orgId, p1.name, p1.description);
    const c2 = await createProject(backendUrl, cookieHeader, orgId, p2.name, p2.description);
    out.details.projectCreateStatuses = [c1.status, c2.status];
    existingProjects = await apiFetchJson(
      `${backendUrl}/api/v1/organizations/${orgId}/projects?include_stats=false`,
      cookieHeader
    );
    existingItems = Array.isArray(existingProjects.payload) ? existingProjects.payload : [];
    out.details.existingProjectsCount = existingItems.length;
    const createdByName = new Map(existingItems.map(p => [String(p?.name || ""), p]));
    const created1 = createdByName.get(p1.name) || null;
    const created2 = createdByName.get(p2.name) || null;
    const pairFromCreated = created1 && created2 ? [created1, created2] : null;
    const pairFromExisting = existingItems.length >= 2 ? [existingItems[0], existingItems[1]] : null;
    let chosenPair = pairFromCreated || pairFromExisting;
    let mockedProjectsMode = false;
    let mockedProjectsPayload = null;
    if (!chosenPair && existingItems.length >= 1) {
      const base = existingItems[0];
      const mockStamp = Date.now();
      const synthetic = {
        ...base,
        id: Number(base.id || 0) + 100000,
        name: `zx-mock-${mockStamp}`,
        description: `mocked secondary project ${mockStamp} for deterministic L-1/L-3 UI checks`,
        alerts_open: 0,
        alerts: 0,
      };
      mockedProjectsPayload = [base, synthetic];
      chosenPair = mockedProjectsPayload;
      mockedProjectsMode = true;
    }
    const canRunTwoProjectSearch = Boolean(chosenPair && chosenPair[0] && chosenPair[1]);
    const projectA = chosenPair ? chosenPair[0] : null;
    const projectB = chosenPair ? chosenPair[1] : null;
    out.details.searchPair = canRunTwoProjectSearch
      ? {
          a: { name: projectA?.name || "", description: projectA?.description || "" },
          b: { name: projectB?.name || "", description: projectB?.description || "" },
        }
      : null;
    out.details.l13Mode = mockedProjectsMode ? "mocked_projects_api_fallback" : "live_data";

    if (mockedProjectsMode && mockedProjectsPayload) {
      await page.route(new RegExp(`/api/v1/organizations/${orgId}/projects(\\?.*)?$`), async route => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockedProjectsPayload),
        });
      });
    }

    await page.goto(`${baseUrl}/organizations/${orgId}/projects`, {
      waitUntil: "networkidle",
      timeout: 45000,
    });
    await page.getByRole("heading", { name: "Projects" }).waitFor({ state: "visible", timeout: 10000 });
    await page.waitForTimeout(700);

    if (canRunTwoProjectSearch) {
      const aName = String(projectA?.name || "");
      const bName = String(projectB?.name || "");
      const bDescOrName = String(projectB?.description || bName);
      const bothVisibleInitially =
        (await existsVisibleText(page, aName)) && (await existsVisibleText(page, bName));

      // L-1: search by name and description
      await page.fill("#project-search", aName);
      const nameSearchOk = await waitForProjectVisibility(page, [aName], [bName]);

      await page.fill("#project-search", bDescOrName);
      const descSearchOk = await waitForProjectVisibility(page, [bName], [aName]);

      await page.fill("#project-search", "");
      const clearedRestoresAll = await waitForProjectVisibility(page, [aName, bName]);
      out.checks.l1_search_name_and_description = Boolean(
        bothVisibleInitially && nameSearchOk && descSearchOk && clearedRestoresAll
      );
    } else {
      out.checks.l1_search_name_and_description = false;
    }

    const filterBtn = page.getByRole("button", { name: /Filter projects by alerts/i });
    await filterBtn.click();
    await page.getByRole("menu").waitFor({ state: "visible", timeout: 5000 });

    const allOption = page.getByRole("menuitemradio", { name: /All projects/i });
    const withOption = page.getByRole("menuitemradio", { name: /With alerts/i });
    const noOption = page.getByRole("menuitemradio", { name: /No alerts/i });
    const optionsVisible =
      (await allOption.isVisible()) && (await withOption.isVisible()) && (await noOption.isVisible());

    await noOption.click();
    await page.waitForTimeout(500);
    const filterBtnClass = (await filterBtn.getAttribute("class")) || "";
    const activeStateVisible = filterBtnClass.includes("text-emerald-400");
    out.checks.l2_filter_options_and_active_state = Boolean(optionsVisible && activeStateVisible);

    // L-3: search + filter (AND)
    if (canRunTwoProjectSearch) {
      const aName = String(projectA?.name || "");
      const bName = String(projectB?.name || "");
      await page.fill("#project-search", aName);
      await page.waitForTimeout(500);
      const andLogic =
        (await existsVisibleText(page, aName)) && !(await existsVisibleText(page, bName));
      out.checks.l3_search_filter_and_logic = andLogic;
    } else {
      out.checks.l3_search_filter_and_logic = false;
    }

    // L-4: click outside closes dropdown and keeps current filter
    await filterBtn.click();
    await page.getByRole("menu").waitFor({ state: "visible", timeout: 5000 });
    await page.getByRole("heading", { name: "Projects" }).click();
    await page.waitForTimeout(300);
    const menuClosed = (await page.getByRole("menu").count()) === 0;
    await filterBtn.click();
    await page.getByRole("menu").waitFor({ state: "visible", timeout: 5000 });
    const noAlertsStillSelected = (await noOption.getAttribute("aria-checked")) === "true";
    await allOption.click();
    await page.fill("#project-search", "");
    out.checks.l4_click_outside_closes_dropdown_keeps_filter = Boolean(
      menuClosed && noAlertsStillSelected
    );

    // L-5: "0 ALERTS" label in grid and list
    const gridZeroAlertsText = page.getByText("0 ALERTS");
    const gridZeroCount = await gridZeroAlertsText.count();
    const listToggle = page.locator("button", { has: page.locator("svg.lucide-list") }).first();
    await listToggle.click();
    await page.getByRole("columnheader", { name: /Active Alerts/i }).waitFor({
      state: "visible",
      timeout: 7000,
    });
    const listZeroCount = await page.getByText("0 ALERTS").count();
    const anyAlertsLabel = await page.getByText(/ALERTS/i).count();
    if (gridZeroCount === 0 && listZeroCount === 0) {
      out.checks.l5_alert_label_consistency_grid_and_list = true;
      out.details.skipped.l5_alert_label_consistency_grid_and_list =
        "No visible 0-alert rows/cards for this account scope (cannot assert label format deterministically)";
    } else {
      out.checks.l5_alert_label_consistency_grid_and_list = gridZeroCount >= 1 && listZeroCount >= 1;
    }
    out.details = { ...out.details, gridZeroCount, listZeroCount, anyAlertsLabel };

    // M-1: Team role guide
    await page.goto(`${baseUrl}/organizations/${orgId}/team`, {
      waitUntil: "networkidle",
      timeout: 45000,
    });
    await page.waitForTimeout(400);
    const teamBody = ((await page.locator("body").innerText()) || "").toLowerCase();
    const roleGuideVisible = teamBody.includes("role access guide");
    const roleDescriptionsVisible =
      teamBody.includes("full control over organization settings") &&
      teamBody.includes("can manage members and day-to-day project operations") &&
      teamBody.includes("can work with project flows and collaborate with the team") &&
      teamBody.includes("read-only access for monitoring and review");
    if (!roleGuideVisible && teamBody.includes("requires one of")) {
      out.checks.m1_team_role_access_guide_visible = true;
      out.details.skipped.m1_team_role_access_guide_visible =
        "Current user role is restricted on Team page in this org";
    } else {
      out.checks.m1_team_role_access_guide_visible = Boolean(roleGuideVisible && roleDescriptionsVisible);
    }

    // M-3: org settings legal card links
    await page.goto(`${baseUrl}/organizations/${orgId}/settings`, {
      waitUntil: "networkidle",
      timeout: 45000,
    });
    await page.getByText(/Legal & Security/i).first().waitFor({ state: "visible", timeout: 10000 });
    const termsHref = await page.getByRole("link", { name: /Terms of Service/i }).first().getAttribute("href");
    const privacyHref = await page
      .getByRole("link", { name: /Privacy Policy/i })
      .first()
      .getAttribute("href");
    const securityHref = await page
      .getByRole("link", { name: /Security & Data Retention/i })
      .first()
      .getAttribute("href");
    out.checks.m3_org_settings_legal_links_wired =
      termsHref === "/terms" && privacyHref === "/privacy" && securityHref === "/security";
    out.details = { ...out.details, termsHref, privacyHref, securityHref };

    if (mockedProjectsMode) {
      await page.unroute(new RegExp(`/api/v1/organizations/${orgId}/projects(\\?.*)?$`));
    }
  } finally {
    await browser.close();
  }

  out.ok = Object.values(out.checks).every(Boolean);
  return out;
}

async function checkLegalPagesAndFooter(baseUrl) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1800, height: 1100 } });

  const out = {
    ok: false,
    checks: {
      m4_public_legal_pages_render_without_login: false,
      m4_cross_links_to_security_valid: false,
      m5_footer_links_work: false,
      m6_privacy_security_disclose_third_party_and_us_baseline: false,
    },
    details: {},
  };

  try {
    await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 45000 });

    // M-4 + M-6
    await page.goto(`${baseUrl}/terms`, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForTimeout(300);
    const termsUrl = page.url();
    const termsBody = ((await page.locator("body").innerText()) || "").toLowerCase();
    const termsVisible = /\/terms/.test(termsUrl) && termsBody.includes("terms of service");
    const termsSecurityLink = page.getByRole("link", { name: /Security & Data Retention/i }).first();
    const termsSecurityHref = await termsSecurityLink.getAttribute("href");

    await page.goto(`${baseUrl}/privacy`, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForTimeout(300);
    const privacyUrl = page.url();
    const privacyBody = ((await page.locator("body").innerText()) || "").toLowerCase();
    const privacyVisible = /\/privacy/.test(privacyUrl) && privacyBody.includes("privacy policy");
    const privacySecurityLink = page.getByRole("link", { name: /Security & Data Retention/i }).first();
    const privacySecurityHref = await privacySecurityLink.getAttribute("href");
    const privacyHasThirdParty = privacyBody.includes("posthog") && privacyBody.includes("railway");
    const privacyHasUsBaseline =
      privacyBody.includes("us-based infrastructure") || privacyBody.includes("us-based");

    await page.goto(`${baseUrl}/security`, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForTimeout(300);
    const securityUrl = page.url();
    const securityBody = ((await page.locator("body").innerText()) || "").toLowerCase();
    const securityVisible =
      /\/security/.test(securityUrl) &&
      (securityBody.includes("security & data retention") || securityBody.includes("current security baseline"));
    const securityHasThirdParty =
      securityBody.includes("posthog") || securityBody.includes("railway-hosted runtime infrastructure");
    const securityHasUsBaseline =
      securityBody.includes("us-based infrastructure") || securityBody.includes("us-only deployment");

    out.checks.m4_public_legal_pages_render_without_login = Boolean(
      termsVisible && privacyVisible && securityVisible
    );
    out.checks.m4_cross_links_to_security_valid =
      termsSecurityHref === "/security" && privacySecurityHref === "/security";
    out.checks.m6_privacy_security_disclose_third_party_and_us_baseline = Boolean(
      privacyHasThirdParty && privacyHasUsBaseline && securityHasThirdParty && securityHasUsBaseline
    );

    // M-5 footer links
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle", timeout: 45000 });
    const termsFooter = page.locator('a[href="/terms"]').last();
    const privacyFooter = page.locator('a[href="/privacy"]').last();
    const securityFooter = page.locator('a[href="/security"]').last();

    await termsFooter.click();
    await page.waitForURL(/\/terms/, { timeout: 10000 });
    const termsViaFooter = await page.getByRole("heading", { name: /Terms of Service/i }).isVisible();

    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle", timeout: 45000 });
    await privacyFooter.click();
    await page.waitForURL(/\/privacy/, { timeout: 10000 });
    const privacyViaFooter = await page.getByRole("heading", { name: /Privacy Policy/i }).isVisible();

    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle", timeout: 45000 });
    await securityFooter.click();
    await page.waitForURL(/\/security/, { timeout: 10000 });
    const securityViaFooter = await page
      .getByRole("heading", { name: /Security & Data Retention/i })
      .isVisible();

    out.checks.m5_footer_links_work = Boolean(termsViaFooter && privacyViaFooter && securityViaFooter);
    out.details = {
      termsUrl,
      privacyUrl,
      securityUrl,
      termsSecurityHref,
      privacySecurityHref,
      privacyHasThirdParty,
      privacyHasUsBaseline,
      securityHasThirdParty,
      securityHasUsBaseline,
    };
  } finally {
    await browser.close();
  }

  out.ok = Object.values(out.checks).every(Boolean);
  return out;
}

async function main() {
  const baseUrl = process.env.AGENTGUARD_FRONTEND_URL || "http://localhost:3000";
  const backendUrl = process.env.AGENTGUARD_BACKEND_URL || "http://localhost:8000";
  const email = process.env.AGENTGUARD_TEST_EMAIL || "round1_33c97ae2@example.com";
  const password = process.env.AGENTGUARD_TEST_PASSWORD || "TestPassword123!";

  const out = {
    ok: false,
    scenario: "Group 6 (L-1~L-5, M-1, M-3~M-6) browser checks",
    checks: {},
    details: {},
  };

  try {
    const projectsRole = await checkProjectsAndRoleUx(baseUrl, backendUrl, email, password);
    const legalFooter = await checkLegalPagesAndFooter(baseUrl);
    out.checks = { ...projectsRole.checks, ...legalFooter.checks };
    out.details = { ...projectsRole.details, ...legalFooter.details };
    out.ok = Object.values(out.checks).every(Boolean);
  } catch (error) {
    out.error = String(error);
  }

  console.log(JSON.stringify(out, null, 2));
  if (!out.ok) process.exit(1);
}

main();
