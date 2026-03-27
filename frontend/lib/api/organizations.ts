import type { PlanType, OrganizationSummary, OrganizationDetail, OrganizationProject } from "./types";
import { apiClient, unwrapResponse, logWarn } from "./client";
import { validateArrayResponse } from "@/lib/validate";
import { OrganizationSchema, OrganizationProjectStatsSchema } from "@/lib/schemas";

const normalizePlan = (plan?: string): PlanType => {
  const normalized = (plan || "free").toLowerCase();
  if (normalized === "free") return "free";
  if (normalized === "starter" || normalized === "indie" || normalized === "startup") return "starter";
  if (normalized === "pro") return "pro";
  if (normalized === "enterprise") return "enterprise";
  return "free";
};

const normalizeOrganization = (org: any): OrganizationSummary => {
  const stats = org?.stats || {};
  return {
    id: org?.id,
    name: org?.name || "Untitled organization",
    plan: normalizePlan(org?.plan_type || org?.plan),
    projects: stats.projects ?? org?.projects_count ?? org?.projects ?? 0,
    calls7d: stats.calls_7d ?? org?.calls_7d,
    cost7d: stats.cost_7d ?? org?.cost_7d,
    alertsOpen: stats.alerts_open ?? org?.alerts ?? org?.alerts_open,
    driftDetected: stats.drift_detected ?? org?.drift_detected ?? false,
  };
};

const normalizeOrganizationDetail = (org: any): OrganizationDetail => {
  const base = normalizeOrganization(org);
  const usage = org?.stats?.usage || org?.usage || {};
  return {
    ...base,
    usage: {
      calls: usage.calls ?? usage.calls_7d ?? 0,
      callsLimit: usage.calls_limit ?? usage.callsLimit ?? 0,
      cost: usage.cost ?? usage.cost_7d ?? 0,
      costLimit: usage.cost_limit ?? usage.costLimit ?? 0,
      quality: usage.quality ?? 0,
    },
    alerts: org?.stats?.alerts || org?.alerts || [],
  };
};

const normalizeOrganizationProject = (project: any): OrganizationProject => ({
  id: project?.id,
  name: project?.name || "Untitled project",
  description: project?.description || null,
  calls24h: project?.calls_24h ?? project?.calls24h ?? 0,
  cost7d: project?.cost_7d ?? project?.cost7d ?? 0,
  quality: project?.quality ?? project?.quality_score ?? null,
  alerts: project?.alerts_open ?? project?.alerts ?? 0,
  drift: project?.drift_detected ?? project?.drift ?? false,
});

export const organizationsAPI = {
  create: async (data: { name: string; description?: string | null; plan_type?: PlanType }) => {
    const response = await apiClient.post("/organizations", {
      name: data.name,
      description: data.description ?? null,
      plan_type: data.plan_type ?? "free",
    });
    try {
      const parsed = OrganizationSchema.parse(response.data);
      return normalizeOrganizationDetail(parsed);
    } catch (error) {
      logWarn("[API Validation] Organization create schema mismatch", { error });
      return normalizeOrganizationDetail(response.data);
    }
  },

  list: async (options?: { includeStats?: boolean; search?: string }) => {
    const response = await apiClient.get("/organizations", {
      params: {
        include_stats: options?.includeStats,
        search: options?.search,
      },
    });
    const validated = validateArrayResponse(OrganizationSchema, response.data, "/organizations");
    return validated.map(normalizeOrganization);
  },

  get: async (id: number | string, options?: { includeStats?: boolean }) => {
    const response = await apiClient.get(`/organizations/${id}`, {
      params: { include_stats: options?.includeStats },
    });
    const data = unwrapResponse(response) ?? response.data;
    if (data == null || (typeof data === "object" && !("id" in data))) {
      throw new Error("Organization data is missing");
    }
    try {
      const parsed = OrganizationSchema.parse(data);
      return normalizeOrganizationDetail(parsed);
    } catch (error) {
      logWarn("[API Validation] Organization schema mismatch", { error });
      return normalizeOrganizationDetail(data);
    }
  },

  listProjects: async (
    id: number | string,
    options?: { includeStats?: boolean; search?: string }
  ) => {
    const response = await apiClient.get(`/organizations/${id}/projects`, {
      params: {
        include_stats: options?.includeStats,
        search: options?.search,
      },
    });
    const data = unwrapResponse(response) ?? response.data;
    const validated = validateArrayResponse(
      OrganizationProjectStatsSchema,
      Array.isArray(data) ? data : (data?.items ?? data?.data ?? []),
      `/organizations/${id}/projects`
    );
    return validated.map(normalizeOrganizationProject);
  },

  update: async (id: number | string, data: { name?: string }) => {
    const response = await apiClient.patch(`/organizations/${id}`, data);
    return response.data;
  },

  delete: async (id: number | string) => {
    await apiClient.delete(`/organizations/${id}`);
  },

  listMembers: async (id: number | string) => {
    const response = await apiClient.get(`/organizations/${id}/members`);
    return response.data;
  },

  inviteMember: async (id: number | string, data: { email: string; role: string }) => {
    const response = await apiClient.post(`/organizations/${id}/members`, data);
    return response.data;
  },

  removeMember: async (orgId: number | string, memberId: number) => {
    await apiClient.delete(`/organizations/${orgId}/members/${memberId}`);
  },
};
