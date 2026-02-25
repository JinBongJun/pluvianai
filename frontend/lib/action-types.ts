import { z } from 'zod';

/**
 * 표준 Server Action 응답 타입
 * 성공 시: { success: true, data: T, error: null }
 * 실패 시: { success: false, data: null, error: string }
 */
export type ActionState<TData = void> =
    | { success: true; data: TData; error: null }
    | { success: false; data: null; error: string };

/**
 * 폼 검증 에러를 포함하는 Server Action 응답 타입
 * 성공 시: { success: true, data: T, errors: null }
 * 실패 시: { success: false, data: null, errors: Record<string, string[]> }
 */
export type FormActionState<TData = void> =
    | { success: true; data: TData; errors: null }
    | { success: false; data: null; errors: Record<string, string[]> };

/**
 * 성공 응답 헬퍼 함수
 */
export function successResponse<TData>(data: TData): ActionState<TData> {
    return { success: true, data, error: null };
}

/**
 * 실패 응답 헬퍼 함수
 */
export function errorResponse(error: string): ActionState<never> {
    return { success: false, data: null, error };
}

/**
 * Zod 검증 에러를 FormActionState로 변환
 */
export function zodErrorToFormState(error: z.ZodError): FormActionState<never> {
    const errors: Record<string, string[]> = {};
    error.issues.forEach((err: z.ZodIssue) => {
        const path = err.path.join('.');
        if (!errors[path]) errors[path] = [];
        errors[path].push(err.message);
    });
    return { success: false, data: null, errors };
}

/**
 * 폼 성공 응답 헬퍼 함수
 */
export function formSuccessResponse<TData>(data: TData): FormActionState<TData> {
    return { success: true, data, errors: null };
}

/**
 * 폼 실패 응답 헬퍼 함수 (단일 에러 메시지)
 */
export function formErrorResponse(error: string): FormActionState<never> {
    return { success: false, data: null, errors: { _form: [error] } };
}
