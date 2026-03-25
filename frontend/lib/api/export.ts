import { apiClient } from "./client";

export const exportAPI = {
  exportCSV: async (projectId: number, filters?: any) => {
    const response = await apiClient.get("/export/csv", {
      params: { project_id: projectId, ...filters },
      responseType: "blob",
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `api-calls-${projectId}-${new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  exportJSON: async (projectId: number, filters?: any, includeData: boolean = false) => {
    const response = await apiClient.get("/export/json", {
      params: { project_id: projectId, include_data: includeData, ...filters },
    });
    const dataStr = JSON.stringify(response.data, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = window.URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `api-calls-${projectId}-${new Date().toISOString().split("T")[0]}.json`
    );
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};
