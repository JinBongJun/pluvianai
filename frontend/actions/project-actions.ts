'use server';

import { z } from 'zod';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { ActionState, successResponse, errorResponse } from '@/lib/action-types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ===== Zod 스키마 =====

const createProjectSchema = z.object({
    name: z.string().min(1, '프로젝트 이름을 입력하세요').max(200, '프로젝트 이름은 200자 이하여야 합니다'),
    description: z.string().optional(),
    organizationId: z.number().optional(),
    generateSampleData: z.boolean().optional(),
    usageMode: z.enum(['full', 'test_only']).optional(),
});

const updateProjectSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().optional(),
    usageMode: z.enum(['full', 'test_only']).optional(),
});

// ===== Server Actions =====

/**
 * 프로젝트 생성 Server Action
 */
export async function createProjectAction(
    formData: FormData
): Promise<ActionState<{ id: number; name: string }>> {
    const token = cookies().get('access_token')?.value;
    if (!token) {
        return errorResponse('인증이 필요합니다');
    }

    // 1. 폼 데이터 파싱
    const rawData = {
        name: formData.get('name'),
        description: formData.get('description') || undefined,
        organizationId: formData.get('organizationId') ? Number(formData.get('organizationId')) : undefined,
        generateSampleData: formData.get('generateSampleData') === 'true',
        usageMode: (formData.get('usageMode') as 'full' | 'test_only') || 'full',
    };

    // 2. Zod 검증
    const parsed = createProjectSchema.safeParse(rawData);
    if (!parsed.success) {
        return errorResponse(parsed.error.issues[0].message);
    }

    // 3. API 호출
    try {
        const response = await fetch(`${API_URL}/api/v1/projects`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                name: parsed.data.name,
                description: parsed.data.description,
                organization_id: parsed.data.organizationId,
                generate_sample_data: parsed.data.generateSampleData,
                usage_mode: parsed.data.usageMode,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return errorResponse(errorData?.detail || '프로젝트 생성에 실패했습니다');
        }

        const data = await response.json();

        // 4. 캐시 무효화
        revalidatePath('/organizations/[orgId]/projects', 'page');

        return successResponse({ id: data.id, name: data.name });
    } catch (error) {
        console.error('[createProjectAction] Error:', error);
        return errorResponse('서버 연결에 실패했습니다');
    }
}

/**
 * 프로젝트 수정 Server Action
 */
export async function updateProjectAction(
    projectId: number,
    formData: FormData
): Promise<ActionState<{ id: number; name: string }>> {
    const token = cookies().get('access_token')?.value;
    if (!token) {
        return errorResponse('인증이 필요합니다');
    }

    // 1. 폼 데이터 파싱
    const rawData = {
        name: formData.get('name') || undefined,
        description: formData.get('description') || undefined,
        usageMode: (formData.get('usageMode') as 'full' | 'test_only') || undefined,
    };

    // 2. Zod 검증
    const parsed = updateProjectSchema.safeParse(rawData);
    if (!parsed.success) {
        return errorResponse(parsed.error.issues[0].message);
    }

    // 3. API 호출
    try {
        const body: Record<string, any> = {};
        if (parsed.data.name !== undefined) body.name = parsed.data.name;
        if (parsed.data.description !== undefined) body.description = parsed.data.description;
        if (parsed.data.usageMode !== undefined) body.usage_mode = parsed.data.usageMode;

        const response = await fetch(`${API_URL}/api/v1/projects/${projectId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return errorResponse(errorData?.detail || '프로젝트 수정에 실패했습니다');
        }

        const data = await response.json();

        // 4. 캐시 무효화
        revalidatePath('/organizations/[orgId]/projects', 'page');
        revalidatePath(`/organizations/[orgId]/projects/${projectId}`, 'page');

        return successResponse({ id: data.id, name: data.name });
    } catch (error) {
        console.error('[updateProjectAction] Error:', error);
        return errorResponse('서버 연결에 실패했습니다');
    }
}

/**
 * 프로젝트 삭제 Server Action
 */
export async function deleteProjectAction(projectId: number): Promise<ActionState<void>> {
    const token = cookies().get('access_token')?.value;
    if (!token) {
        return errorResponse('인증이 필요합니다');
    }

    try {
        const response = await fetch(`${API_URL}/api/v1/projects/${projectId}`, {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return errorResponse(errorData?.detail || '프로젝트 삭제에 실패했습니다');
        }

        // 캐시 무효화
        revalidatePath('/organizations/[orgId]/projects', 'page');

        return successResponse(undefined);
    } catch (error) {
        console.error('[deleteProjectAction] Error:', error);
        return errorResponse('서버 연결에 실패했습니다');
    }
}
