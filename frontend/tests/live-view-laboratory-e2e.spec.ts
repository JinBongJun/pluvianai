/**
 * Live View + Laboratory refresh E2E (requires backend + credentials).
 *
 * Prereqs: PLAYWRIGHT_E2E_EMAIL, PLAYWRIGHT_E2E_PASSWORD, PLAYWRIGHT_API_URL (optional),
 * PLAYWRIGHT_BASE_URL (optional). CI: set these secrets; local: run backend + `npm run dev`.
 *
 * DoD (operational): repeat the same CI job N times or use `npx playwright test --repeat-each=20`
 * for soak; flake rate is tracked outside this file (see docs/adr/ADR-0001-release-gate-hydration-contract.md).
 *
 * Multi-agent: see "Live View multi-agent canvas" — seeds several agents via `Promise.all` and asserts
 * every `lv-node-*` is present before/after refresh (stress for concurrent snapshot ingestion + canvas).
 *
 * Node testids use `seedToolSnapshot().snapshotAgentId` (persisted agent id), not the seed request
 * `agentId`, because async/queued ingest may keep signature-based ids (`build_node_key`).
 * For multiple nodes, pass distinct `temperature` per seed — `build_node_key` ignores user message text.
 */
import { expect, request as playwrightRequest, test, type Page, type TestInfo } from "@playwright/test";

import {
  addSessionCookiesToBrowserContext,
  API_BASE_URL,
  ensureOrgAndProject,
  LOGIN_EMAIL,
  LOGIN_PASSWORD,
  loginToBackend,
  loginWithSessionCookies,
  requireCredentials,
  seedToolSnapshot,
} from "./helpers/playwright-session";

async function attachFailureDiagnostics(page: Page, testInfo: TestInfo) {
  const url = page.url();
  await testInfo.attach("failure-url.txt", { body: url, contentType: "text/plain" });
  try {
    const html = await page.content();
    await testInfo.attach("failure-dom.html", {
      body: html.slice(0, 120_000),
      contentType: "text/html",
    });
  } catch {
    // ignore
  }
}

/** One serial chain: parallel Playwright workers were each logging in and invalidating refresh tokens. */
const MULTI_AGENT_NODE_COUNT = 6;

test.describe("Live View E2E", () => {
  /** Serial: shared refresh-token semantics; 300s for slow remote snapshot ingest. */
  test.describe.configure({ mode: "serial", timeout: 300_000 });

  test.describe("Live View laboratory refresh & selection", () => {
  test("refresh keeps selected agent when still present; fit runs without errors", async ({
    page,
  }, testInfo) => {
    requireCredentials();

    const pageErrors: string[] = [];
    page.on("pageerror", err => {
      pageErrors.push(String(err?.message || err));
    });

    const api = await playwrightRequest.newContext({ baseURL: API_BASE_URL });
    const session = await loginToBackend(api);
    const token = session.accessToken;
    const { orgId, projectId } = await ensureOrgAndProject(api, token);
    const ts = Date.now();
    const agentA = `pw-lv-a-${ts}`;
    const agentB = `pw-lv-b-${ts}`;
    const seededA = await seedToolSnapshot(api, token, projectId, {
      agentId: agentA,
      promptPrefix: "PW-LV-A",
      temperature: 0.41,
    });
    const seededB = await seedToolSnapshot(api, token, projectId, {
      agentId: agentB,
      promptPrefix: "PW-LV-B",
      temperature: 0.42,
    });
    // Live View node id matches persisted snapshot agent_id (may differ from requested id when ingest is async / signature-based).
    const nodeIdA = seededA.snapshotAgentId;
    const nodeIdB = seededB.snapshotAgentId;
    expect(nodeIdA, "two seeds must map to two distinct Live View nodes (see build_node_key)").not.toBe(nodeIdB);

    await loginWithSessionCookies(page, session);
    const liveViewUrl = `/organizations/${orgId}/projects/${projectId}/live-view`;
    await page.goto(liveViewUrl, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Loading Live View")).toBeHidden({ timeout: 60_000 });

    const nodeA = page.getByTestId(`lv-node-${nodeIdA}`);
    const nodeB = page.getByTestId(`lv-node-${nodeIdB}`);
    await expect(nodeA).toBeVisible({ timeout: 45_000 });
    await expect(nodeB).toBeVisible({ timeout: 45_000 });

    await nodeA.click();
    await expect(page.locator("h2").filter({ hasText: nodeIdA })).toBeVisible({ timeout: 15_000 });
    await expect(nodeB).toHaveClass(/opacity-40/, { timeout: 15_000 });

    await page.getByTestId("laboratory-refresh-button").click();
    await expect(nodeA).toBeVisible({ timeout: 45_000 });
    await expect(nodeB).toBeVisible({ timeout: 45_000 });
    await expect(page.locator("h2").filter({ hasText: nodeIdA })).toBeVisible({ timeout: 20_000 });
    await expect(nodeB).toHaveClass(/opacity-40/, { timeout: 15_000 });

    if (pageErrors.length) {
      await testInfo.attach("pageerrors.txt", {
        body: pageErrors.join("\n"),
        contentType: "text/plain",
      });
      await attachFailureDiagnostics(page, testInfo);
    }
    expect(pageErrors, "unexpected page errors").toEqual([]);
  });

  test("session expiry redirects to login; can return to Live View after sign-in", async ({
    page,
  }, testInfo) => {
    requireCredentials();

    const pageErrors: string[] = [];
    page.on("pageerror", err => pageErrors.push(String(err?.message || err)));

    const api = await playwrightRequest.newContext({ baseURL: API_BASE_URL });
    const session = await loginToBackend(api);
    const token = session.accessToken;
    const { orgId, projectId } = await ensureOrgAndProject(api, token);
    const reauthSeed = await seedToolSnapshot(api, token, projectId, {
      agentId: `pw-lv-reauth-${Date.now()}`,
      promptPrefix: "PW-LV-REAUTH",
      temperature: 0.37,
    });
    const reauthNodeId = reauthSeed.snapshotAgentId;

    await loginWithSessionCookies(page, session);
    const liveViewUrl = `/organizations/${orgId}/projects/${projectId}/live-view`;
    await page.goto(liveViewUrl, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Loading Live View")).toBeHidden({ timeout: 60_000 });

    await page.context().clearCookies();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login/, { timeout: 45_000 });

    await page.locator("#email-address").fill(LOGIN_EMAIL!);
    await page.locator("#password").fill(LOGIN_PASSWORD!);
    const loginResponsePromise = page.waitForResponse(
      response =>
        response.url().includes("/api/v1/auth/login") &&
        response.request().method() === "POST" &&
        response.ok(),
      { timeout: 45_000 }
    );
    await page.getByRole("button", { name: "Sign in" }).first().click();
    const loginHttp = await loginResponsePromise;
    const loginJson = (await loginHttp.json()) as { access_token?: string; refresh_token?: string };
    expect(loginJson.access_token, "password login must return access_token").toBeTruthy();
    expect(loginJson.refresh_token, "password login must return refresh_token").toBeTruthy();
    // Remote API login does not set cookies on the Next.js origin; mirror tokens so Live View can load agents.
    await addSessionCookiesToBrowserContext(page, {
      accessToken: loginJson.access_token!,
      refreshToken: loginJson.refresh_token!,
    });
    // Always navigate after injecting cookies: the login page may have already redirected to live view
    // without these cookies (then back to /login), in which case nothing would leave /login again.
    await page.goto(liveViewUrl, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Loading Live View")).toBeHidden({ timeout: 60_000 });
    await page.getByTestId("laboratory-refresh-button").click();
    await expect(page.getByTestId(`lv-node-${reauthNodeId}`)).toBeVisible({ timeout: 60_000 });

    if (pageErrors.length) {
      await testInfo.attach("pageerrors-reauth.txt", {
        body: pageErrors.join("\n"),
        contentType: "text/plain",
      });
    }
    expect(pageErrors).toEqual([]);
  });

  test("auto-layout then drag does not drop selection (no ghost click)", async ({ page }, testInfo) => {
    requireCredentials();

    const pageErrors: string[] = [];
    page.on("pageerror", err => pageErrors.push(String(err?.message || err)));

    const api = await playwrightRequest.newContext({ baseURL: API_BASE_URL });
    const session = await loginToBackend(api);
    const token = session.accessToken;
    const { orgId, projectId } = await ensureOrgAndProject(api, token);
    const ts = Date.now();
    const agentA = `pw-lv-drag-${ts}`;
    const agentB = `pw-lv-drag2-${ts}`;
    const seededA = await seedToolSnapshot(api, token, projectId, {
      agentId: agentA,
      promptPrefix: "PW-LV-DRAG-A",
      temperature: 0.51,
    });
    await seedToolSnapshot(api, token, projectId, {
      agentId: agentB,
      promptPrefix: "PW-LV-DRAG-B",
      temperature: 0.52,
    });
    const nodeIdA = seededA.snapshotAgentId;

    await loginWithSessionCookies(page, session);
    const liveViewUrl = `/organizations/${orgId}/projects/${projectId}/live-view`;
    await page.goto(liveViewUrl, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Loading Live View")).toBeHidden({ timeout: 60_000 });

    const nodeA = page.getByTestId(`lv-node-${nodeIdA}`);
    await expect(nodeA).toBeVisible({ timeout: 45_000 });
    await nodeA.click();
    await expect(page.locator("h2").filter({ hasText: nodeIdA })).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("live-view-auto-layout-btn").click();
    await expect(page.locator("h2").filter({ hasText: nodeIdA })).toBeVisible({ timeout: 15_000 });

    const box = await nodeA.boundingBox();
    expect(box, "node A box").toBeTruthy();
    const startX = box!.x + box!.width / 2;
    const startY = box!.y + box!.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 40, startY + 20, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(220);

    await page.mouse.click(startX + 5, startY + 5);
    await expect(page.locator("h2").filter({ hasText: nodeIdA })).toBeVisible({ timeout: 10_000 });

    if (pageErrors.length) {
      await testInfo.attach("pageerrors-drag.txt", {
        body: pageErrors.join("\n"),
        contentType: "text/plain",
      });
      await attachFailureDiagnostics(page, testInfo);
    }
    expect(pageErrors).toEqual([]);
  });
  });

  test.describe("Live View multi-agent canvas", () => {
  test("parallel seed: all agent nodes visible; refresh keeps every node", async ({ page }, testInfo) => {
    requireCredentials();

    const pageErrors: string[] = [];
    page.on("pageerror", err => pageErrors.push(String(err?.message || err)));

    const api = await playwrightRequest.newContext({ baseURL: API_BASE_URL });
    const session = await loginToBackend(api);
    const token = session.accessToken;
    const { orgId, projectId } = await ensureOrgAndProject(api, token);
    const ts = Date.now();
    const agentIds = Array.from(
      { length: MULTI_AGENT_NODE_COUNT },
      (_, i) => `pw-lv-multi-${ts}-${i}`
    );

    const seeded = await Promise.all(
      agentIds.map((agentId, i) =>
        seedToolSnapshot(api, token, projectId, {
          agentId,
          promptPrefix: `PW-LV-MULTI-${i}`,
          traceId: `pw-tool-flow-multi-${ts}-${i}-${Math.random().toString(36).slice(2, 10)}`,
          temperature: 0.6 + i * 0.01,
        })
      )
    );
    const nodeIds = seeded.map(s => s.snapshotAgentId);

    await loginWithSessionCookies(page, session);
    const liveViewUrl = `/organizations/${orgId}/projects/${projectId}/live-view`;
    await page.goto(liveViewUrl, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Loading Live View")).toBeHidden({ timeout: 90_000 });

    for (const id of nodeIds) {
      await expect(page.getByTestId(`lv-node-${id}`)).toBeVisible({ timeout: 90_000 });
    }

    await page.getByTestId("laboratory-refresh-button").click();
    for (const id of nodeIds) {
      await expect(page.getByTestId(`lv-node-${id}`)).toBeVisible({ timeout: 90_000 });
    }

    if (pageErrors.length) {
      await testInfo.attach("pageerrors-multi.txt", {
        body: pageErrors.join("\n"),
        contentType: "text/plain",
      });
      await attachFailureDiagnostics(page, testInfo);
    }
    expect(pageErrors, "unexpected page errors").toEqual([]);
  });
  });
});
