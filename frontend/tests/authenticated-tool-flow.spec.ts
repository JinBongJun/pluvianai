import { expect, request as playwrightRequest, test, type APIRequestContext, type Page } from "@playwright/test";

const API_BASE_URL = process.env.PLAYWRIGHT_API_URL || "http://127.0.0.1:8000";
const LOGIN_EMAIL = process.env.PLAYWRIGHT_E2E_EMAIL;
const LOGIN_PASSWORD = process.env.PLAYWRIGHT_E2E_PASSWORD;
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
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const listResponse = await authedJson(
      api,
      "GET",
      `/api/v1/projects/${projectId}/snapshots?light=true&limit=50`,
      token
    );
    if (listResponse.ok()) {
      const data = await listResponse.json();
      const items = Array.isArray(data?.items) ? data.items : [];
      const match = items.find((item: { trace_id?: string }) => String(item.trace_id || "") === traceId);
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
            new Set(detail.tool_timeline.map((row: { provenance?: string }) => row.provenance || ""))
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
  test.skip(!LOGIN_EMAIL || !LOGIN_PASSWORD, "PLAYWRIGHT_E2E_EMAIL and PLAYWRIGHT_E2E_PASSWORD are required.");
}

async function loginToBackend(api: APIRequestContext): Promise<string> {
  const response = await api.post("/api/v1/auth/login", {
    form: {
      username: LOGIN_EMAIL!,
      password: LOGIN_PASSWORD!,
    },
  });
  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  expect(typeof data.access_token).toBe("string");
  return data.access_token as string;
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

async function ensureOrgAndProject(api: APIRequestContext, token: string): Promise<{ orgId: number; projectId: number }> {
  const orgsResponse = await authedJson(api, "GET", "/api/v1/organizations?include_stats=false", token);
  expect(orgsResponse.ok()).toBeTruthy();
  const orgs = (await orgsResponse.json()) as Array<{ id: number; name?: string }>;

  let orgId = Number(orgs?.[0]?.id || 0);
  if (!orgId) {
    const createOrgResponse = await authedJson(api, "POST", "/api/v1/organizations", token, {
      name: "Cursor E2E Org",
      description: "Organization for authenticated browser tool flow tests.",
      plan_type: "free",
    });
    expect(createOrgResponse.ok()).toBeTruthy();
    const org = await createOrgResponse.json();
    orgId = Number(org.id);
  }

  const projectsResponse = await authedJson(
    api,
    "GET",
    `/api/v1/organizations/${orgId}/projects?include_stats=false`,
    token
  );
  expect(projectsResponse.ok()).toBeTruthy();
  const projects = (await projectsResponse.json()) as Array<{ id: number; name?: string }>;

  let projectId =
    Number(projects.find(project => String(project.name || "").trim() === E2E_PROJECT_NAME)?.id || 0) ||
    Number(projects?.[0]?.id || 0);

  if (!projectId) {
    const createProjectResponse = await authedJson(api, "POST", "/api/v1/projects", token, {
      name: E2E_PROJECT_NAME,
      description: "Project for authenticated tool flow browser tests.",
      organization_id: orgId,
      usage_mode: "full",
    });
    expect(createProjectResponse.ok()).toBeTruthy();
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

  const createSnapshotResponse = await authedJson(
    api,
    "POST",
    `/api/v1/projects/${projectId}/snapshots`,
    token,
    {
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
    }
  );
  expect(createSnapshotResponse.ok()).toBeTruthy();

  const snapshotMeta = await waitForSnapshotMeta(api, token, projectId, traceId);
  const snapshotId = snapshotMeta.snapshotId;

  const validateResponse = await authedJson(api, "POST", `/api/v1/projects/${projectId}/behavior/validate`, token, {
    trace_id: traceId,
  });
  expect(validateResponse.ok()).toBeTruthy();

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
  const response = await authedJson(api, "POST", `/api/v1/projects/${projectId}/behavior/datasets`, token, {
    snapshot_ids: options.snapshotIds,
    agent_id: options.agentId,
    label: options.label,
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as { id: string; label?: string | null };
}

async function loginThroughUi(page: Page) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Verify Credentials" })).toBeVisible({
    timeout: 20000,
  });
  await page.locator("#email-address").fill(LOGIN_EMAIL!);
  await page.locator("#password").fill(LOGIN_PASSWORD!);
  await page.getByRole("button", { name: "Commence Session" }).click();
  await expect(page).toHaveURL(/\/organizations/, { timeout: 20000 });
}

test.describe("Authenticated tool browser flow", () => {
  test.describe.configure({ mode: "serial" });

  test("login, open seeded snapshot in Live View and Release Gate", async ({ page }) => {
    test.setTimeout(120000);
    requireCredentials();

    const api = await playwrightRequest.newContext({ baseURL: API_BASE_URL });
    const token = await loginToBackend(api);
    const { orgId, projectId } = await ensureOrgAndProject(api, token);
    const seeded = await seedToolSnapshot(api, token, projectId);
    seeded.orgId = orgId;

    await loginThroughUi(page);

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
    test.setTimeout(120000);
    requireCredentials();

    const api = await playwrightRequest.newContext({ baseURL: API_BASE_URL });
    const token = await loginToBackend(api);
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

    await loginThroughUi(page);
    await page.goto(
      `/organizations/${orgId}/projects/${projectId}/release-gate?agent_id=${encodeURIComponent(sharedAgentId)}`,
      { waitUntil: "domcontentloaded" }
    );

    await page.getByRole("tab", { name: "Saved Data" }).click();
    await expect(page.getByTestId("rg-datasets-state-list")).toBeVisible({ timeout: 45000 });

    const datasetACard = page.locator("div").filter({ has: page.getByText(datasetALabel, { exact: false }) });
    const datasetBCard = page.locator("div").filter({ has: page.getByText(datasetBLabel, { exact: false }) });
    await datasetACard.locator('input[type="checkbox"]').first().check();
    await datasetBCard.locator('input[type="checkbox"]').first().check();

    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.getByRole("heading", { name: "Release Gate configuration" })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText(/Previewing baseline for log #/)).toBeVisible();

    await page.getByRole("tab", { name: "Environment parity" }).click();
    await page.getByRole("button", { name: "Extra request fields" }).click();
    await expect(page.getByText(`Log id ${seededA.snapshotId}`)).toBeVisible();
    await expect(page.getByText(`Log id ${seededB.snapshotId}`)).toBeVisible();
  });
});
