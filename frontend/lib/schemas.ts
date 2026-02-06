/**
 * API Response Schemas using Zod for runtime validation
 * This ensures type safety and prevents undefined/null errors
 */
import { z } from 'zod';

// Helper to safely validate and parse
export function safeParse<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  // Zod uses 'issues' instead of 'errors' in the error object
  const errors = result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
  return { success: false, error: `Validation failed: ${errors}` };
}

// Common schemas
export const NumberSchema = z.number().finite().default(0);
export const StringSchema = z.string().default('');
export const DateSchema = z.string().datetime().or(z.string()); // Accept ISO string or any string

// Organization schemas
export const OrganizationStatsSchema = z.object({
  calls_7d: NumberSchema.optional(),
  cost_7d: NumberSchema.optional(),
  alerts_open: NumberSchema.optional(),
  drift_detected: z.boolean().optional(),
  projects: NumberSchema.optional(),
  usage: z
    .object({
      calls: NumberSchema.optional(),
      calls_limit: NumberSchema.optional(),
      cost: NumberSchema.optional(),
      cost_limit: NumberSchema.optional(),
      quality: NumberSchema.optional(),
    })
    .partial()
    .optional(),
  alerts: z
    .array(
      z.object({
        project: z.string().optional(),
        summary: z.string().optional(),
        severity: z.string().optional(),
      }),
    )
    .optional(),
});

export const OrganizationSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  plan_type: z.enum(['free', 'indie', 'startup', 'pro', 'enterprise']).or(z.string()).default('free'),
  stats: OrganizationStatsSchema.nullable().optional(),
});

export const OrganizationProjectStatsSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  calls_24h: NumberSchema.optional(),
  cost_7d: NumberSchema.optional(),
  quality: z.number().nullable().optional(), // Allow null for projects without quality scores
  alerts_open: NumberSchema.optional(),
  drift_detected: z.boolean().optional(),
});

// Project schemas (Design 5.1.5: usage_mode full | test_only)
export const ProjectSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  description: z.string().nullable(),
  owner_id: z.number().int().positive(),
  is_active: z.boolean(),
  role: z.enum(['owner', 'admin', 'member', 'viewer']).optional(),
  organization_id: z.number().int().positive().nullable().optional(),
  usage_mode: z.enum(['full', 'test_only']).optional().default('full'),
});

// API Call schemas
export const APICallSchema = z.object({
  id: z.number().int().positive(),
  project_id: z.number().int().positive(),
  provider: z.string(),
  model: z.string(),
  status_code: z.number().int().nullable().optional(),
  request_tokens: z.number().int().nonnegative().nullable().optional(),
  response_tokens: z.number().int().nonnegative().nullable().optional(),
  latency_ms: z.number().nonnegative().nullable().optional(),
  cost: z.number().nonnegative().nullable().optional(), // Optional - not always returned by backend
  created_at: DateSchema,
  // Backend returns request_data/response_data, frontend may use request_body/response_body
  request_data: z.unknown().nullable().optional(),
  response_data: z.unknown().nullable().optional(),
  request_body: z.unknown().nullable().optional(),
  response_body: z.unknown().nullable().optional(),
  // Additional fields from backend
  agent_name: z.string().nullable().optional(),
  chain_id: z.string().nullable().optional(),
  response_text: z.string().nullable().optional(),
  error_message: z.string().nullable().optional(),
});

// Quality Score schemas - SCHEMA_SPEC.md 기준
export const QualityScoreSchema = z.object({
  id: z.number().int().positive(),
  api_call_id: z.number().int().positive(),
  project_id: z.number().int().positive(),
  overall_score: NumberSchema,
  // LLM 기반 점수
  semantic_consistency_score: NumberSchema.nullable(),
  tone_score: NumberSchema.nullable(),
  coherence_score: NumberSchema.nullable(),
  // 규칙 기반 검증
  json_valid: z.boolean().nullable(),
  required_fields_present: z.boolean().nullable(),
  length_acceptable: z.boolean().nullable().optional(),  // 백엔드 전용 필드
  format_valid: z.boolean().nullable().optional(),       // 백엔드 전용 필드
  // 상세 정보
  evaluation_details: z.unknown().nullable(),
  violations: z.unknown().nullable().optional(),         // 백엔드 전용 필드
  created_at: DateSchema,
});

// Alert schemas
export const AlertSchema = z.object({
  id: z.number().int().positive(),
  project_id: z.number().int().positive(),
  alert_type: z.string(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  title: z.string(),
  message: z.string(),
  alert_data: z.unknown().nullable(),
  is_sent: z.boolean(),
  sent_at: DateSchema.nullable(),
  notification_channels: z.array(z.string()).nullable(),
  is_resolved: z.boolean(),
  resolved_at: DateSchema.nullable(),
  resolved_by: z.number().int().positive().nullable(),
  created_at: DateSchema,
});

// Drift Detection schemas
export const DriftDetectionSchema = z.object({
  id: z.number().int().positive(),
  project_id: z.number().int().positive(),
  detection_type: z.string(),
  model: z.string().nullable(),
  agent_name: z.string().nullable(),
  current_value: NumberSchema.nullable(),
  baseline_value: NumberSchema.nullable(),
  change_percentage: NumberSchema,
  drift_score: NumberSchema,
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  detected_at: DateSchema,
  detection_details: z.unknown().nullable().optional(),
  affected_fields: z.array(z.unknown()).nullable().optional(),
  baseline_period_start: DateSchema.nullable().optional(),
  baseline_period_end: DateSchema.nullable().optional(),
});

// Benchmark/Comparison schemas
export const ModelComparisonSchema = z.object({
  model: z.string(),
  provider: z.string(),
  model_name: z.string(),
  total_calls: NumberSchema,
  avg_quality_score: NumberSchema,
  total_cost: NumberSchema,
  cost_per_call: NumberSchema.optional(),
  avg_cost_per_call: NumberSchema.optional(),
  avg_latency_ms: NumberSchema.optional(),
  avg_latency: NumberSchema.optional(),
  success_rate: NumberSchema,
  recommendation_score: NumberSchema.optional(),
  recommendation: z.string().optional(),
});

// Cost Analysis schemas
export const CostAnalysisSchema = z.object({
  total_cost: NumberSchema,
  by_model: z.record(z.string(), NumberSchema),
  by_provider: z.record(z.string(), NumberSchema),
  by_day: z.array(z.object({
    date: DateSchema,
    cost: NumberSchema,
  })),
  average_daily_cost: NumberSchema,
  cost_trend: z.object({
    percentage_change: NumberSchema,
    is_increasing: z.boolean(),
  }).optional(),
});

// Stats schemas
export const StatsSchema = z.object({
  total_calls: NumberSchema.optional(),
  avg_score: NumberSchema.optional(),
  avg_quality_score: NumberSchema.optional(),
  success_rate: NumberSchema.optional(),
  total_cost: NumberSchema.optional(),
});

// Agent Chain schemas
// SCHEMA_SPEC.md 기준 - 2026-01-31 통일됨
export const AgentStatsSchema = z.object({
  agent_name: z.string(),
  total_calls: NumberSchema,
  successful_calls: NumberSchema,
  failed_calls: NumberSchema,
  success_rate: NumberSchema,  // 0.0 ~ 1.0 (백분율 아님)
  avg_latency_ms: NumberSchema,
});

// ChainProfile - SCHEMA_SPEC.md 기준
export const ChainProfileSchema = z.object({
  // 핵심 필드
  chain_id: z.string(),
  total_calls: NumberSchema,
  successful_calls: NumberSchema,
  failed_calls: NumberSchema,
  success_rate: NumberSchema,  // 0.0 ~ 1.0 (백분율 아님)
  avg_latency_ms: NumberSchema,
  total_cost: NumberSchema,
  avg_cost_per_call: NumberSchema,
  // 확장 필드 (UI용)
  unique_agents: NumberSchema.optional(),
  total_latency_ms: NumberSchema.optional(),
  bottleneck_agent: z.string().nullable().optional(),
  bottleneck_latency_ms: NumberSchema.optional(),
   // Optional severity classification for bottleneck (low/medium/high/critical)
  bottleneck_severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  agents: z.array(AgentStatsSchema).optional().default([]),
  first_call_at: z.string().nullable().optional(),
  last_call_at: z.string().nullable().optional(),
});

// Chain Profile Response - SCHEMA_SPEC.md 기준
export const ChainProfileResponseSchema = z.object({
  total_chains: NumberSchema.optional(),
  successful_chains: NumberSchema.optional(),
  success_rate: NumberSchema.optional(),
  avg_chain_latency_ms: NumberSchema.optional(),
  chains: z.array(ChainProfileSchema).default([]),
  message: z.string().optional(),
});

// Array schemas - use individual item schemas
export const ProjectArraySchema = z.array(ProjectSchema);
export const APICallArraySchema = z.array(APICallSchema);
export const QualityScoreArraySchema = z.array(QualityScoreSchema);
export const AlertArraySchema = z.array(AlertSchema);
export const DriftDetectionArraySchema = z.array(DriftDetectionSchema);
// ModelComparisonArraySchema uses individual ModelComparisonSchema items
export const ModelComparisonArraySchema = ModelComparisonSchema;
export const ChainProfileArraySchema = z.array(ChainProfileSchema);
export const OrganizationArraySchema = z.array(OrganizationSchema);
export const OrganizationProjectArraySchema = z.array(OrganizationProjectStatsSchema);

// Response wrapper schemas (for APIs that return {items: [], total: number})
export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) => z.object({
  items: z.array(itemSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive().optional(),
  offset: z.number().int().nonnegative().optional(),
});
