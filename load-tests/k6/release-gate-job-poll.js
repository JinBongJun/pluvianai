import http from "k6/http";
import { check, sleep, fail } from "k6";
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
    http_req_duration: ["p(95)<3000"],
  },
  scenarios: {
    release_gate_job_poll: {
      executor: "constant-vus",
      vus: 10,
      duration: "60s",
    },
  },
};

export function setup() {
  const baseUrl = getBaseUrl();
  const { accessToken } = login(baseUrl);
  const headers = authHeaders(accessToken);
  const projectId = discoverProjectId(baseUrl, headers);
  const jobId = String(__ENV.JOB_ID || "").trim();
  const includeResult = String(__ENV.INCLUDE_RESULT || "0").trim() === "1" ? 1 : 0;
  const minSleep = envNumber("POLL_SLEEP_MIN_SEC", 1.5);
  const maxSleep = envNumber("POLL_SLEEP_MAX_SEC", 3.0);

  if (!jobId) {
    fail("Set JOB_ID for release-gate-job-poll.js.");
  }

  return {
    baseUrl,
    headers,
    projectId,
    jobId,
    includeResult,
    minSleep,
    maxSleep,
  };
}

export default function (data) {
  const response = http.get(
    `${data.baseUrl}/api/v1/projects/${data.projectId}/release-gate/jobs/${encodeURIComponent(data.jobId)}?include_result=${data.includeResult}`,
    {
      headers: data.headers,
      tags: { endpoint: "release_gate_job_poll" },
    }
  );

  check(response, {
    "release gate job poll status is 200": r => r.status === 200,
    "release gate job poll not rate-limited": r => r.status !== 429,
  });

  sleep(sleepSeconds(data.minSleep, data.maxSleep));
}
