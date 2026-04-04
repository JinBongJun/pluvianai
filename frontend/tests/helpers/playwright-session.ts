/**
 * Shared Playwright + API helpers for authenticated E2E specs.
 * Requires PLAYWRIGHT_E2E_EMAIL and PLAYWRIGHT_E2E_PASSWORD when running browser tests.
 */
import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type Page,
} from "@playwright/test";

export const API_BASE_URL = process.env.PLAYWRIGHT_API_URL || "http://127.0.0.1:8000";
export const PLAYWRIGHT_BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
export const LOGIN_EMAIL = process.env.PLAYWRIGHT_E2E_EMAIL;
export const LOGIN_PASSWORD = process.env.PLAYWRIGHT_E2E_PASSWORD;
export const RUN_ONLY_API_KEY = process.env.PLAYWRIGHT_RUN_ONLY_API_KEY || process.env.OPENAI_API_KEY;
export const E2E_PROJECT_NAME = "Cursor Tool E2E";

export type SeedContext = {
  orgId: number;
  projectId: number;
  snapshotId: number;
  snapshotAgentId: string;
  traceId: string;
  promptText: string;
  snapshotDisplayTime: string;
};

export type SeedSnapshotOptions = {
  agentId?: string;
  promptPrefix?: string;
  /** When set, used as `trace_id` so parallel `seedToolSnapshot` calls never collide. */
  traceId?: string;
};

/** Poll list until trace appears (Redis/async ingest can take many seconds on production). */
async function waitForSnapshotMeta(
  api: APIRequestContext,
  token: string,
  projectId: number,
  traceId: string
): Promise<{ snapshotId: number; agentId: string }> {
  const maxAttempts = 100;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
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
    await new Promise(resolve => setTimeout(resolve, attempt < 8 ? 500 : 1000));
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

export function requireCredentials() {
  test.skip(
    !LOGIN_EMAIL || !LOGIN_PASSWORD,
    "PLAYWRIGHT_E2E_EMAIL and PLAYWRIGHT_E2E_PASSWORD are required."
  );
}

export function requireRunOnlyApiKey() {
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

export async function loginToBackend(
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

export async function authedJson(
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

export async function ensureOrgAndProject(
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

export async function seedToolSnapshot(
  api: APIRequestContext,
  token: string,
  projectId: number,
  options: SeedSnapshotOptions = {}
): Promise<SeedContext> {
  const traceId = options.traceId ?? `pw-tool-flow-${Date.now()}`;
  const promptText = `${options.promptPrefix || "PWTOOL-E2E"}-${traceId}`;

  const createResponse = await expectOkWithRetry(
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

  const createData = (await createResponse.json()) as { id?: number; status?: string };
  let snapshotId: number;
  if (Number.isFinite(Number(createData?.id))) {
    snapshotId = Number(createData.id);
  } else {
    const snapshotMeta = await waitForSnapshotMeta(api, token, projectId, traceId);
    snapshotId = snapshotMeta.snapshotId;
  }

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

export async function createDataset(
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

export async function loginWithSessionCookies(
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
