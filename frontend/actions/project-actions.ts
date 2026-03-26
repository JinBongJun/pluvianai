"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ActionState, successResponse, errorResponse } from "@/lib/action-types";
import { logger } from "@/lib/logger";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ===== Zod schemas =====

const createProjectSchema = z.object({
  name: z
    .string()
    .min(1, "Project name is required")
    .max(200, "Project name must be 200 characters or less"),
  description: z.string().optional(),
  organizationId: z.number().optional(),
  generateSampleData: z.boolean().optional(),
  usageMode: z.enum(["full", "test_only"]).optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  usageMode: z.enum(["full", "test_only"]).optional(),
});

// ===== Server Actions =====

/**
 * Create project Server Action
 */
export async function createProjectAction(
  formData: FormData
): Promise<ActionState<{ id: number; name: string }>> {
  const token = cookies().get("access_token")?.value;
  if (!token) {
    return errorResponse("Authentication required");
  }

  // 1. Parse form data
  const rawData = {
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    organizationId: formData.get("organizationId")
      ? Number(formData.get("organizationId"))
      : undefined,
    generateSampleData: formData.get("generateSampleData") === "true",
    usageMode: (formData.get("usageMode") as "full" | "test_only") || "full",
  };

  // 2. Zod validation
  const parsed = createProjectSchema.safeParse(rawData);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0].message);
  }

  // 3. Call API
  try {
    const response = await fetch(`${API_URL}/api/v1/projects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
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
      return errorResponse(errorData?.detail || "Failed to create project");
    }

    const data = await response.json();

    // 4. Invalidate cache
    revalidatePath("/organizations/[orgId]/projects", "page");

    return successResponse({ id: data.id, name: data.name });
  } catch (error) {
    logger.error("createProjectAction failed", error);
    return errorResponse("Failed to connect to server");
  }
}

/**
 * Update project Server Action
 */
export async function updateProjectAction(
  projectId: number,
  formData: FormData
): Promise<ActionState<{ id: number; name: string }>> {
  const token = cookies().get("access_token")?.value;
  if (!token) {
    return errorResponse("Authentication required");
  }

  // 1. Parse form data
  const rawData = {
    name: formData.get("name") || undefined,
    description: formData.get("description") || undefined,
    usageMode: (formData.get("usageMode") as "full" | "test_only") || undefined,
  };

  // 2. Zod validation
  const parsed = updateProjectSchema.safeParse(rawData);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0].message);
  }

  // 3. Call API
  try {
    const body: Record<string, any> = {};
    if (parsed.data.name !== undefined) body.name = parsed.data.name;
    if (parsed.data.description !== undefined) body.description = parsed.data.description;
    if (parsed.data.usageMode !== undefined) body.usage_mode = parsed.data.usageMode;

    const response = await fetch(`${API_URL}/api/v1/projects/${projectId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return errorResponse(errorData?.detail || "Failed to update project");
    }

    const data = await response.json();

    // 4. Invalidate cache
    revalidatePath("/organizations/[orgId]/projects", "page");
    revalidatePath(`/organizations/[orgId]/projects/${projectId}`, "page");

    return successResponse({ id: data.id, name: data.name });
  } catch (error) {
    logger.error("updateProjectAction failed", error);
    return errorResponse("Failed to connect to server");
  }
}

/**
 * Delete project Server Action
 */
export async function deleteProjectAction(projectId: number): Promise<ActionState<void>> {
  const token = cookies().get("access_token")?.value;
  if (!token) {
    return errorResponse("Authentication required");
  }

  try {
    const response = await fetch(`${API_URL}/api/v1/projects/${projectId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return errorResponse(errorData?.detail || "Failed to delete project");
    }

    // Invalidate cache
    revalidatePath("/organizations/[orgId]/projects", "page");

    return successResponse(undefined);
  } catch (error) {
    logger.error("deleteProjectAction failed", error);
    return errorResponse("Failed to connect to server");
  }
}
