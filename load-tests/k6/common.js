import http from "k6/http";
import { check, fail } from "k6";

export function envNumber(name, fallback) {
  const raw = String(__ENV[name] ?? "").trim();
  if (!raw) return fallback;
  const num = Number(raw);
  if (!Number.isFinite(num)) {
    fail(`${name} must be a number. Received: ${raw}`);
  }
  return num;
}

export function getBaseUrl() {
  return String(__ENV.BASE_URL || "http://localhost:8000").replace(/\/$/, "");
}

export function unwrapData(body) {
  if (!body || typeof body !== "object") return body;
  if ("data" in body) return body.data;
  return body;
}

export function authHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

export function login(baseUrl) {
  const accessToken = String(__ENV.ACCESS_TOKEN || "").trim();
  if (accessToken) {
    return { accessToken };
  }

  const email = String(__ENV.EMAIL || "").trim();
  const password = String(__ENV.PASSWORD || "").trim();
  if (!email || !password) {
    fail("Set ACCESS_TOKEN or both EMAIL and PASSWORD.");
  }

  const response = http.post(
    `${baseUrl}/api/v1/auth/login`,
    {
      username: email,
      password,
    },
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      tags: { endpoint: "auth_login" },
    }
  );

  check(response, {
    "login status is 200": r => r.status === 200,
  });

  if (response.status !== 200) {
    fail(`Login failed: status=${response.status} body=${response.body}`);
  }

  const body = response.json();
  const token = String(body?.access_token || "").trim();
  if (!token) {
    fail("Login succeeded but access_token was missing.");
  }
  return { accessToken: token };
}

export function discoverProjectId(baseUrl, headers) {
  const explicit = String(__ENV.PROJECT_ID || "").trim();
  if (explicit) return explicit;

  const response = http.get(`${baseUrl}/api/v1/projects`, {
    headers,
    tags: { endpoint: "projects_list" },
  });
  check(response, {
    "projects status is 200": r => r.status === 200,
  });
  if (response.status !== 200) {
    fail(`Could not fetch projects: status=${response.status} body=${response.body}`);
  }

  const body = unwrapData(response.json());
  const items = Array.isArray(body)
    ? body
    : Array.isArray(body?.items)
      ? body.items
      : [];
  const projectId = items[0]?.id;
  if (!projectId) {
    fail("No project found. Set PROJECT_ID explicitly.");
  }
  return String(projectId);
}

export function discoverReleaseGateAgentId(baseUrl, headers, projectId) {
  const explicit = String(__ENV.AGENT_ID || "").trim();
  if (explicit) return explicit;

  const response = http.get(
    `${baseUrl}/api/v1/projects/${projectId}/release-gate/agents?limit=1`,
    {
      headers,
      tags: { endpoint: "release_gate_agents" },
    }
  );
  check(response, {
    "release gate agents status is 200": r => r.status === 200,
  });
  if (response.status !== 200) {
    fail(`Could not fetch RG agents: status=${response.status} body=${response.body}`);
  }

  const body = response.json();
  const items = Array.isArray(body?.items) ? body.items : [];
  const agentId = items[0]?.agent_id;
  if (!agentId) {
    fail("No Release Gate agent found. Set AGENT_ID explicitly.");
  }
  return String(agentId);
}

export function sleepSeconds(minSeconds, maxSeconds) {
  const min = Number(minSeconds);
  const max = Number(maxSeconds);
  const seconds = min + Math.random() * Math.max(0, max - min);
  return seconds;
}
