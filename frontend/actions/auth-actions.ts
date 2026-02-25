'use server';

import { z } from 'zod';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
    FormActionState,
    zodErrorToFormState,
    formSuccessResponse,
    formErrorResponse,
} from '@/lib/action-types';
import { getLoginErrorMessage, getRegisterErrorMessage } from '@/lib/auth-messages';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ===== Zod 스키마 =====

const loginSchema = z.object({
    email: z.string().email('Please enter a valid email address'),
    password: z.string().min(1, 'Please enter your password'),
});

const registerSchema = z.object({
    email: z.string().email('Please enter a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    fullName: z.string().optional(),
    liabilityAgreementAccepted: z.boolean().refine((val) => val === true, {
        message: 'You must accept the clinical protocol',
    }),
});

// ===== Server Actions =====

/**
 * 로그인 Server Action
 * FormData를 받아서 인증 후 토큰을 httpOnly 쿠키에 저장
 */
export async function loginAction(
    prevState: FormActionState<{ access_token: string; refresh_token: string; user_info?: any }> | null,
    formData: FormData
): Promise<FormActionState<{ access_token: string; refresh_token: string; user_info?: any }>> {
    // 1. 폼 데이터 파싱
    const rawData = {
        email: formData.get('email'),
        password: formData.get('password'),
    };

    // 2. Zod 검증
    const parsed = loginSchema.safeParse(rawData);
    if (!parsed.success) {
        return zodErrorToFormState(parsed.error);
    }

    // 3. API 호출
    try {
        const formBody = new FormData();
        formBody.append('username', parsed.data.email);
        formBody.append('password', parsed.data.password);

        console.log('🔵 [loginAction] Sending request to:', `${API_URL}/api/v1/auth/login`);
        console.log('🔵 [loginAction] Email:', parsed.data.email);

        const response = await fetch(`${API_URL}/api/v1/auth/login`, {
            method: 'POST',
            body: formBody,
        });

        console.log('🔵 [loginAction] Response status:', response.status);
        console.log('🔵 [loginAction] Response ok:', response.ok);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const detail = errorData?.detail;
            const msg = getLoginErrorMessage({ status: response.status, detail });
            return formErrorResponse(msg);
        }

        const data = await response.json();
        const { access_token, refresh_token } = data;

        console.log('✅ [loginAction] Login successful, setting cookies');
        console.log('🔵 [loginAction] Token preview:', access_token?.substring(0, 20) + '...');

        // JWT 토큰 디코드하여 사용자 정보 추출
        let userInfo = null;
        try {
            const base64Url = access_token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(
                atob(base64)
                    .split('')
                    .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                    .join('')
            );

            const payload = JSON.parse(jsonPayload);
            console.log('✅ [loginAction] Token decoded, user_id:', payload.sub);

            // payload에서 사용자 정보 추출
            userInfo = {
                id: payload.sub,
                email: parsed.data.email, // 로그인 폼에서 입력한 이메일 사용
                full_name: payload.full_name || parsed.data.email.split('@')[0], // 토큰에 있으면 사용, 없으면 이메일에서 추출
            };
            console.log('✅ [loginAction] User info extracted:', userInfo.email);
        } catch (error) {
            console.error('🔴 [loginAction] Failed to decode token:', error);
        }

        // Set cookies with standard settings
        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax' as const,
            path: '/',
            maxAge: 60 * 60 * 24 * 7, // 7 days
        };

        cookies().set('access_token', access_token, cookieOptions);
        cookies().set('refresh_token', refresh_token, cookieOptions);

        if (userInfo) {
            cookies().set('user_info', JSON.stringify(userInfo), {
                ...cookieOptions,
                httpOnly: false, // Accessible to client
            });
        }

        console.log('✅ [loginAction] Authentication cookies set');
        return formSuccessResponse({
            access_token,
            refresh_token,
            user_info: userInfo
        });
    } catch (error: any) {
        console.error('🔴 [loginAction] Error:', error);
        const msg = getLoginErrorMessage({
            status: error?.response?.status,
            detail: error?.response?.data?.detail,
            message: error?.message,
        });
        return formErrorResponse(msg);
    }
}

/**
 * 회원가입 Server Action
 * 회원가입 성공 후 자동으로 로그인하여 토큰을 쿠키에 저장
 */
export async function registerAction(
    prevState: FormActionState<{ user_id: number; access_token?: string; refresh_token?: string; user_info?: any }> | null,
    formData: FormData
): Promise<FormActionState<{ user_id: number; access_token?: string; refresh_token?: string; user_info?: any }>> {
    // 1. 폼 데이터 파싱
    const rawData = {
        email: formData.get('email'),
        password: formData.get('password'),
        fullName: formData.get('fullName') || undefined,
        liabilityAgreementAccepted: formData.get('liabilityAgreementAccepted') === 'true',
    };

    // 2. Zod 검증
    const parsed = registerSchema.safeParse(rawData);
    if (!parsed.success) {
        return zodErrorToFormState(parsed.error);
    }

    // 3. 회원가입 API 호출
    try {
        const response = await fetch(`${API_URL}/api/v1/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: parsed.data.email,
                password: parsed.data.password,
                full_name: parsed.data.fullName,
                liability_agreement_accepted: parsed.data.liabilityAgreementAccepted,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const msg = getRegisterErrorMessage({ status: response.status, detail: errorData?.detail });
            return formErrorResponse(msg);
        }

        const userData = await response.json();

        // 4. 회원가입 성공 후 자동 로그인
        const loginFormBody = new FormData();
        loginFormBody.append('username', parsed.data.email);
        loginFormBody.append('password', parsed.data.password);

        const loginResponse = await fetch(`${API_URL}/api/v1/auth/login`, {
            method: 'POST',
            body: loginFormBody,
        });

        if (!loginResponse.ok) {
            // 로그인 실패해도 회원가입은 성공했으므로 성공 응답 반환
            console.error('[registerAction] Auto-login failed');
            return formSuccessResponse({ user_id: userData.id });
        }

        const loginData = await loginResponse.json();
        const { access_token, refresh_token } = loginData;

        // 5. 쿠키에 토큰 저장
        cookies().set('access_token', access_token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 7, // 7일
        });
        cookies().set('refresh_token', refresh_token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 30, // 30일
        });

        // 리턴 데이터에 토큰 포함 (클라이언트 사이드 localStorage 저장용)
        return formSuccessResponse({ user_id: userData.id, access_token, refresh_token });
    } catch (error: any) {
        console.error('[registerAction] Error:', error);
        const msg = getRegisterErrorMessage({
            status: error?.response?.status,
            detail: error?.response?.data?.detail,
            message: error?.message,
        });
        return formErrorResponse(msg);
    }
}

/**
 * 로그아웃 Server Action
 * 쿠키를 삭제하고 로그인 페이지로 리다이렉트
 */
export async function logoutAction(): Promise<void> {
    cookies().delete('access_token');
    cookies().delete('refresh_token');
    cookies().delete('user_info');
    redirect('/login');
}

/**
 * 현재 사용자 정보 조회 (Server Component에서 사용)
 */
export async function getCurrentUser() {
    const token = cookies().get('access_token')?.value;
    console.log('🔵 [getCurrentUser] Token exists:', !!token);
    console.log('🔵 [getCurrentUser] Token length:', token?.length || 0);

    if (!token) {
        console.log('🔴 [getCurrentUser] No token found in cookies');
        return null;
    }

    try {
        console.log('🔵 [getCurrentUser] Calling API:', `${API_URL}/api/v1/auth/me`);
        const response = await fetch(`${API_URL}/api/v1/auth/me`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
            cache: 'no-store', // 항상 최신 정보 가져오기
        });

        console.log('🔵 [getCurrentUser] Response status:', response.status);
        console.log('🔵 [getCurrentUser] Response ok:', response.ok);

        if (!response.ok) {
            console.log('🔴 [getCurrentUser] Response not ok, returning null');
            return null;
        }

        const user = await response.json();
        console.log('✅ [getCurrentUser] User retrieved:', user.email);
        return user;
    } catch (error) {
        console.error('🔴 [getCurrentUser] Error:', error);
        return null;
    }
}
