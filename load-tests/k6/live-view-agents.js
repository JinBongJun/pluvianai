import http from "k6/http";
import { check, sleep } from "k6";
import {
  authHeaders,
  discoverProjectId,
  envNumber,
  getBaseUrl,
  login,
  sleepSeconds,
} from "./common.js";

export const options = {
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<2500"],
  },
  scenarios: {
    live_view_agents: {
      executor: "ramping-vus",
      stages: [
        { duration: "30s", target: 5 },
        { duration: "60s", target: 20 },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "5s",
    },
  },
};

export function setup() {
  const baseUrl = getBaseUrl();
  const { accessToken } = login(baseUrl);
  const headers = authHeaders(accessToken);
  const projectId = discoverProjectId(baseUrl, headers);
  const limit = envNumber("LIVE_VIEW_LIMIT", 30);
  const includeDeleted = String(__ENV.LIVE_VIEW_INCLUDE_DELETED || "1").trim() !== "0";

  return {
    baseUrl,
    headers,
    projectId,
    limit,
    includeDeleted,
  };
}

export default function (data) {
  const response = http.get(
    `${data.baseUrl}/api/v1/projects/${data.projectId}/live-view/agents?limit=${data.limit}&include_deleted=${data.includeDeleted ? 1 : 0}`,
    {
      headers: data.headers,
      tags: { endpoint: "live_view_agents" },
    }
  );

  check(response, {
    "live view agents status is 200": r => r.status === 200,
    "live view agents not rate-limited": r => r.status !== 429,
  });

  sleep(sleepSeconds(1.0, 2.5));
}
