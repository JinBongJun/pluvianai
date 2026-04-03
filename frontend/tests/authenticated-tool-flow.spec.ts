import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type APIResponse,
  type Locator,
  type Page,
} from "@playwright/test";

const API_BASE_URL = process.env.PLAYWRIGHT_API_URL || "http://127.0.0.1:8000";
const PLAYWRIGHT_BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
const LOGIN_EMAIL = process.env.PLAYWRIGHT_E2E_EMAIL;
const LOGIN_PASSWORD = process.env.PLAYWRIGHT_E2E_PASSWORD;
const RUN_ONLY_API_KEY = process.env.PLAYWRIGHT_RUN_ONLY_API_KEY || process.env.OPENAI_API_KEY;
const E2E_PROJECT_NAME = "Cursor Tool E2E";

type SeedContext = {
  orgId: number;
  projectId: number;
  snapshotId: number;
  snapshotAgentId: string;
  traceId: string;
  promptText: string;
  snapshotDisplayTime: string;
};

type SeedSnapshotOptions = {
  agentId?: string;
  promptPrefix?: string;
};

async function waitForSnapshotMeta(
  api: APIRequestContext,
  token: string,
  projectId: number,
  traceId: string
): Promise<{ snapshotId: number; agentId: string }> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const listResponse = await authedJson(
      api,
      "GET",
      `/api/v1/projects/${projectId}/snapshots?light=true&limit=50`,
      token
    );
    if (listResponse.ok()) {
      const data = await listResponse.json();
      const items = Array.isArray(data?.items) ? data.items : [];
      const match = items.find(
        (item: { trace_id?: string }) => String(item.trace_id || "") === traceId
      );
      if (match?.id) {
        return { snapshotId: Number(match.id), agentId: String(match.agent_id || "") };
      }
    }
    await new Promise(resolve => setTimeout(resolve, attempt < 4 ? 500 : 1000));
  }
  throw new Error(`Snapshot was not created for trace ${traceId}`);
}

async function waitForTrajectoryDetail(
  api: APIRequestContext,
  token: string,
  projectId: number,
  snapshotId: number
): Promise<{ agentId: string; provenance: string }> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const detailResponse = await authedJson(
      api,
      "GET",
      `/api/v1/projects/${projectId}/snapshots/${snapshotId}`,
      token
    );
    if (detailResponse.ok()) {
      const detail = await detailResponse.json();
      const provenance = Array.isArray(detail.tool_timeline)
        ? Array.from(
            new Set(
              detail.tool_timeline.map((row: { provenance?: string }) => row.provenance || "")
            )
          ).join(",")
        : "";
      const agentId = String(detail.agent_id || "");
      if (agentId && provenance.includes("trajectory")) {
        return { agentId, provenance };
      }
    }
    await new Promise(resolve => setTimeout(resolve, attempt < 4 ? 500 : 1000));
  }
  throw new Error(`Trajectory-backed detail was not ready for snapshot ${snapshotId}`);
}

function formatPrettyTime(value?: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.toLocaleDateString("en-US")} ${date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  })}`;
}

function requireCredentials() {
  test.skip(
    !LOGIN_EMAIL || !LOGIN_PASSWORD,
    "PLAYWRIGHT_E2E_EMAIL and PLAYWRIGHT_E2E_PASSWORD are required."
  );
}

function requireRunOnlyApiKey() {
  test.skip(!RUN_ONLY_API_KEY, "PLAYWRIGHT_RUN_ONLY_API_KEY or OPENAI_API_KEY is required.");
}

async function sleep(ms: number) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function responseTextSafe(response: { text(): Promise<string> }) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

async function expectOkWithRetry(
  label: string,
  action: () => Promise<APIResponse>,
  attempts = 4
): Promise<APIResponse> {
  let lastError = `${label} failed`;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await action();
    if (response.ok()) return response;

    const body = await responseTextSafe(response);
    lastError = `${label} failed (${response.status()}): ${body.slice(0, 400)}`;
    if (attempt < attempts - 1) {
      await sleep(750 * (attempt + 1));
    }
  }
  throw new Error(lastError);
}

async function loginToBackend(
  api: APIRequestContext
): Promise<{ accessToken: string; refreshToken: string }> {
  const response = await expectOkWithRetry(
    "login",
    () =>
      api.post("/api/v1/auth/login", {
        form: {
          username: LOGIN_EMAIL!,
          password: LOGIN_PASSWORD!,
        },
      }),
    5
  );
  const data = await response.json();
  expect(typeof data.access_token).toBe("string");
  expect(typeof data.refresh_token).toBe("string");
  return {
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string,
  };
}

async function authedJson(
  api: APIRequestContext,
  method: "GET" | "POST" | "DELETE",
  path: string,
  token: string,
  data?: unknown
) {
  const headers = { Authorization: `Bearer ${token}` };
  const response =
    method === "GET"
      ? await api.get(path, { headers })
      : method === "POST"
        ? await api.post(path, { headers, data })
        : await api.delete(path, { headers });
  return response;
}

async function ensureOrgAndProject(
  api: APIRequestContext,
  token: string
): Promise<{ orgId: number; projectId: number }> {
  const orgsResponse = await expectOkWithRetry(
    "list organizations",
    () => authedJson(api, "GET", "/api/v1/organizations?include_stats=false", token),
    4
  );
  const orgs = (await orgsResponse.json()) as Array<{ id: number; name?: string }>;

  let orgId = Number(orgs?.[0]?.id || 0);
  if (!orgId) {
    const createOrgResponse = await expectOkWithRetry(
      "create organization",
      () =>
        authedJson(api, "POST", "/api/v1/organizations", token, {
          name: "Cursor E2E Org",
          description: "Organization for authenticated browser tool flow tests.",
          plan_type: "free",
        }),
      4
    );
    const org = await createOrgResponse.json();
    orgId = Number(org.id);
  }

  const projectsResponse = await expectOkWithRetry(
    "list projects",
    () =>
      authedJson(api, "GET", `/api/v1/organizations/${orgId}/projects?include_stats=false`, token),
    4
  );
  const projects = (await projectsResponse.json()) as Array<{ id: number; name?: string }>;

  let projectId =
    Number(
      projects.find(project => String(project.name || "").trim() === E2E_PROJECT_NAME)?.id || 0
    ) || Number(projects?.[0]?.id || 0);

  if (!projectId) {
    const createProjectResponse = await expectOkWithRetry(
      "create project",
      () =>
        authedJson(api, "POST", "/api/v1/projects", token, {
          name: E2E_PROJECT_NAME,
          description: "Project for authenticated tool flow browser tests.",
          organization_id: orgId,
          usage_mode: "full",
        }),
      4
    );
    const project = await createProjectResponse.json();
    projectId = Number(project.id);
  }

  return { orgId, projectId };
}

async function seedToolSnapshot(
  api: APIRequestContext,
  token: string,
  projectId: number,
  options: SeedSnapshotOptions = {}
): Promise<SeedContext> {
  const traceId = `pw-tool-flow-${Date.now()}`;
  const promptText = `${options.promptPrefix || "PWTOOL-E2E"}-${Date.now()}`;

  const createSnapshotResponse = await expectOkWithRetry(
    "create snapshot",
    () =>
      authedJson(api, "POST", `/api/v1/projects/${projectId}/snapshots`, token, {
        trace_id: traceId,
        ...(options.agentId ? { agent_id: options.agentId } : {}),
        provider: "openai",
        model: "gpt-4o-mini",
        status_code: 200,
        payload: {
          messages: [{ role: "user", content: promptText }],
          response: {
            id: `resp-${traceId}`,
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "Checking tool output.",
                  tool_calls: [
                    {
                      id: "call_weather_1",
                      function: {
                        name: "get_weather",
                        arguments: { city: "Seoul" },
                      },
                    },
                  ],
                },
              },
            ],
          },
          tool_events: [
            {
              kind: "tool_call",
              name: "get_weather",
              call_id: "call_weather_1",
              input: { city: "Seoul" },
            },
            {
              kind: "tool_result",
              name: "get_weather",
              call_id: "call_weather_1",
              output: { temp_c: 22, condition: "sunny" },
              status: "ok",
            },
            {
              kind: "action",
              name: "send_slack",
              output: { ok: true, channel: "#ops" },
              status: "ok",
            },
          ],
        },
      }),
    4
  );

  const snapshotMeta = await waitForSnapshotMeta(api, token, projectId, traceId);
  const snapshotId = snapshotMeta.snapshotId;

  await expectOkWithRetry(
    "validate snapshot behavior",
    () =>
      authedJson(api, "POST", `/api/v1/projects/${projectId}/behavior/validate`, token, {
        trace_id: traceId,
      }),
    4
  );

  await waitForTrajectoryDetail(api, token, projectId, snapshotId);

  const finalDetailResponse = await authedJson(
    api,
    "GET",
    `/api/v1/projects/${projectId}/snapshots/${snapshotId}`,
    token
  );
  const finalDetail = await finalDetailResponse.json();

  return {
    orgId: 0,
    projectId,
    snapshotId,
    snapshotAgentId: String(finalDetail.agent_id || options.agentId || ""),
    traceId,
    promptText,
    snapshotDisplayTime: formatPrettyTime(finalDetail.created_at),
  };
}

async function createDataset(
  api: APIRequestContext,
  token: string,
  projectId: number,
  options: { snapshotIds: number[]; agentId: string; label: string }
): Promise<{ id: string; label?: string | null }> {
  const response = await expectOkWithRetry(
    "create dataset",
    () =>
      authedJson(api, "POST", `/api/v1/projects/${projectId}/behavior/datasets`, token, {
        snapshot_ids: options.snapshotIds,
        agent_id: options.agentId,
        label: options.label,
      }),
    4
  );
  return (await response.json()) as { id: string; label?: string | null };
}

async function loginWithSessionCookies(
  page: Page,
  session: { accessToken: string; refreshToken: string }
) {
  const csrfToken = `pw-csrf-${Date.now()}`;
  const buildCookiesForUrl = (url: string) => [
    {
      name: "access_token",
      value: session.accessToken,
      url,
      httpOnly: true,
      sameSite: "Lax" as const,
    },
    {
      name: "refresh_token",
      value: session.refreshToken,
      url,
      httpOnly: true,
      sameSite: "Lax" as const,
    },
    {
      name: "csrf_token",
      value: csrfToken,
      url,
      httpOnly: false,
      sameSite: "Lax" as const,
    },
  ];
  const cookieUrls = Array.from(
    new Set(
      [PLAYWRIGHT_BASE_URL, "http://localhost:3000", "http://localhost:8000", API_BASE_URL].map(
        value => {
          try {
            return `${new URL(value).origin}/`;
          } catch {
            return value;
          }
        }
      )
    )
  );
  await page.context().addCookies(cookieUrls.flatMap(buildCookiesForUrl));
  await page.goto("/organizations", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/organizations/, { timeout: 20000 });
}

async function ensurePanelOpen(toggle: Locator, content: Locator) {
  if (!(await content.isVisible().catch(() => false))) {
    await toggle.click();
  }
  await expect(content).toBeVisible();
}

async function openReleaseGateSettings(page: Page) {
  await page.locator('button[title="Open settings"]').first().click();
  await expect(page.getByRole("heading", { name: "Release Gate configuration" })).toBeVisible({
    timeout: 15000,
  });
}

async function closeSelectedReleaseGatePanels(page: Page) {
  await page.getByTitle("Close").first().click();
  await expect(page.getByTestId("rg-selected-agent-surface")).toBeHidden({ timeout: 15000 });
}

async function reopenReleaseGateNode(page: Page, agentId: string) {
  await page.getByTestId(`rg-node-${agentId}`).click();
  await expect(page.getByTestId("rg-selected-agent-surface")).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("heading", { name: "Run output" })).toBeVisible({ timeout: 15000 });
}

async function openReleaseGateFromSnapshot(
  page: Page,
  options: { orgId: number; projectId: number; agentId: string; snapshotId: number }
) {
  await page.goto(
    `/organizations/${options.orgId}/projects/${options.projectId}/release-gate?agent_id=${encodeURIComponent(
      options.agentId
    )}`,
    { waitUntil: "domcontentloaded" }
  );

  const releaseGateRow = page.locator(`[data-testid="rg-live-log-row-${options.snapshotId}"]`);
  await expect(releaseGateRow).toBeVisible({ timeout: 45000 });
  await releaseGateRow.click();
}

test.describe("Authenticated tool browser flow", () => {
  test.describe.configure({ mode: "serial" });

  test("login, open seeded snapshot in Live View and Release Gate", async ({ page }) => {
    test.setTimeout(300000);
    requireCredentials();

    const api = await playwrightRequest.newContext({ baseURL: API_BASE_URL });
    const session = await loginToBackend(api);
    const token = session.accessToken;
    const { orgId, projectId } = await ensureOrgAndProject(api, token);
    const seeded = await seedToolSnapshot(api, token, projectId);
    seeded.orgId = orgId;

    await loginWithSessionCookies(page, session);

    await page.goto(`/organizations/${orgId}/projects/${projectId}/live-view`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByText("Loading Live View")).toBeHidden({ timeout: 45000 });

    const nodeLabel = seeded.snapshotAgentId.slice(0, 12);
    await expect(page.getByText(nodeLabel, { exact: false }).first()).toBeVisible({
      timeout: 30000,
    });
    await page.getByText(nodeLabel, { exact: false }).first().click();

    await expect(page.getByText("Live Logs")).toBeVisible({ timeout: 15000 });
    const seededLiveViewRow = page.getByText("Tool: get_weather").first();
    await expect(seededLiveViewRow).toBeVisible({ timeout: 30000 });
    await seededLiveViewRow.click();

    await expect(page.getByText("Snapshot Details")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Tool timeline (calls & I/O)")).toBeVisible();
    await expect(page.getByText("Actions (side effects)")).toBeVisible();
    await expect(page.getByText("Trajectory").first()).toBeVisible();
    await expect(page.getByText("get_weather").first()).toBeVisible();

    await page.goto(
      `/organizations/${orgId}/projects/${projectId}/release-gate?agent_id=${encodeURIComponent(
        seeded.snapshotAgentId
      )}`,
      { waitUntil: "domcontentloaded" }
    );

    const releaseGateRow = page.locator(`[data-testid="rg-live-log-row-${seeded.snapshotId}"]`);
    await expect(releaseGateRow).toBeVisible({ timeout: 45000 });
    await releaseGateRow.click();

    await expect(page.getByText("Snapshot Details")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Tool timeline (calls & I/O)")).toBeVisible();
    await expect(page.getByText("Actions (side effects)")).toBeVisible();
    await expect(page.getByText("Trajectory").first()).toBeVisible();
    await expect(page.getByText("send_slack").first()).toBeVisible();
    await expect(page.getByText('"temp_c": 22')).toBeVisible();
  });

  test("release gate dataset multi-select resolves per-log rows from all selected datasets", async ({
    page,
  }) => {
    test.setTimeout(300000);
    requireCredentials();

    const api = await playwrightRequest.newContext({ baseURL: API_BASE_URL });
    const session = await loginToBackend(api);
    const token = session.accessToken;
    const { orgId, projectId } = await ensureOrgAndProject(api, token);
    const sharedAgentId = `pw-rg-multi-${Date.now()}`;
    const seededA = await seedToolSnapshot(api, token, projectId, {
      agentId: sharedAgentId,
      promptPrefix: "PW-RG-DATASET-A",
    });
    const seededB = await seedToolSnapshot(api, token, projectId, {
      agentId: sharedAgentId,
      promptPrefix: "PW-RG-DATASET-B",
    });
    const datasetALabel = `PW RG Dataset A ${Date.now()}`;
    const datasetBLabel = `PW RG Dataset B ${Date.now()}`;
    await createDataset(api, token, projectId, {
      snapshotIds: [seededA.snapshotId],
      agentId: sharedAgentId,
      label: datasetALabel,
    });
    await createDataset(api, token, projectId, {
      snapshotIds: [seededB.snapshotId],
      agentId: sharedAgentId,
      label: datasetBLabel,
    });

    await loginWithSessionCookies(page, session);
    await page.goto(
      `/organizations/${orgId}/projects/${projectId}/release-gate?agent_id=${encodeURIComponent(sharedAgentId)}`,
      { waitUntil: "domcontentloaded" }
    );

    await page.getByRole("tab", { name: "Saved Data" }).click();
    await expect(page.getByTestId("rg-datasets-state-list")).toBeVisible({ timeout: 45000 });

    const datasetACard = page
      .locator("div")
      .filter({ has: page.getByText(datasetALabel, { exact: false }) });
    const datasetBCard = page
      .locator("div")
      .filter({ has: page.getByText(datasetBLabel, { exact: false }) });
    await datasetACard.locator('input[type="checkbox"]').first().check();
    await datasetBCard.locator('input[type="checkbox"]').first().check();

    await openReleaseGateSettings(page);
    await expect(page.getByText(/Previewing baseline for log #/)).toBeVisible();

    await page.getByRole("tab", { name: "Environment parity" }).click();
    await page.getByRole("button", { name: "Extra request fields" }).click();
    await expect(page.getByText(`Log id ${seededA.snapshotId}`)).toBeVisible();
    await expect(page.getByText(`Log id ${seededB.snapshotId}`)).toBeVisible();
  });

  test("release gate settings cover detected hosted custom and preview flows", async ({ page }) => {
    test.setTimeout(300000);
    requireCredentials();

    const api = await playwrightRequest.newContext({ baseURL: API_BASE_URL });
    const session = await loginToBackend(api);
    const token = session.accessToken;
    const { orgId, projectId } = await ensureOrgAndProject(api, token);
    const seeded = await seedToolSnapshot(api, token, projectId);
    const savedKeyName = `[RG] PW Saved Key ${Date.now()}`;

    const savedKeyResponse = await authedJson(
      api,
      "POST",
      `/api/v1/projects/${projectId}/user-api-keys`,
      token,
      {
        provider: "openai",
        api_key: "sk-test-release-gate-ui",
        name: savedKeyName,
      }
    );
    expect(savedKeyResponse.ok()).toBeTruthy();
    const savedKey = (await savedKeyResponse.json()) as { data?: { id?: number }; id?: number };
    const savedKeyId = Number(savedKey?.data?.id || savedKey?.id || 0);
    expect(savedKeyId).toBeGreaterThan(0);

    await loginWithSessionCookies(page, session);
    await openReleaseGateFromSnapshot(page, {
      orgId,
      projectId,
      agentId: seeded.snapshotAgentId,
      snapshotId: seeded.snapshotId,
    });
    await openReleaseGateSettings(page);

    await expect(page.getByText("Detected provider")).toBeVisible();
    await expect(page.getByText("Detected model id")).toBeVisible();
    await expect(page.getByText("API key status")).toBeVisible();

    await page.getByLabel("Hosted by PluvianAI").check();
    await expect(page.getByText("Hosted quick picks")).toBeVisible();
    await expect(page.getByText("Hosted model is active for this run")).toBeVisible();

    await page.getByLabel("Custom (BYOK)").check();
    await expect(page.getByText("Custom model ID")).toBeVisible();
    await expect(page.getByText("API key (for this run only)")).toBeVisible();
    await expect(page.getByText("Save key for Release Gate (optional)")).toBeVisible();

    await page.locator('input[name="release-gate-custom-model-id"]').fill("gpt-4o-mini");
    await page.locator('input[type="password"]').fill("sk-test-run-only");
    await expect(page.getByRole("button", { name: "Save pasted key to project" })).toBeEnabled();
    await expect(
      page.getByText(savedKeyName.replace(/^\[RG\]\s*/, ""), { exact: false })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Use for run" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete" })).toBeVisible();

    await page.getByRole("tab", { name: "Preview" }).click();
    await expect(page.getByText("Final override payload")).toBeVisible();
    await expect(page.getByText("Using model")).toBeVisible();
    await expect(page.getByText("Using provider")).toBeVisible();
    await expect(page.getByText("gpt-4o-mini", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Expand full JSON" }).click();
    await expect(page.getByText("Final candidate payload (full)")).toBeVisible();
    await expect(page.getByText('"model": "gpt-4o-mini"', { exact: false })).toBeVisible();
    await page.getByLabel("Close full candidate payload").click();

    const deleteResponse = await authedJson(
      api,
      "DELETE",
      `/api/v1/projects/${projectId}/user-api-keys/${savedKeyId}`,
      token
    );
    expect(deleteResponse.ok()).toBeTruthy();
  });

  test("release gate parity exposes tools request-json and context editors", async ({ page }) => {
    test.setTimeout(300000);
    requireCredentials();

    const api = await playwrightRequest.newContext({ baseURL: API_BASE_URL });
    const session = await loginToBackend(api);
    const token = session.accessToken;
    const { orgId, projectId } = await ensureOrgAndProject(api, token);
    const seededA = await seedToolSnapshot(api, token, projectId, {
      promptPrefix: "PW-RG-PARITY-A",
    });
    const seededB = await seedToolSnapshot(api, token, projectId, {
      agentId: seededA.snapshotAgentId,
      promptPrefix: "PW-RG-PARITY-B",
    });

    await loginWithSessionCookies(page, session);
    await page.goto(
      `/organizations/${orgId}/projects/${projectId}/release-gate?agent_id=${encodeURIComponent(seededA.snapshotAgentId)}`,
      { waitUntil: "domcontentloaded" }
    );
    await expect(page.getByTestId(`rg-live-log-row-${seededA.snapshotId}`)).toBeVisible({
      timeout: 45000,
    });
    await expect(page.getByTestId(`rg-live-log-row-${seededB.snapshotId}`)).toBeVisible({
      timeout: 45000,
    });
    await page.getByTestId(`rg-live-log-checkbox-${seededA.snapshotId}`).check();
    await page.getByTestId(`rg-live-log-checkbox-${seededB.snapshotId}`).check();

    await openReleaseGateSettings(page);
    await page.getByRole("tab", { name: "Environment parity" }).click();

    await page.getByRole("button", { name: "Tools (definitions + recorded calls)" }).click();
    await expect(page.getByRole("button", { name: "Reset tools to snapshot" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add tool" })).toBeVisible();
    await expect(page.getByText("Recorded tool calls")).toBeVisible();

    await page.getByRole("button", { name: "Extra request fields" }).click();
    await expect(page.getByRole("button", { name: "Reset shared" })).toBeVisible();
    await expect(page.getByText("Shared fields (all selected logs)")).toBeVisible();
    await expect(
      page.locator('textarea[placeholder*="metadata"]').filter({ visible: true })
    ).toHaveCount(1);
    await expect(
      page.locator('textarea[placeholder*="attachments"]').filter({ visible: true })
    ).toHaveCount(2);

    await page.getByRole("button", { name: "Extra system text (optional)" }).click();
    await expect(page.getByRole("button", { name: "Reset context from snapshots" })).toBeVisible();
    await page.getByLabel("Add extra system text").check();
    await page.getByLabel("Per log").check();
    await expect(page.getByText("Fallback text (optional)")).toBeVisible();
    await expect(page.getByPlaceholder("Extra system text for this log…")).toHaveCount(2);
  });

  test("release gate parity multi-log full config preview and run returns result rows", async ({
    page,
  }) => {
    test.setTimeout(600000);
    requireCredentials();
    requireRunOnlyApiKey();

    const api = await playwrightRequest.newContext({ baseURL: API_BASE_URL });
    const session = await loginToBackend(api);
    const token = session.accessToken;
    const { orgId, projectId } = await ensureOrgAndProject(api, token);
    const seededA = await seedToolSnapshot(api, token, projectId, {
      promptPrefix: "Do you have a quick start guide for first-time users?",
    });
    const seededB = await seedToolSnapshot(api, token, projectId, {
      agentId: seededA.snapshotAgentId,
      promptPrefix: "How do I reset model/provider overrides for replay tests?",
    });
    const savedKeyName = `[RG] PW Run Key ${Date.now()}`;

    const savedKeyResponse = await authedJson(
      api,
      "POST",
      `/api/v1/projects/${projectId}/user-api-keys`,
      token,
      {
        provider: "openai",
        api_key: RUN_ONLY_API_KEY,
        name: savedKeyName,
      }
    );
    expect(savedKeyResponse.ok()).toBeTruthy();
    const savedKey = (await savedKeyResponse.json()) as { data?: { id?: number }; id?: number };
    const savedKeyId = Number(savedKey?.data?.id || savedKey?.id || 0);
    expect(savedKeyId).toBeGreaterThan(0);

    try {
      await loginWithSessionCookies(page, session);
      await page.goto(
        `/organizations/${orgId}/projects/${projectId}/release-gate?agent_id=${encodeURIComponent(seededA.snapshotAgentId)}`,
        { waitUntil: "domcontentloaded" }
      );

      await expect(page.getByTestId(`rg-live-log-row-${seededA.snapshotId}`)).toBeVisible({
        timeout: 45000,
      });
      await expect(page.getByTestId(`rg-live-log-row-${seededB.snapshotId}`)).toBeVisible({
        timeout: 45000,
      });

      await page.getByTestId(`rg-live-log-checkbox-${seededA.snapshotId}`).check();
      await page.getByTestId(`rg-live-log-checkbox-${seededB.snapshotId}`).check();

      await openReleaseGateSettings(page);
      await expect(page.getByText("2 selected")).toBeVisible();

      await page.getByRole("tab", { name: "Core setup" }).click();
      await page.getByLabel("Custom (BYOK)").check();
      await page.locator('input[name="release-gate-custom-model-id"]').fill("gpt-4o-mini");

      const savedKeyRow = page
        .locator("div")
        .filter({ has: page.getByText(savedKeyName.replace(/^\[RG\]\s*/, ""), { exact: false }) })
        .first();
      await expect(savedKeyRow.getByRole("button", { name: "Use for run" })).toBeVisible({
        timeout: 15000,
      });
      await savedKeyRow.getByRole("button", { name: "Use for run" }).click();

      await page.getByRole("tab", { name: "Environment parity" }).click();

      await ensurePanelOpen(
        page.getByRole("button", { name: "Tools (definitions + recorded calls)" }),
        page.getByRole("button", { name: "Add tool" })
      );
      await page.getByRole("button", { name: "Add tool" }).click();
      await page.getByPlaceholder("e.g. get_weather").first().fill("settings_fetcher");
      await page
        .getByPlaceholder("What this tool does")
        .first()
        .fill("Fetches product settings or support guidance relevant to the replayed request.");
      await page.locator("textarea:visible").first().fill(`{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "The settings or configuration question to look up"
    }
  },
  "required": ["query"],
  "additionalProperties": false
}`);

      await ensurePanelOpen(
        page.getByRole("button", { name: "Extra request fields" }),
        page.getByRole("button", { name: "Reset shared" })
      );
      const sharedReplayOverrideArea = page.locator('textarea[placeholder*="metadata"]:visible');
      await sharedReplayOverrideArea.fill(`{
  "channel": "web_chat",
  "locale": "en-US",
  "tenant": "support-bot-a1",
  "metadata": {
    "entrypoint": "release-gate-parity-test",
    "surface": "customer_support",
    "policy_mode": "default"
  }
}`);
      const replayOverrideAreas = page.locator('textarea[placeholder*="attachments"]:visible');
      await replayOverrideAreas.first().fill(`{
  "metadata": {
    "test_case": "first_time_user_onboarding",
    "user_segment": "new_user"
  }
}`);
      await replayOverrideAreas.nth(1).fill(`{
  "metadata": {
    "test_case": "provider_override_question",
    "user_segment": "existing_customer"
  }
}`);

      await ensurePanelOpen(
        page.getByRole("button", { name: "Extra system text (optional)" }),
        page.getByRole("button", { name: "Reset context from snapshots" })
      );
      await page.getByLabel("Add extra system text").check();
      await page.getByLabel("Per log").check();
      await page
        .locator(
          'xpath=//span[normalize-space()="Fallback text (optional)"]/ancestor::label[1]//textarea'
        )
        .fill("Use docs and tool outcomes to give concise, policy-safe support answers.");
      const perLogContextAreas = page.getByPlaceholder("Extra system text for this log…");
      await perLogContextAreas
        .first()
        .fill(
          "This log is from a first-time user. Prefer onboarding-style guidance and simple explanations."
        );
      await perLogContextAreas
        .nth(1)
        .fill(
          "This log is about provider behavior or limits. Be explicit about practical next steps."
        );

      await page.getByRole("tab", { name: "Preview" }).click();
      await expect(page.getByText("Final override payload")).toBeVisible();
      await expect(page.getByText("Set (shared + 2 logs)")).toBeVisible();
      await expect(page.getByText("Adding extra system text")).toBeVisible();
      await expect(page.getByText(/1 defined/)).toBeVisible();

      await page.getByRole("button", { name: "Expand full JSON" }).click();
      await expect(page.getByText("Final candidate payload (full)")).toBeVisible();
      await expect(
        page.locator("pre").filter({ hasText: '"channel": "web_chat"' }).first()
      ).toBeVisible();
      await expect(
        page.locator("pre").filter({ hasText: '"tenant": "support-bot-a1"' }).first()
      ).toBeVisible();
      await page.getByLabel("Close full candidate payload").click();

      await page.getByLabel("Close Release Gate settings").click();
      await expect(page.getByTestId("rg-run-start-btn")).toBeEnabled({ timeout: 15000 });
      await page.getByTestId("rg-run-start-btn").click();

      await expect(page.getByText(/Healthy gate|Flagged gate/)).toBeVisible({ timeout: 300000 });
      await expect(page.getByTestId("rg-result-report-0-case-0")).toBeVisible({ timeout: 30000 });
      await expect(page.getByTestId("rg-result-report-0-case-1")).toBeVisible({ timeout: 30000 });
    } finally {
      if (savedKeyId > 0) {
        const deleteResponse = await authedJson(
          api,
          "DELETE",
          `/api/v1/projects/${projectId}/user-api-keys/${savedKeyId}`,
          token
        );
        expect(deleteResponse.ok()).toBeTruthy();
      }
      await api.dispose();
    }
  });

  test("release gate run completion toast and latest result persist across node exit until hidden", async ({
    page,
  }) => {
    test.setTimeout(600000);
    requireCredentials();
    requireRunOnlyApiKey();

    const api = await playwrightRequest.newContext({ baseURL: API_BASE_URL });
    const session = await loginToBackend(api);
    const token = session.accessToken;
    const { orgId, projectId } = await ensureOrgAndProject(api, token);
    const seeded = await seedToolSnapshot(api, token, projectId, {
      promptPrefix: "PW-RG-PERSIST-RESULT",
    });
    const savedKeyName = `[RG] PW Persist Key ${Date.now()}`;

    const savedKeyResponse = await authedJson(
      api,
      "POST",
      `/api/v1/projects/${projectId}/user-api-keys`,
      token,
      {
        provider: "openai",
        api_key: RUN_ONLY_API_KEY,
        name: savedKeyName,
      }
    );
    expect(savedKeyResponse.ok()).toBeTruthy();
    const savedKey = (await savedKeyResponse.json()) as { data?: { id?: number }; id?: number };
    const savedKeyId = Number(savedKey?.data?.id || savedKey?.id || 0);
    expect(savedKeyId).toBeGreaterThan(0);

    try {
      await loginWithSessionCookies(page, session);
      await openReleaseGateFromSnapshot(page, {
        orgId,
        projectId,
        agentId: seeded.snapshotAgentId,
        snapshotId: seeded.snapshotId,
      });
      await openReleaseGateSettings(page);

      await page.getByRole("tab", { name: "Core setup" }).click();
      await page.getByLabel("Custom (BYOK)").check();
      await page.locator('input[name="release-gate-custom-model-id"]').fill("gpt-4o-mini");

      const savedKeyRow = page
        .locator("div")
        .filter({ has: page.getByText(savedKeyName.replace(/^\[RG\]\s*/, ""), { exact: false }) })
        .first();
      await expect(savedKeyRow.getByRole("button", { name: "Use for run" })).toBeVisible({
        timeout: 15000,
      });
      await savedKeyRow.getByRole("button", { name: "Use for run" }).click();

      await page.getByLabel("Close Release Gate settings").click();
      await expect(page.getByTestId("rg-run-start-btn")).toBeEnabled({ timeout: 15000 });
      await page.getByTestId("rg-run-start-btn").click();

      await closeSelectedReleaseGatePanels(page);
      await expect(page.getByText("Release Gate run completed.")).toBeVisible({ timeout: 300000 });

      await reopenReleaseGateNode(page, seeded.snapshotAgentId);
      await expect(page.getByTestId("rg-result-report-0-case-0")).toBeVisible({ timeout: 30000 });
      await expect(page.getByTestId("rg-run-start-btn")).toBeEnabled({ timeout: 15000 });

      await page.getByTestId("rg-run-start-btn").click();
      await expect(page.getByTestId("rg-run-start-btn")).toContainText("Validating", { timeout: 15000 });
      await expect(page.getByTestId("rg-result-report-0-case-0")).toBeVisible({ timeout: 15000 });

      await expect(page.getByText("Release Gate run completed.")).toBeVisible({ timeout: 300000 });
      await expect(page.getByTestId("rg-result-report-0")).toBeVisible({ timeout: 30000 });
      await expect(page.getByTestId("rg-result-report-1")).toBeVisible({ timeout: 30000 });
      await expect(page.getByTestId("rg-result-report-0-case-0")).toBeVisible({ timeout: 30000 });
      await expect(page.getByTestId("rg-result-report-1-case-0")).toBeVisible({ timeout: 30000 });

      await page.getByLabel("Hide latest result").first().click();
      await expect(page.getByTestId("rg-result-report-0")).toBeVisible({ timeout: 15000 });
      await expect(page.getByTestId("rg-result-report-0-case-0")).toBeVisible({ timeout: 15000 });

      await closeSelectedReleaseGatePanels(page);
      await reopenReleaseGateNode(page, seeded.snapshotAgentId);
      await expect(page.getByTestId("rg-result-report-0")).toBeVisible({ timeout: 15000 });
      await expect(page.getByTestId("rg-result-report-0-case-0")).toBeVisible();
    } finally {
      if (savedKeyId > 0) {
        const deleteResponse = await authedJson(
          api,
          "DELETE",
          `/api/v1/projects/${projectId}/user-api-keys/${savedKeyId}`,
          token
        );
        expect(deleteResponse.ok()).toBeTruthy();
      }
      await api.dispose();
    }
  });

  test("release gate history session can be hard deleted from history panel", async ({ page }) => {
    test.setTimeout(600000);
    requireCredentials();
    requireRunOnlyApiKey();

    const api = await playwrightRequest.newContext({ baseURL: API_BASE_URL });
    const session = await loginToBackend(api);
    const token = session.accessToken;
    const { orgId, projectId } = await ensureOrgAndProject(api, token);
    const seeded = await seedToolSnapshot(api, token, projectId, {
      promptPrefix: "PW-RG-HISTORY-DELETE",
    });
    const savedKeyName = `[RG] PW History Delete Key ${Date.now()}`;

    const savedKeyResponse = await authedJson(
      api,
      "POST",
      `/api/v1/projects/${projectId}/user-api-keys`,
      token,
      {
        provider: "openai",
        api_key: RUN_ONLY_API_KEY,
        name: savedKeyName,
      }
    );
    expect(savedKeyResponse.ok()).toBeTruthy();
    const savedKey = (await savedKeyResponse.json()) as { data?: { id?: number }; id?: number };
    const savedKeyId = Number(savedKey?.data?.id || savedKey?.id || 0);
    expect(savedKeyId).toBeGreaterThan(0);

    try {
      await loginWithSessionCookies(page, session);
      await openReleaseGateFromSnapshot(page, {
        orgId,
        projectId,
        agentId: seeded.snapshotAgentId,
        snapshotId: seeded.snapshotId,
      });
      await openReleaseGateSettings(page);

      await page.getByRole("tab", { name: "Core setup" }).click();
      await page.getByLabel("Custom (BYOK)").check();
      await page.locator('input[name="release-gate-custom-model-id"]').fill("gpt-4o-mini");

      const savedKeyRow = page
        .locator("div")
        .filter({ has: page.getByText(savedKeyName.replace(/^\[RG\]\s*/, ""), { exact: false }) })
        .first();
      await expect(savedKeyRow.getByRole("button", { name: "Use for run" })).toBeVisible({
        timeout: 15000,
      });
      await savedKeyRow.getByRole("button", { name: "Use for run" }).click();

      await page.getByLabel("Close Release Gate settings").click();
      await expect(page.getByTestId("rg-run-start-btn")).toBeEnabled({ timeout: 15000 });
      await page.getByTestId("rg-run-start-btn").click();
      await expect(page.getByText("Release Gate run completed.")).toBeVisible({ timeout: 300000 });

      await page.getByTestId("rg-right-tab-history").click();
      await expect(page.getByTestId("rg-history-report-0")).toBeVisible({ timeout: 30000 });

      page.once("dialog", dialog => dialog.accept());
      await page.getByLabel("Delete session").first().click();

      await expect(page.getByText("Validation session deleted.")).toBeVisible({ timeout: 15000 });
      await expect(page.getByText("No retained inputs yet for this agent.")).toBeVisible({
        timeout: 30000,
      });

      await closeSelectedReleaseGatePanels(page);
      await reopenReleaseGateNode(page, seeded.snapshotAgentId);
      await page.getByTestId("rg-right-tab-history").click();
      await expect(page.getByText("No retained inputs yet for this agent.")).toBeVisible({
        timeout: 30000,
      });
    } finally {
      if (savedKeyId > 0) {
        const deleteResponse = await authedJson(
          api,
          "DELETE",
          `/api/v1/projects/${projectId}/user-api-keys/${savedKeyId}`,
          token
        );
        expect(deleteResponse.ok()).toBeTruthy();
      }
      await api.dispose();
    }
  });

  test("release gate refresh button reveals a newly added agent without auto layout", async ({
    page,
  }) => {
    test.setTimeout(600000);
    requireCredentials();

    const api = await playwrightRequest.newContext({ baseURL: API_BASE_URL });
    const session = await loginToBackend(api);
    const token = session.accessToken;
    const { orgId, projectId } = await ensureOrgAndProject(api, token);
    const seeded = await seedToolSnapshot(api, token, projectId, {
      promptPrefix: "PW-RG-REFRESH-BASE",
    });
    const newAgentId = `pw-rg-refresh-${Date.now()}`;

    try {
      await loginWithSessionCookies(page, session);
      await openReleaseGateFromSnapshot(page, {
        orgId,
        projectId,
        agentId: seeded.snapshotAgentId,
        snapshotId: seeded.snapshotId,
      });

      await expect(page.getByTestId(`rg-node-${seeded.snapshotAgentId}`)).toBeVisible({
        timeout: 30000,
      });

      await seedToolSnapshot(api, token, projectId, {
        agentId: newAgentId,
        promptPrefix: "PW-RG-REFRESH-NEW",
      });

      await expect(page.getByTestId(`rg-node-${newAgentId}`)).toHaveCount(0);
      await page.getByTitle("Refresh agent lists (Live View + Release Gate) and fit the map").click();
      await expect(page.getByTestId(`rg-node-${newAgentId}`)).toBeVisible({ timeout: 30000 });
      await expect(page.getByTestId(`rg-node-${seeded.snapshotAgentId}`)).toBeVisible();
    } finally {
      await api.dispose();
    }
  });
});
