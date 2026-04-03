import { describe, expect, it } from "vitest";

import {
  mapExportedReportToCompletedReleaseGateEntry,
  mapHistoryItemToCompletedReleaseGateEntry,
  mergeCompletedReleaseGateEntries,
  type CompletedReleaseGateResultEntry,
} from "./releaseGateResultHydration";

describe("useReleaseGateValidateRun helpers", () => {
  it("maps exported behavior report payload into completed result entry", () => {
    const entry = mapExportedReportToCompletedReleaseGateEntry({
      id: "rep-1",
      created_at: "2026-04-03T01:02:03.000Z",
      summary: {
        release_gate: {
          pass: true,
          total_inputs: 2,
          repeat_runs: 1,
          failure_reasons: [],
        },
      },
      case_results: [{ case_status: "pass", attempts: [{ pass: true }] }],
    });

    expect(entry).toMatchObject({
      reportId: "rep-1",
      result: {
        report_id: "rep-1",
        pass: true,
        total_inputs: 2,
      },
    });
    expect(entry?.completedAtMs).toBe(Date.parse("2026-04-03T01:02:03.000Z"));
    expect(entry?.result.case_results).toHaveLength(1);
  });

  it("merges completed entries by report id and keeps newest first", () => {
    const current: CompletedReleaseGateResultEntry[] = [
      {
        reportId: "rep-1",
        result: { report_id: "rep-1", pass: false } as any,
        completedAtMs: 100,
      },
    ];
    const incoming: CompletedReleaseGateResultEntry[] = [
      {
        reportId: "rep-2",
        result: { report_id: "rep-2", pass: true } as any,
        completedAtMs: 300,
      },
      {
        reportId: "rep-1",
        result: { report_id: "rep-1", pass: true } as any,
        completedAtMs: 200,
      },
    ];

    const merged = mergeCompletedReleaseGateEntries(current, incoming);

    expect(merged.map(entry => entry.reportId)).toEqual(["rep-2", "rep-1"]);
    expect(merged[1]?.result.pass).toBe(true);
    expect(merged).toHaveLength(2);
  });

  it("maps history session payload into completed result entry without export call", () => {
    const entry = mapHistoryItemToCompletedReleaseGateEntry({
      report_id: "rep-2",
      created_at: "2026-04-04T02:03:04.000Z",
      session_created_at: "2026-04-04T02:03:04.000Z",
      session_result: {
        report_id: "rep-2",
        pass: false,
        exit_code: 1,
        trace_id: "trace-2",
        baseline_trace_id: "base-2",
        failure_reasons: ["Missing required field"],
        thresholds_used: { fail_rate_max: 0.2 },
        repeat_runs: 2,
        evidence_pack: {
          top_regressed_rules: [],
          first_violations: [],
          failed_replay_snapshot_ids: [],
          sample_failure_reasons: ["Missing required field"],
        },
      } as any,
    });

    expect(entry).toMatchObject({
      reportId: "rep-2",
      result: {
        report_id: "rep-2",
        pass: false,
        trace_id: "trace-2",
      },
    });
    expect(entry?.completedAtMs).toBe(Date.parse("2026-04-04T02:03:04.000Z"));
  });
});
