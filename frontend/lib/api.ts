/**
 * API client for AgentGuard backend
 */
import axios from 'axios';
import { toNumber } from '@/lib/format';
import { validateArrayResponse, normalizeModelComparison } from '@/lib/validate';
import {
  ModelComparisonSchema,
  CostAnalysisSchema,
  QualityScoreSchema,
  DriftDetectionSchema,
  ChainProfileSchema,
  ChainProfileResponseSchema,
  ProjectSchema,
  APICallSchema,
  AlertSchema,
} from '@/lib/schemas';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const apiClient = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle token refresh on 401
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      const refreshToken = localStorage.getItem('refresh_token');
      if (refreshToken) {
        try {
          const response = await axios.post(`${API_URL}/api/v1/auth/refresh`, {
            refresh_token: refreshToken,
          });
          
          const { access_token, refresh_token } = response.data;
          localStorage.setItem('access_token', access_token);
          localStorage.setItem('refresh_token', refresh_token);
          
          originalRequest.headers.Authorization = `Bearer ${access_token}`;
          return apiClient(originalRequest);
        } catch (refreshError) {
          // Refresh failed, redirect to login
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          window.location.href = '/login';
          return Promise.reject(refreshError);
        }
      }
    }
    
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  register: async (email: string, password: string, fullName?: string) => {
    const response = await apiClient.post('/auth/register', {
      email,
      password,
      full_name: fullName,
    });
    return response.data;
  },
  
  login: async (email: string, password: string) => {
    const formData = new FormData();
    formData.append('username', email);
    formData.append('password', password);
    
    const response = await axios.post(`${API_URL}/api/v1/auth/login`, formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    
    const { access_token, refresh_token } = response.data;
    localStorage.setItem('access_token', access_token);
    localStorage.setItem('refresh_token', refresh_token);
    
    return response.data;
  },
  
  logout: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  },
  
  getCurrentUser: async () => {
    const response = await apiClient.get('/auth/me');
    return response.data;
  },
};

// Projects API
export const projectsAPI = {
  list: async (search?: string) => {
    const params = search ? { search } : {};
    const response = await apiClient.get('/projects', { params });
    // Validate array response
    return validateArrayResponse(
      ProjectSchema,
      response.data,
      '/projects'
    );
  },
  
  get: async (id: number) => {
    const response = await apiClient.get(`/projects/${id}`);
    // Validate single item response
    try {
      return ProjectSchema.parse(response.data);
    } catch (error) {
      console.warn(`[API Validation] Project ${id} schema mismatch:`, error);
      return response.data; // Return raw data on validation failure
    }
  },
  
  create: async (data: { name: string; description?: string; generate_sample_data?: boolean }) => {
    const response = await apiClient.post('/projects', {
      name: data.name,
      description: data.description,
      generate_sample_data: data.generate_sample_data,
    });
    return response.data;
  },
  
  update: async (id: number, name?: string, description?: string) => {
    const response = await apiClient.patch(`/projects/${id}`, {
      name,
      description,
    });
    return response.data;
  },
  
  delete: async (id: number) => {
    await apiClient.delete(`/projects/${id}`);
  },
};

// Project Members API
export const projectMembersAPI = {
  list: async (projectId: number) => {
    const response = await apiClient.get(`/projects/${projectId}/members`);
    return response.data;
  },
  
  add: async (projectId: number, userEmail: string, role: 'admin' | 'member' | 'viewer') => {
    const response = await apiClient.post(`/projects/${projectId}/members`, {
      user_email: userEmail,
      role,
    });
    return response.data;
  },
  
  updateRole: async (projectId: number, userId: number, role: 'admin' | 'member' | 'viewer') => {
    const response = await apiClient.patch(`/projects/${projectId}/members/${userId}`, {
      role,
    });
    return response.data;
  },
  
  remove: async (projectId: number, userId: number) => {
    await apiClient.delete(`/projects/${projectId}/members/${userId}`);
  },
};

// API Calls API
export const apiCallsAPI = {
  list: async (projectId: number, params?: any) => {
    // Validate projectId
    if (!projectId || isNaN(projectId) || projectId <= 0) {
      throw new Error(`Invalid project ID: ${projectId}`);
    }
    // Ensure limit doesn't exceed backend max (1000)
    const validatedParams = {
      ...params,
      limit: params?.limit ? Math.min(params.limit, 1000) : 100,
    };
    const response = await apiClient.get('/api-calls', {
      params: { project_id: Number(projectId), ...validatedParams },
    });
    // Validate array response - use item schema, not array schema
    return validateArrayResponse(
      APICallSchema,
      response.data,
      '/api-calls'
    );
  },
  
  get: async (id: number) => {
    const response = await apiClient.get(`/api-calls/${id}`);
    // Validate single item response
    try {
      return APICallSchema.parse(response.data);
    } catch (error) {
      console.warn(`[API Validation] API call ${id} schema mismatch:`, error);
      return response.data; // Return raw data on validation failure
    }
  },
  
  getStats: async (projectId: number, days: number = 7) => {
    // Validate projectId
    if (!projectId || isNaN(projectId) || projectId <= 0) {
      throw new Error(`Invalid project ID: ${projectId}`);
    }
    // Validate days
    if (days < 1 || days > 30) {
      days = 7; // Default to 7 if invalid
    }
    const response = await apiClient.get('/api-calls/stats', {
      params: { project_id: Number(projectId), days: Number(days) },
    });
    return response.data;
  },
};

// Quality API
export const qualityAPI = {
  evaluate: async (projectId: number, request: any) => {
    const response = await apiClient.post('/quality/evaluate', request, {
      params: { project_id: projectId },
    });
    return response.data;
  },
  
  getScores: async (projectId: number, params?: any) => {
    const response = await apiClient.get('/quality/scores', {
      params: { project_id: projectId, ...params },
    });
    // Validate array response - use item schema, not array schema
    return validateArrayResponse(
      QualityScoreSchema,
      response.data,
      '/quality/scores'
    );
  },
  
  getStats: async (projectId: number, days: number = 7) => {
    const response = await apiClient.get('/quality/stats', {
      params: { project_id: projectId, days },
    });
    return response.data;
  },
};

// Drift API
export const driftAPI = {
  detect: async (projectId: number, request: any) => {
    const response = await apiClient.post('/drift/detect', request, {
      params: { project_id: projectId },
    });
    return response.data;
  },
  
  list: async (projectId: number, params?: any) => {
    const response = await apiClient.get('/drift', {
      params: { project_id: projectId, ...params },
    });
    // Validate array response - use item schema, not array schema
    return validateArrayResponse(
      DriftDetectionSchema,
      response.data,
      '/drift'
    );
  },
  
  get: async (id: number) => {
    const response = await apiClient.get(`/drift/${id}`);
    // Validate single item response
    try {
      return DriftDetectionSchema.parse(response.data);
    } catch (error) {
      console.warn(`[API Validation] Drift detection ${id} schema mismatch:`, error);
      return response.data; // Return raw data on validation failure
    }
  },
};

// Alerts API
export const alertsAPI = {
  list: async (projectId: number, params?: any) => {
    // Validate projectId
    if (!projectId || isNaN(projectId) || projectId <= 0) {
      throw new Error(`Invalid project ID: ${projectId}`);
    }
    // Ensure limit doesn't exceed backend max (1000)
    const validatedParams = {
      ...params,
      limit: params?.limit ? Math.min(params.limit, 1000) : 100,
    };
    const response = await apiClient.get('/alerts', {
      params: { project_id: Number(projectId), ...validatedParams },
    });
    // Validate array response - return empty array on validation failure (graceful degradation)
    return validateArrayResponse(
      AlertSchema,
      response.data,
      '/alerts'
    );
  },
  
  get: async (id: number) => {
    const response = await apiClient.get(`/alerts/${id}`);
    // Validate single item response
    try {
      return AlertSchema.parse(response.data);
    } catch (error) {
      console.warn(`[API Validation] Alert ${id} schema mismatch:`, error);
      return response.data; // Return raw data on validation failure
    }
  },
  
  resolve: async (id: number) => {
    const response = await apiClient.post(`/alerts/${id}/resolve`);
    return response.data;
  },
  
  send: async (id: number, channels?: string[]) => {
    const response = await apiClient.post(`/alerts/${id}/send`, { channels });
    return response.data;
  },
};

// Benchmark API
export const benchmarkAPI = {
  compareModels: async (projectId: number, days: number = 7) => {
    // Validate projectId
    if (!projectId || isNaN(projectId) || projectId <= 0) {
      throw new Error(`Invalid project ID: ${projectId}`);
    }
    // Validate days (backend limit is 30)
    const validatedDays = Math.min(Math.max(1, days), 30);
    const response = await apiClient.get('/benchmark/compare', {
      params: { project_id: Number(projectId), days: validatedDays },
    });
    // Validate and normalize response
    const data = Array.isArray(response.data) ? response.data : [];
    const validated = validateArrayResponse(
      ModelComparisonSchema,
      data,
      '/benchmark/compare'
    );
    // Normalize field name variations
    return validated.map(normalizeModelComparison);
  },
  
  getRecommendations: async (projectId: number, days: number = 7) => {
    const response = await apiClient.get('/benchmark/recommendations', {
      params: { project_id: projectId, days },
    });
    return response.data;
  },
};

// Cost API
export const costAPI = {
  getAnalysis: async (projectId: number, days: number = 7) => {
    // Validate projectId
    if (!projectId || isNaN(projectId) || projectId <= 0) {
      throw new Error(`Invalid project ID: ${projectId}`);
    }
    // Validate days (backend limit is 30)
    const validatedDays = Math.min(Math.max(1, days), 30);
    const response = await apiClient.get('/cost/analysis', {
      params: { project_id: Number(projectId), days: validatedDays },
    });
    // Validate response schema - return safe defaults on failure
    try {
      return CostAnalysisSchema.parse(response.data);
    } catch (error) {
      console.warn('[API Validation] Cost analysis schema mismatch, using defaults:', error);
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
    const response = await apiClient.post('/cost/detect-anomalies', null, {
      params: { project_id: projectId },
    });
    return response.data;
  },
  
  compareModels: async (projectId: number, days: number = 7) => {
    const response = await apiClient.get('/cost/compare-models', {
      params: { project_id: projectId, days },
    });
    return response.data;
  },
};

// Agent Chain API
export const agentChainAPI = {
  profile: async (projectId: number, chainId?: string, days: number = 7) => {
    // Validate projectId
    if (!projectId || isNaN(projectId) || projectId <= 0) {
      throw new Error(`Invalid project ID: ${projectId}`);
    }
    // Validate days (backend limit is 30)
    const validatedDays = Math.min(Math.max(1, days), 30);
    const params: any = { project_id: Number(projectId), days: validatedDays };
    if (chainId) {
      params.chain_id = chainId;
    }
    const response = await apiClient.get('/agent-chain/profile', { params });
    
    // Backend returns {total_chains, chains: [], ...} or {message, chains: []}
    // Validate using ChainProfileResponseSchema
    try {
      const validated = ChainProfileResponseSchema.parse(response.data);
      return validated;
    } catch (error) {
      console.warn('[API Validation] Chain profile response schema mismatch:', error);
      // Return safe default structure
      return {
        total_chains: 0,
        successful_chains: 0,
        success_rate: 0,
        avg_chain_latency_ms: 0,
        chains: [],
        message: response.data?.message || 'No chain data available',
      };
    }
  },
  
  getAgentStatistics: async (projectId: number, days: number = 7) => {
    // Validate projectId
    if (!projectId || isNaN(projectId) || projectId <= 0) {
      throw new Error(`Invalid project ID: ${projectId}`);
    }
    // Validate days (backend limit is 30)
    const validatedDays = Math.min(Math.max(1, days), 30);
    const response = await apiClient.get('/agent-chain/agents', {
      params: { project_id: Number(projectId), days: validatedDays },
    });
    return response.data;
  },
};

// Subscription API
export const subscriptionAPI = {
  getCurrent: async () => {
    const response = await apiClient.get('/subscription');
    return response.data;
  },
  
  getPlans: async () => {
    const response = await apiClient.get('/subscription/plans');
    return response.data;
  },
  
  upgrade: async (planType: string) => {
    const response = await apiClient.post('/subscription/upgrade', {
      plan_type: planType,
    });
    return response.data;
  },
  
  cancel: async () => {
    const response = await apiClient.post('/subscription/cancel');
    return response.data;
  },
};

// Settings API
export const settingsAPI = {
  getProfile: async () => {
    const response = await apiClient.get('/settings/profile');
    return response.data;
  },
  
  updateProfile: async (data: { full_name?: string }) => {
    const response = await apiClient.patch('/settings/profile', data);
    return response.data;
  },
  
  deleteAccount: async (password: string) => {
    await apiClient.delete('/settings/profile', {
      data: { password },
    });
  },
  
  changePassword: async (currentPassword: string, newPassword: string) => {
    await apiClient.patch('/settings/password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
  },
  
  getAPIKeys: async () => {
    const response = await apiClient.get('/settings/api-keys');
    return response.data;
  },
  
  createAPIKey: async (name: string) => {
    const response = await apiClient.post('/settings/api-keys', { name });
    return response.data;
  },
  
  deleteAPIKey: async (keyId: number) => {
    await apiClient.delete(`/settings/api-keys/${keyId}`);
  },
  
  updateAPIKey: async (keyId: number, name: string) => {
    const response = await apiClient.patch(`/settings/api-keys/${keyId}`, { name });
    return response.data;
  },
  
  getNotificationSettings: async () => {
    const response = await apiClient.get('/settings/notifications');
    return response.data;
  },
  
  updateNotificationSettings: async (settings: any) => {
    const response = await apiClient.patch('/settings/notifications', settings);
    return response.data;
  },
};

// Export API
export const exportAPI = {
  exportCSV: async (projectId: number, filters?: any) => {
    const response = await apiClient.get('/export/csv', {
      params: { project_id: projectId, ...filters },
      responseType: 'blob',
    });
    
    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `api-calls-${projectId}-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
  
  exportJSON: async (projectId: number, filters?: any, includeData: boolean = false) => {
    const response = await apiClient.get('/export/json', {
      params: { project_id: projectId, include_data: includeData, ...filters },
    });
    
    // Download as JSON file
    const dataStr = JSON.stringify(response.data, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = window.URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `api-calls-${projectId}-${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};

// Activity API
export const activityAPI = {
  list: async (params?: any) => {
    const response = await apiClient.get('/activity', { params });
    // Backend returns {items: [], total: number, limit: number, offset: number}
    // Return items for backward compatibility, but also return total if available
    return response.data.items || response.data;
  },
  listWithTotal: async (params?: any) => {
    const response = await apiClient.get('/activity', { params });
    return response.data; // Returns {items: [], total: number, limit: number, offset: number}
  },
};

// Notifications API (in-app)
export const notificationsAPI = {
  list: async (params?: any) => {
    const response = await apiClient.get('/notifications', { params });
    return response.data;
  },
  
  markRead: async (alertId: number) => {
    await apiClient.patch(`/notifications/${alertId}/read`);
  },
  
  delete: async (alertId: number) => {
    await apiClient.delete(`/notifications/${alertId}`);
  },
  
  getUnreadCount: async () => {
    const response = await apiClient.get('/notifications/unread-count');
    return response.data;
  },
};

// Admin API
export const adminAPI = {
  generateSampleData: async (projectId: number) => {
    const response = await apiClient.post('/admin/generate-sample-data', null, {
      params: { project_id: projectId },
    });
    return response.data;
  },
};

// Reports API
export const reportsAPI = {
  generate: async (projectId: number, params: any) => {
    const response = await apiClient.post('/reports/generate', null, {
      params: { project_id: projectId, ...params },
    });
    return response.data;
  },
  
  download: async (projectId: number, params: any) => {
    try {
      const response = await apiClient.get('/reports/download', {
        params: { project_id: projectId, ...params },
        responseType: 'blob',
      });
      
      // Check if response is an error (error responses are also blobs when responseType is 'blob')
      const contentType = response.headers['content-type'] || '';
      const format = params.format || 'json';
      
      // For JSON format, application/json is expected, not an error
      if (format === 'json' && contentType.includes('application/json') && response.status < 400) {
        // This is a valid JSON response, proceed with download
      } else if (contentType.includes('application/json') && response.status >= 400) {
        // This is an error response, parse it
        const blob = response.data instanceof Blob ? response.data : new Blob([response.data]);
        const text = await blob.text();
        try {
          const errorData = JSON.parse(text);
          const error = new Error(errorData.detail || errorData.message || 'Failed to download report');
          (error as any).response = response;
          throw error;
        } catch (parseError) {
          const error = new Error('Failed to download report: ' + (text || response.statusText).substring(0, 200));
          (error as any).response = response;
          throw error;
        }
      }
      
      // Determine content type (format was already determined above)
      const fileContentType = format === 'pdf' ? 'application/pdf' : 'application/json';
      
      // Create blob with correct MIME type
      const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: fileContentType });
      const url = window.URL.createObjectURL(blob);
      
      try {
        const link = document.createElement('a');
        link.href = url;
        
        // Try to extract filename from Content-Disposition header
        let filename = `report-${projectId}-${params.template || 'standard'}-${new Date().toISOString().split('T')[0]}.${format}`;
        const contentDisposition = response.headers['content-disposition'];
        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
          if (filenameMatch && filenameMatch[1]) {
            filename = filenameMatch[1].replace(/['"]/g, '');
            // Decode URI if needed
            try {
              filename = decodeURIComponent(filename);
            } catch (e) {
              // If decoding fails, use as is
            }
          }
        }
        
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        link.remove();
      } finally {
        // Always revoke the object URL to free memory
        window.URL.revokeObjectURL(url);
      }
    } catch (error: any) {
      // Handle blob error responses
      if (error.response && error.response.data) {
        const errorData = error.response.data;
        if (errorData instanceof Blob) {
          try {
            const text = await errorData.text();
            const parsedError = JSON.parse(text);
            throw new Error(parsedError.detail || parsedError.message || 'Failed to download report');
          } catch (parseError) {
            // If parsing fails, use the original error message
            if (error.message) {
              throw error;
            }
            throw new Error('Failed to download report. Please check server logs for details.');
          }
        }
      }
      throw error;
    }
  },
};

// Webhooks API
export const webhooksAPI = {
  list: async (params?: any) => {
    const response = await apiClient.get('/webhooks', { params });
    return response.data;
  },
  
  get: async (id: number) => {
    const response = await apiClient.get(`/webhooks/${id}`);
    return response.data;
  },
  
  create: async (data: any) => {
    const response = await apiClient.post('/webhooks', data);
    return response.data;
  },
  
  update: async (id: number, data: any) => {
    const response = await apiClient.patch(`/webhooks/${id}`, data);
    return response.data;
  },
  
  delete: async (id: number) => {
    await apiClient.delete(`/webhooks/${id}`);
  },
  
  test: async (id: number) => {
    const response = await apiClient.post(`/webhooks/${id}/test`);
    return response.data;
  },
};

// Types
export interface Project {
  id: number;
  name: string;
  description: string | null;
  owner_id: number;
  is_active: boolean;
  role?: 'owner' | 'admin' | 'member' | 'viewer'; // Added for team feature
}

export default apiClient;



