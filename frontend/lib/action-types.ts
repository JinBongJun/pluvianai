import { z } from "zod";

/**
 * Standard Server Action response type.
 * Success: { success: true, data: T, error: null }
 * Failure: { success: false, data: null, error: string }
 */
export type ActionState<TData = void> =
  | { success: true; data: TData; error: null }
  | { success: false; data: null; error: string };

/**
 * Server Action response type that includes form validation errors.
 * Success: { success: true, data: T, errors: null }
 * Failure: { success: false, data: null, errors: Record<string, string[]> }
 */
export type FormActionState<TData = void> =
  | { success: true; data: TData; errors: null }
  | { success: false; data: null; errors: Record<string, string[]> };

/**
 * Success response helper
 */
export function successResponse<TData>(data: TData): ActionState<TData> {
  return { success: true, data, error: null };
}

/**
 * Error response helper
 */
export function errorResponse(error: string): ActionState<never> {
  return { success: false, data: null, error };
}

/**
 * Convert Zod validation errors to FormActionState
 */
export function zodErrorToFormState(error: z.ZodError): FormActionState<never> {
  const errors: Record<string, string[]> = {};
  error.issues.forEach((err: z.ZodIssue) => {
    const path = err.path.join(".");
    if (!errors[path]) errors[path] = [];
    errors[path].push(err.message);
  });
  return { success: false, data: null, errors };
}

/**
 * Form success response helper
 */
export function formSuccessResponse<TData>(data: TData): FormActionState<TData> {
  return { success: true, data, errors: null };
}

/**
 * Form error response helper (single error message)
 */
export function formErrorResponse(error: string): FormActionState<never> {
  return { success: false, data: null, errors: { _form: [error] } };
}
