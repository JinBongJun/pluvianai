import { apiClient, logWarn } from "./client";
import { CostAnalysisSchema } from "@/lib/schemas";

export const costAPI = {
  getAnalysis: async (projectId: number, days: number = 7) => {
    if (!projectId || isNaN(projectId) || projectId <= 0) {
      throw new Error(`Invalid project ID: ${projectId}`);
    }
    const validatedDays = Math.min(Math.max(1, days), 30);
    const response = await apiClient.get("/cost/analysis", {
      params: { project_id: Number(projectId), days: validatedDays },
    });
    try {
      return CostAnalysisSchema.parse(response.data);
    } catch (error) {
      logWarn("[API Validation] Cost analysis schema mismatch, using defaults", { error });
      return {
        total_cost: 0,
        by_model: {},
        by_provider: {},
        by_day: [],
        average_daily_cost: 0,
      };
    }
  },

  detectAnomalies: async (projectId: number) => {
    const response = await apiClient.post("/cost/detect-anomalies", null, {
      params: { project_id: projectId },
    });
    return response.data;
  },

  compareModels: async (projectId: number, days: number = 7) => {
    const response = await apiClient.get("/cost/compare-models", {
      params: { project_id: projectId, days },
    });
    return response.data;
  },

  getOptimizations: async (projectId: number, days: number = 30) => {
    if (!projectId || isNaN(projectId) || projectId <= 0) {
      throw new Error(`Invalid project ID: ${projectId}`);
    }
    const response = await apiClient.get("/cost/optimizations", {
      params: { project_id: Number(projectId), days },
    });
    return response.data;
  },

  getPredictions: async (
    projectId: number,
    days: number = 30,
    predictionDays: number = 30
  ) => {
    if (!projectId || isNaN(projectId) || projectId <= 0) {
      throw new Error(`Invalid project ID: ${projectId}`);
    }
    const response = await apiClient.get("/cost/predictions", {
      params: { project_id: Number(projectId), days, prediction_days: predictionDays },
    });
    return response.data;
  },

  applyOptimization: async (
    projectId: number,
    optimizationId: string,
    userConfirmation: boolean = true
  ) => {
    if (!projectId || isNaN(projectId) || projectId <= 0) {
      throw new Error(`Invalid project ID: ${projectId}`);
    }
    const response = await apiClient.post(
      "/cost/optimizations/apply",
      {
        optimization_id: optimizationId,
        user_confirmation: userConfirmation,
      },
      {
        params: { project_id: Number(projectId) },
      }
    );
    return response.data;
  },
};
