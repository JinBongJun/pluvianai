import { apiClient } from "./client";

export const reportsAPI = {
  generate: async (projectId: number, params: any) => {
    const response = await apiClient.post("/reports/generate", null, {
      params: { project_id: projectId, ...params },
    });
    return response.data;
  },

  download: async (projectId: number, params: any) => {
    try {
      const response = await apiClient.get("/reports/download", {
        params: { project_id: projectId, ...params },
        responseType: "blob",
      });
      const contentType = response.headers["content-type"] || "";
      const format = params.format || "json";
      if (
        format === "json" &&
        contentType.includes("application/json") &&
        response.status < 400
      ) {
        // valid JSON response
      } else if (contentType.includes("application/json") && response.status >= 400) {
        const blob =
          response.data instanceof Blob ? response.data : new Blob([response.data]);
        const text = await blob.text();
        try {
          const errorData = JSON.parse(text);
          const err = new Error(
            errorData.detail || errorData.message || "Failed to download report"
          );
          (err as any).response = response;
          throw err;
        } catch {
          const err = new Error(
            "Failed to download report: " + (text || response.statusText).substring(0, 200)
          );
          (err as any).response = response;
          throw err;
        }
      }
      const fileContentType = format === "pdf" ? "application/pdf" : "application/json";
      const blob =
        response.data instanceof Blob
          ? response.data
          : new Blob([response.data], { type: fileContentType });
      const url = window.URL.createObjectURL(blob);
      try {
        const link = document.createElement("a");
        link.href = url;
        let filename = `report-${projectId}-${params.template || "standard"}-${new Date().toISOString().split("T")[0]}.${format}`;
        const contentDisposition = response.headers["content-disposition"];
        if (contentDisposition) {
          const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
          if (match?.[1]) {
            filename = match[1].replace(/['"]/g, "");
            try {
              filename = decodeURIComponent(filename);
            } catch {
              // use as is
            }
          }
        }
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        link.remove();
      } finally {
        window.URL.revokeObjectURL(url);
      }
    } catch (error: any) {
      if (error.response?.data instanceof Blob) {
        try {
          const text = await error.response.data.text();
          const parsed = JSON.parse(text);
          throw new Error(
            parsed.detail || parsed.message || "Failed to download report"
          );
        } catch (parseError) {
          if (error.message) throw error;
          throw new Error("Failed to download report. Please check server logs for details.");
        }
      }
      throw error;
    }
  },
};
