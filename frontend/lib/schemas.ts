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
  type: z.string().nullable().optional(),
  plan_type: z.enum(['free', 'pro', 'enterprise']).or(z.string()).default('free'),
  stats: OrganizationStatsSchema.optional(),
});

export const OrganizationProjectStatsSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  calls_24h: NumberSchema.optional(),
  cost_7d: NumberSchema.optional(),
  quality: NumberSchema.optional(),
  alerts_open: NumberSchema.optional(),
  drift_detected: z.boolean().optional(),
});

// Project schemas
export const ProjectSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  description: z.string().nullable(),
  owner_id: z.number().int().positive(),
  is_active: z.boolean(),
  role: z.enum(['owner', 'admin', 'member', 'viewer']).optional(),
});

// API Call schemas
export const APICallSchema = z.object({
  id: z.number().int().positive(),
  project_id: z.number().int().positive(),
  provider: z.string(),
  model: z.string(),
  status_code: z.number().int().nullable(),
  request_tokens: z.number().int().nonnegative().nullable(),
  response_tokens: z.number().int().nonnegative().nullable(),
  latency_ms: z.number().nonnegative().nullable(),
  cost: z.number().nonnegative().nullable(),
  created_at: DateSchema,
  request_body: z.unknown().nullable(),
  response_body: z.unknown().nullable(),
});

// Quality Score schemas
export const QualityScoreSchema = z.object({
  id: z.number().int().positive(),
  api_call_id: z.number().int().positive(),
  project_id: z.number().int().positive(),
  overall_score: NumberSchema,
  semantic_consistency_score: NumberSchema.nullable(),
  tone_score: NumberSchema.nullable(),
  coherence_score: NumberSchema.nullable(),
  json_valid: z.boolean().nullable(),
  required_fields_present: z.boolean().nullable(),
  evaluation_details: z.unknown().nullable(),
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
export const AgentStatsSchema = z.object({
  agent_name: z.string(),
  call_count: NumberSchema,
  total_latency_ms: NumberSchema,
  avg_latency_ms: NumberSchema,
  failure_count: NumberSchema,
  failure_rate: NumberSchema,
  avg_quality_score: NumberSchema.optional(),
});

export const ChainProfileSchema = z.object({
  chain_id: z.string(),
  total_steps: NumberSchema,
  unique_agents: NumberSchema,
  total_latency: NumberSchema,
  avg_latency_per_step: NumberSchema,
  success: z.boolean().default(false),
  success_rate: NumberSchema,
  failure_count: NumberSchema,
  bottleneck_agent: z.string().nullable().default(null),
  bottleneck_latency_ms: NumberSchema,
  agents: z.array(AgentStatsSchema).default([]),
});

// Chain Profile Response (wraps chains array)
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
