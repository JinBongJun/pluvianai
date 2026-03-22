import type {
  LiveViewRequestOverview,
  LiveViewToolTimelineRow,
  RequestContextMeta,
} from "@/lib/api/live-view";

export type SnapshotDetailFixtureSnapshot = {
  id: string | number;
  trace_id?: string;
  agent_id?: string;
  created_at?: string;
  latency_ms?: number | null;
  tokens_used?: number | null;
  cost?: number | string | null;
  system_prompt?: string | null;
  user_message?: string | null;
  request_prompt?: string | null;
  response?: string | null;
  response_text?: string | null;
  payload?: Record<string, unknown> | null;
  status_code?: number | null;
  has_tool_calls?: boolean;
  tool_calls_summary?: Array<{ name: string; arguments?: string | Record<string, unknown> }>;
  tool_timeline?: LiveViewToolTimelineRow[];
  tool_timeline_redaction_version?: number;
  request_context_meta?: RequestContextMeta | null;
  request_overview?: LiveViewRequestOverview | null;
};

export type SnapshotDetailFixtureCase = {
  id: string;
  title: string;
  notes: string;
  snapshot: SnapshotDetailFixtureSnapshot;
};

const baseSnapshot: SnapshotDetailFixtureSnapshot = {
  id: "fixture-1",
  trace_id: "trace_fixture_1",
  agent_id: "support-bot-a1",
  created_at: "2026-03-18T17:21:51.000Z",
  latency_ms: 842,
  tokens_used: 912,
  cost: "0.0031",
  system_prompt: "You are a concise support assistant.",
  user_message: "Do I need to rotate my API key?",
  request_prompt: "Summarize next steps.",
  response_text:
    "Please rotate the key, confirm the old key is revoked, and verify the integration with a fresh request.",
  response:
    "Please rotate the key, confirm the old key is revoked, and verify the integration with a fresh request.",
  payload: {
    request: {
      method: "POST",
      path: "/chat/completions",
    },
    response: {
      id: "resp_fixture_1",
    },
  },
  status_code: 200,
  request_context_meta: null,
};

export const snapshotDetailFixtureCases: SnapshotDetailFixtureCase[] = [
  {
    id: "legacy-empty",
    title: "Legacy empty snapshot",
    notes: "No tool summary, no tool timeline, and no outbound actions.",
    snapshot: {
      ...baseSnapshot,
      id: "legacy-empty",
      payload: {
        ...baseSnapshot.payload,
      },
      has_tool_calls: false,
      tool_calls_summary: [],
      tool_timeline: [],
    },
  },
  {
    id: "summary-only",
    title: "Summary only snapshot",
    notes: "Provider summary exists, but no tool timeline rows were stored.",
    snapshot: {
      ...baseSnapshot,
      id: "summary-only",
      has_tool_calls: true,
      tool_calls_summary: [
        {
          name: "get_weather",
          arguments: {
            city: "Seoul",
            units: "metric",
          },
        },
      ],
      tool_timeline: [],
    },
  },
  {
    id: "payload-fallback",
    title: "Payload fallback snapshot",
    notes: "Timeline rows come from payload.tool_events fallback with Ingest provenance.",
    snapshot: {
      ...baseSnapshot,
      id: "payload-fallback",
      has_tool_calls: true,
      tool_calls_summary: [
        {
          name: "get_weather",
          arguments: {
            city: "Seoul",
          },
        },
      ],
      payload: {
        ...baseSnapshot.payload,
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
            output: { ok: true, channel: "#support-escalations" },
            status: "ok",
          },
        ],
      },
      tool_timeline_redaction_version: 1,
      tool_timeline: [
        {
          step_order: 0,
          step_type: "tool_call",
          tool_name: "get_weather",
          tool_args: { city: "Seoul", call_id: "call_weather_1" },
          provenance: "payload",
        },
        {
          step_order: 1,
          step_type: "tool_result",
          tool_name: "get_weather",
          tool_args: { call_id: "call_weather_1" },
          tool_result: {
            output: { temp_c: 22, condition: "sunny" },
            status: "ok",
            call_id: "call_weather_1",
          },
          provenance: "payload",
        },
        {
          step_order: 2,
          step_type: "action",
          tool_name: "send_slack",
          tool_result: {
            output: { ok: true, channel: "#support-escalations" },
            status: "ok",
          },
          provenance: "payload",
        },
      ],
    },
  },
  {
    id: "trajectory-preferred",
    title: "Trajectory preferred snapshot",
    notes: "Trajectory-backed rows should win over differing payload tool_events.",
    snapshot: {
      ...baseSnapshot,
      id: "trajectory-preferred",
      has_tool_calls: true,
      tool_calls_summary: [
        {
          name: "trajectory_lookup",
          arguments: {
            query: "refund policy",
          },
        },
      ],
      payload: {
        ...baseSnapshot.payload,
        tool_events: [
          {
            kind: "tool_call",
            name: "payload_lookup",
            call_id: "call_payload_1",
            input: { query: "legacy payload result" },
          },
        ],
      },
      tool_timeline_redaction_version: 1,
      tool_timeline: [
        {
          step_order: 0,
          step_type: "tool_call",
          tool_name: "trajectory_lookup",
          tool_args: {
            query: "refund policy",
            call_id: "call_trajectory_1",
          },
          provenance: "trajectory",
          latency_ms: 33,
        },
        {
          step_order: 1,
          step_type: "tool_result",
          tool_name: "trajectory_lookup",
          tool_args: {
            call_id: "call_trajectory_1",
          },
          tool_result: {
            output: {
              article_id: "kb_42",
              answer: "Refunds are available within 30 days.",
            },
            status: "ok",
          },
          provenance: "trajectory",
          latency_ms: 34,
        },
      ],
    },
  },
  {
    id: "has-tool-calls-no-summary",
    title: "Has tool calls but missing summary",
    notes: "Snapshot reports tool calls, but no provider argument summary was stored.",
    snapshot: {
      ...baseSnapshot,
      id: "has-tool-calls-no-summary",
      has_tool_calls: true,
      tool_calls_summary: [],
      tool_timeline: [],
    },
  },
  {
    id: "empty-tool-events",
    title: "Empty tool_events payload",
    notes: "tool_events key exists but contains no rows, so timeline shows the ingest-specific empty state.",
    snapshot: {
      ...baseSnapshot,
      id: "empty-tool-events",
      has_tool_calls: false,
      tool_calls_summary: [],
      payload: {
        ...baseSnapshot.payload,
        tool_events: [],
      },
      tool_timeline: [],
    },
  },
];

export const snapshotDetailFixtureCaseIds = snapshotDetailFixtureCases.map(item => item.id);

export const defaultSnapshotDetailFixtureCaseId = "legacy-empty";

export function getSnapshotDetailFixtureCase(caseId?: string): SnapshotDetailFixtureCase {
  return (
    snapshotDetailFixtureCases.find(item => item.id === caseId) ??
    snapshotDetailFixtureCases.find(item => item.id === defaultSnapshotDetailFixtureCaseId) ??
    snapshotDetailFixtureCases[0]
  );
}
