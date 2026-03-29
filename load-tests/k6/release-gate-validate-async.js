import http from "k6/http";
import { check, sleep } from "k6";
import {
  authHeaders,
  discoverProjectId,
  discoverReleaseGateAgentId,
  envNumber,
  getBaseUrl,
  login,
  sleepSeconds,
} from "./common.js";

export const options = {
  thresholds: {
    http_req_failed: ["rate<0.1"],
    http_req_duration: ["p(95)<5000"],
  },
  scenarios: {
    release_gate_validate_async: {
      executor: "per-vu-iterations",
      vus: 2,
      iterations: 2,
      maxDuration: "5m",
    },
  },
};

export function setup() {
  const baseUrl = getBaseUrl();
  const { accessToken } = login(baseUrl);
  const headers = authHeaders(accessToken);
  const projectId = discoverProjectId(baseUrl, headers);
  const agentId = discoverReleaseGateAgentId(baseUrl, headers, projectId);

  const payload = {
    agent_id: agentId,
    use_recent_snapshots: true,
    recent_snapshot_limit: envNumber("RG_RECENT_SNAPSHOT_LIMIT", 5),
    repeat_runs: envNumber("RG_REPEAT_RUNS", 1),
    model_source: String(__ENV.RG_MODEL_SOURCE || "detected").trim(),
    fail_rate_max: Number(__ENV.RG_FAIL_RATE_MAX || 0),
    flaky_rate_max: Number(__ENV.RG_FLAKY_RATE_MAX || 0),
  };

  const replayProvider = String(__ENV.RG_REPLAY_PROVIDER || "").trim();
  const replayModel = String(__ENV.RG_NEW_MODEL || "").trim();
  const replayApiKey = String(__ENV.RG_REPLAY_API_KEY || "").trim();
  const replayUserApiKeyId = String(__ENV.RG_REPLAY_USER_API_KEY_ID || "").trim();

  if (replayProvider) payload.replay_provider = replayProvider;
  if (replayModel) payload.new_model = replayModel;
  if (replayApiKey) payload.replay_api_key = replayApiKey;
  if (replayUserApiKeyId) payload.replay_user_api_key_id = Number(replayUserApiKeyId);

  return {
    baseUrl,
    headers,
    projectId,
    payload,
    pollMin: envNumber("RG_POLL_SLEEP_MIN_SEC", 2.0),
    pollMax: envNumber("RG_POLL_SLEEP_MAX_SEC", 3.5),
  };
}

export default function (data) {
  const startResponse = http.post(
    `${data.baseUrl}/api/v1/projects/${data.projectId}/release-gate/validate-async`,
    JSON.stringify(data.payload),
    {
      headers: data.headers,
      tags: { endpoint: "release_gate_validate_async" },
    }
  );

  check(startResponse, {
    "release gate validate accepted": r => r.status === 200 || r.status === 202,
    "release gate validate not rate-limited": r => r.status !== 429,
  });

  if (startResponse.status !== 200 && startResponse.status !== 202) {
    return;
  }

  const jobId = String(startResponse.json("job.id") || "").trim();
  if (!jobId) {
    return;
  }

  let done = false;
  while (!done) {
    const pollResponse = http.get(
      `${data.baseUrl}/api/v1/projects/${data.projectId}/release-gate/jobs/${encodeURIComponent(jobId)}?include_result=0`,
      {
        headers: data.headers,
        tags: { endpoint: "release_gate_job_poll" },
      }
    );

    check(pollResponse, {
      "release gate job poll status is 200": r => r.status === 200,
      "release gate job poll not rate-limited": r => r.status !== 429,
    });

    if (pollResponse.status !== 200) {
      return;
    }

    const status = String(pollResponse.json("job.status") || "").toLowerCase();
    done = ["succeeded", "failed", "canceled"].includes(status);
    if (!done) {
      sleep(sleepSeconds(data.pollMin, data.pollMax));
    }
  }
}
