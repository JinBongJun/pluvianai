import { apiClient, unwrapResponse, unwrapArrayResponse } from "./client";

export const ruleMarketAPI = {
  list: async (params?: {
    category?: string;
    rule_type?: string;
    tags?: string;
    search?: string;
    sort?: "popular" | "recent" | "rating";
    limit?: number;
    offset?: number;
  }) => {
    const response = await apiClient.get("/rule-market", { params });
    return unwrapArrayResponse(response);
  },

  getFeatured: async (limit: number = 10) => {
    const response = await apiClient.get("/rule-market/featured", { params: { limit } });
    return unwrapArrayResponse(response);
  },

  get: async (ruleId: number) => {
    const response = await apiClient.get(`/rule-market/${ruleId}`);
    return unwrapResponse(response);
  },

  create: async (rule: {
    name: string;
    description?: string;
    rule_type: "pii" | "toxicity" | "hallucination" | "custom";
    pattern: string;
    pattern_type: "regex" | "keyword" | "ml";
    category?: string;
    tags?: string[];
  }) => {
    const response = await apiClient.post("/rule-market", rule);
    return unwrapResponse(response);
  },

  download: async (ruleId: number, projectId: number) => {
    const response = await apiClient.post(`/rule-market/${ruleId}/download`, {
      project_id: projectId,
    });
    return unwrapResponse(response);
  },

  rate: async (ruleId: number, rating: number) => {
    const response = await apiClient.post(`/rule-market/${ruleId}/rate`, { rating });
    return unwrapResponse(response);
  },
};
