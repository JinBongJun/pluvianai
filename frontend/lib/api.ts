/**
 * API client for AgentGuard backend
 */
import axios from 'axios';

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
    return response.data;
  },
  
  get: async (id: number) => {
    const response = await apiClient.get(`/projects/${id}`);
    return response.data;
  },
  
  create: async (name: string, description?: string) => {
    const response = await apiClient.post('/projects', {
      name,
      description,
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
    const response = await apiClient.get('/api-calls', {
      params: { project_id: projectId, ...params },
    });
    return response.data;
  },
  
  get: async (id: number) => {
    const response = await apiClient.get(`/api-calls/${id}`);
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
    return response.data;
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
    return response.data;
  },
  
  get: async (id: number) => {
    const response = await apiClient.get(`/drift/${id}`);
    return response.data;
  },
};

// Alerts API
export const alertsAPI = {
  list: async (projectId: number, params?: any) => {
    const response = await apiClient.get('/alerts', {
      params: { project_id: projectId, ...params },
    });
    return response.data;
  },
  
  resolve: async (id: number) => {
    const response = await apiClient.post(`/alerts/${id}/resolve`);
    return response.data;
  },
};

// Cost API
export const costAPI = {
  getAnalysis: async (projectId: number, days: number = 7) => {
    const response = await apiClient.get('/cost/analysis', {
      params: { project_id: projectId, days },
    });
    return response.data;
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



