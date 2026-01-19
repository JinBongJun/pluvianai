/**
 * API Response Validation Utilities
 * Validates API responses at runtime to catch schema mismatches early
 */
import { safeParse } from './schemas';
import type { z } from 'zod';

/**
 * Validates and normalizes API response data
 * Returns validated data or throws a descriptive error
 */
export function validateResponse<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  endpoint: string
): T {
  const result = safeParse(schema, data);
  
  if (!result.success) {
    console.error(`[API Validation Error] ${endpoint}:`, result.error);
    console.error('Raw response data:', data);
    
    // In production, log to error tracking (e.g., Sentry)
    if (typeof window !== 'undefined' && (window as any).Sentry) {
      (window as any).Sentry.captureException(new Error(result.error), {
        extra: { endpoint, data },
      });
    }
    
    // Try to return a safe default or throw if critical
    throw new Error(`Invalid API response from ${endpoint}: ${result.error}`);
  }
  
  return result.data;
}

/**
 * Validates array response - returns empty array on validation failure
 * Useful for non-critical endpoints where we can degrade gracefully
 */
export function validateArrayResponse<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  endpoint: string
): T[] {
  if (!Array.isArray(data)) {
    console.warn(`[API Validation Warning] ${endpoint}: Expected array, got ${typeof data}`);
    return [] as T[];
  }
  
  const results: T[] = [];
  const errors: string[] = [];
  
  for (let index = 0; index < data.length; index++) {
    const item = data[index];
    const result = safeParse(schema, item);
    if (result.success) {
      results.push(result.data);
    } else {
      errors.push(`Item ${index}: ${result.error}`);
      // Try to include the item anyway if validation fails (graceful degradation)
      // This prevents breaking the UI while still logging the issue
      results.push(item as T);
    }
  }
  
  if (errors.length > 0) {
    console.warn(`[API Validation Warning] ${endpoint}: ${errors.length} invalid items:`, errors);
    
    if (typeof window !== 'undefined' && (window as any).Sentry) {
      (window as any).Sentry.captureMessage(`Partial validation failure in ${endpoint}`, {
        level: 'warning',
        extra: { endpoint, errors, validCount: results.length - errors.length, totalCount: data.length },
      });
    }
  }
  
  return results as T[];
}

/**
 * Normalizes model comparison data (handles field name variations)
 */
export function normalizeModelComparison(data: unknown): any {
  if (!data || typeof data !== 'object') {
    return {
      recommendation_score: 0,
      success_rate: 0,
      total_calls: 0,
      cost_per_call: 0,
      avg_cost_per_call: 0,
      avg_latency_ms: 0,
      avg_latency: 0,
    };
  }
  
  const obj = data as any;
  return {
    ...obj,
    recommendation_score: typeof obj.recommendation_score === 'number' ? obj.recommendation_score : 0,
    success_rate: typeof obj.success_rate === 'number' ? obj.success_rate : 0,
    total_calls: typeof obj.total_calls === 'number' ? obj.total_calls : 0,
    cost_per_call: typeof obj.cost_per_call === 'number' ? obj.cost_per_call : (typeof obj.avg_cost_per_call === 'number' ? obj.avg_cost_per_call : 0),
    avg_cost_per_call: typeof obj.avg_cost_per_call === 'number' ? obj.avg_cost_per_call : (typeof obj.cost_per_call === 'number' ? obj.cost_per_call : 0),
    avg_latency_ms: typeof obj.avg_latency_ms === 'number' ? obj.avg_latency_ms : (typeof obj.avg_latency === 'number' ? obj.avg_latency * 1000 : 0),
    avg_latency: typeof obj.avg_latency === 'number' ? obj.avg_latency : (typeof obj.avg_latency_ms === 'number' ? obj.avg_latency_ms / 1000 : 0),
  };
}

/**
 * Safely extracts number from unknown value
 */
export function safeNumber(value: unknown, fallback: number = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}
