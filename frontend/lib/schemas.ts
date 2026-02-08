// Type definitions and schemas for AgentGuard
import { z } from 'zod';

export interface User {
  id: number;
  email: string;
  full_name: string;
  is_active: boolean;
  created_at: string;
}

export interface Organization {
  id: number;
  name: string;
  owner_id: number;
  created_at: string;
}

export interface Project {
  id: number;
  name: string;
  description: string | null;
  organization_id: number;
  owner_id: number;
  is_active: boolean;
  created_at: string;
}

export interface Agent {
  id: number;
  name: string;
  description: string | null;
  project_id: number;
  model: string;
  temperature: number;
  max_tokens: number;
  created_at: string;
}

export interface Snapshot {
  id: number;
  project_id: number;
  agent_id: number;
  input_data: any;
  output_data: any;
  metadata: any;
  status: 'success' | 'error' | 'pending';
  created_at: string;
}

export interface Signal {
  id: string;
  name?: string;      // API Name / UI Display
  label?: string;     // UI Display Alias
  type: string;       // rule, metric, etc.
  enabled?: boolean;  // API specific
  config?: any;       // Configuration data
  value?: any;        // UI Value / Result
  editable?: boolean; // UI specific
}

export interface TestCase {
  id: string;
  input: any;
  expected_output?: any;
  metadata?: any;
}

export interface EvaluationResult {
  test_case_id: string;
  status: 'pass' | 'fail' | 'error';
  signals: {
    [key: string]: {
      passed: boolean;
      value: any;
      threshold?: any;
    };
  };
  output: any;
  latency: number;
  cost: number;
  tokens: number;
}

// Zod Schemas for API validation
export const CostAnalysisSchema = z.object({
  total_cost: z.number(),
  by_model: z.record(z.string(), z.number()),
  by_provider: z.record(z.string(), z.number()),
  by_day: z.array(z.any()),
  average_daily_cost: z.number(),
});

export const QualityScoreSchema = z.object({
  id: z.number(),
  score: z.number(),
  created_at: z.string(),
}).passthrough();

export const DriftDetectionSchema = z.object({
  id: z.number(),
  detected_at: z.string(),
  drift_score: z.number(),
}).passthrough();

export const ProjectSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  organization_id: z.number(),
  owner_id: z.number(),
  is_active: z.boolean(),
  created_at: z.string(),
}).passthrough();

export const APICallSchema = z.object({
  id: z.number(),
  project_id: z.number(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  status_code: z.number().nullable(),
  latency_ms: z.number().nullable(),
  request_tokens: z.number().nullable(),
  response_tokens: z.number().nullable(),
  agent_name: z.string().nullable(),
  created_at: z.string(),
}).passthrough();

export const AlertSchema = z.object({
  id: z.number(),
  project_id: z.number(),
  type: z.string(),
  severity: z.string(),
  message: z.string(),
  created_at: z.string(),
  resolved_at: z.string().nullable(),
}).passthrough();

export const OrganizationSchema = z.object({
  id: z.union([z.number(), z.string()]),
  name: z.string(),
  plan_type: z.string().optional(),
  plan: z.string().optional(),
  stats: z.any().optional(),
  projects_count: z.number().optional(),
  projects: z.number().optional(),
}).passthrough();

export const OrganizationArraySchema = z.array(OrganizationSchema);

export const OrganizationProjectStatsSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable().optional(),
  calls_24h: z.number().optional(),
  calls24h: z.number().optional(),
  cost_7d: z.number().optional(),
  cost7d: z.number().optional(),
  quality: z.number().nullable().optional(),
  quality_score: z.number().nullable().optional(),
  alerts_open: z.number().optional(),
  alerts: z.number().optional(),
  drift_detected: z.boolean().optional(),
  drift: z.boolean().optional(),
}).passthrough();

export const OrganizationProjectArraySchema = z.array(OrganizationProjectStatsSchema);
