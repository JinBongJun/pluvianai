import http from "k6/http";
import { check, sleep } from "k6";
import { getBaseUrl, sleepSeconds } from "./common.js";

export const options = {
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<800"],
  },
  scenarios: {
    health_smoke: {
      executor: "ramping-vus",
      stages: [
        { duration: "20s", target: 5 },
        { duration: "40s", target: 10 },
        { duration: "20s", target: 0 },
      ],
      gracefulRampDown: "5s",
    },
  },
};

const baseUrl = getBaseUrl();

export default function () {
  const response = http.get(`${baseUrl}/health`, {
    tags: { endpoint: "health" },
  });

  check(response, {
    "health status is 200": r => r.status === 200,
    "health says healthy": r => String(r.json("status") || "") === "healthy",
  });

  sleep(sleepSeconds(0.5, 1.2));
}
