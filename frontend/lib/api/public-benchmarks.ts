import { apiClient, unwrapResponse, unwrapArrayResponse } from "./client";

export const publicBenchmarksAPI = {
  list: async (params?: {
    category?: string;
    benchmark_type?: string;
    tags?: string;
    search?: string;
    sort?: "recent" | "popular" | "featured";
    limit?: number;
    offset?: number;
  }) => {
    const response = await apiClient.get("/public/benchmarks", { params });
    return unwrapArrayResponse(response);
  },

  getFeatured: async (limit: number = 10) => {
    const response = await apiClient.get("/public/benchmarks/featured", { params: { limit } });
    return unwrapArrayResponse(response);
  },

  get: async (benchmarkId: number) => {
    const response = await apiClient.get(`/public/benchmarks/${benchmarkId}`);
    return unwrapResponse(response);
  },

  publish: async (benchmark: {
    name: string;
    description?: string;
    benchmark_type: "model_comparison" | "task_performance";
    benchmark_data: any;
    test_cases_count: number;
    category?: string;
    tags?: string[];
  }) => {
    const response = await apiClient.post("/benchmarks/publish", benchmark);
    return unwrapResponse(response);
  },
};
