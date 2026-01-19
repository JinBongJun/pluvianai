/**
 * Common type definitions shared across the application
 * These types ensure consistency between API responses and frontend usage
 */

/**
 * Safe number type - handles null/undefined
 */
export type SafeNumber = number | null | undefined;

/**
 * Safe string type - handles null/undefined
 */
export type SafeString = string | null | undefined;

/**
 * Safe boolean type - handles null/undefined
 */
export type SafeBoolean = boolean | null | undefined;

/**
 * Common pagination parameters
 */
export interface PaginationParams {
  limit?: number;
  offset?: number;
}

/**
 * Common paginated response
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Common API error response
 */
export interface APIError {
  error: boolean;
  message: string;
  status_code: number;
  details?: unknown;
}

/**
 * Common success response
 */
export interface APISuccess<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
}
