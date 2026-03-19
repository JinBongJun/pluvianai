/**
 * Shared types used across API modules.
 */
export type PlanType = "free" | "pro" | "enterprise";

export interface OrganizationSummary {
  id: number;
  name: string;
  plan: PlanType;
  projects: number;
  calls7d?: number;
  cost7d?: number;
  alertsOpen?: number;
  driftDetected?: boolean;
}

export interface OrganizationDetail extends OrganizationSummary {
  usage: {
    calls: number;
    callsLimit: number;
    cost: number;
    costLimit: number;
    quality: number;
  };
  alerts: { project?: string; summary?: string; severity?: string }[];
}

export interface OrganizationProject {
  id: number;
  name: string;
  description: string | null;
  calls24h?: number;
  cost7d?: number;
  quality?: number | null;
  alerts?: number;
  drift?: boolean;
}

export interface Project {
  id: number;
  name: string;
  description: string | null;
  owner_id: number;
  is_active: boolean;
  role?: "owner" | "admin" | "member" | "viewer";
  organization_id?: number | null;
}

export interface RuleJSON {
  type: "tool_forbidden" | "tool_allowlist" | "tool_order" | "tool_args_schema";
  name?: string;
  severity?: "low" | "medium" | "high" | "critical";
  spec: any;
  meta?: any;
}

export interface BehaviorRule {
  id: string;
  project_id: number;
  name: string;
  description?: string | null;
  scope_type: "project" | "agent" | "canvas";
  scope_ref?: string | null;
  severity_default?: "low" | "medium" | "high" | "critical" | null;
  rule_json: RuleJSON;
  enabled: boolean;
  created_at: string;
  updated_at?: string;
}

export interface ValidationReport {
  report_id: string;
  status: "pass" | "fail";
  summary: any;
  violations: any[];
}

export interface CompareResult {
  baseline_run_id: string;
  candidate_run_id: string;
  baseline_summary: any;
  candidate_summary: any;
  violation_count_delta: number;
  severity_delta: any;
  top_regressed_rules: any[];
  first_broken_step: number | null;
  is_regressed: boolean;
}

export interface CIGateResult {
  pass: boolean;
  exit_code: 0 | 1;
  report_id: string;
  report_url: string;
  summary: any;
  violations: any[];
  failure_reasons: string[];
  thresholds_used: Record<string, number>;
  compare_mode: boolean;
}

export type BehaviorChangeBand = "stable" | "minor" | "major";

export interface BehaviorDiffResult {
  sequence_distance: number;
  tool_divergence: number;
  tool_divergence_pct: number;
  change_band?: BehaviorChangeBand;
  baseline_sequence: string[];
  candidate_sequence: string[];
}

export interface ReleaseGateAttempt {
  run_index: number;
  pass: boolean;
  trace_id?: string;
  failure_reasons?: string[];
  baseline_snapshot?: {
    response_preview?: string;
    response_data_keys?: string[];
    response_preview_status?: "ok" | "empty" | "not_captured" | "unknown" | string;
    capture_reason?: string | null;
  };
  signals?: {
    checks: Record<string, string>;
    failed: string[];
    config_version?: string | null;
    details?: Record<string, any>;
  };
  replay?: {
    attempted: number;
    succeeded: number;
    failed: number;
    avg_latency_ms?: number | null;
    failed_snapshot_ids: Array<string | number>;
    error_messages?: string[];
    error_codes?: string[];
    missing_provider_keys?: string[];
  };
  behavior_diff?: BehaviorDiffResult;
  candidate_snapshot?: {
    response_preview_status?: "ok" | "empty" | "tool_calls_only" | "unknown" | string;
    response_extract_path?: string | null;
    response_extract_reason?: string | null;
  };
}

export interface ReleaseGateRunSummary {
  eval_mode?: "replay_test";
  case_status?: "pass" | "fail" | "flaky";
  pass_ratio?: number;
  is_flaky?: boolean;
  is_consistently_failing?: boolean;
  latency_min_ms?: number | null;
  latency_max_ms?: number | null;
  [key: string]: unknown;
}

export interface ReleaseGateViolation {
  rule_id?: string;
  rule_name?: string;
  message?: string;
  step_ref?: string | number | null;
  severity?: "critical" | "high" | "medium" | "low" | string;
  evidence?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ReleaseGateRunResult {
  run_index: number;
  pass: boolean;
  case_status?: "pass" | "fail" | "flaky";
  failure_reasons: string[];
  violation_count_delta: number;
  severity_delta: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  replay: {
    attempted: number;
    succeeded: number;
    failed: number;
    avg_latency_ms?: number | null;
    failed_snapshot_ids: Array<string | number>;
    error_messages?: string[];
    error_codes?: string[];
    missing_provider_keys?: string[];
  };
  summary: ReleaseGateRunSummary;
  violations: ReleaseGateViolation[];
  top_regressed_rules: any[];
  first_broken_step: number | null;
  attempts?: ReleaseGateAttempt[];
  eval_elements_passed?: { rule_id: string; rule_name: string }[];
  eval_elements_failed?: { rule_id: string; rule_name: string; violation_count: number }[];
  trace_id?: string;
}

export interface ReleaseGateResult {
  pass: boolean;
  summary?: string;
  failed_signals?: string[];
  exit_code: 0 | 1;
  report_id: string;
  trace_id: string;
  baseline_trace_id: string;
  failure_reasons: string[];
  thresholds_used: Record<string, number>;
  fail_rate?: number;
  flaky_rate?: number;
  failed_inputs?: number;
  flaky_inputs?: number;
  total_inputs?: number;
  repeat_runs: number;
  replay_error_codes?: string[];
  missing_provider_keys?: string[];
  run_results?: ReleaseGateRunResult[];
  case_results?: ReleaseGateRunResult[];
  evidence_pack: {
    top_regressed_rules: any[];
    first_violations: ReleaseGateViolation[];
    failed_replay_snapshot_ids: Array<string | number>;
    sample_failure_reasons: string[];
  };
}

export interface ReleaseGateHistoryItem {
  id: string;
  status: "pass" | "fail";
  trace_id: string;
  baseline_trace_id?: string | null;
  agent_id?: string | null;
  created_at?: string | null;
  mode?: "replay_test";
  repeat_runs?: number | null;
  passed_runs?: number | null;
  failed_runs?: number | null;
  thresholds?: Record<string, number> | null;
}

export interface ReleaseGateHistoryResponse {
  items: ReleaseGateHistoryItem[];
  total: number;
  limit: number;
  offset: number;
}
