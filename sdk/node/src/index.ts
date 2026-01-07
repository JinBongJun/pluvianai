/**
 * AgentGuard Node.js SDK - Zero-config monitoring for LLM APIs
 */

import axios, { AxiosInstance } from 'axios';

interface AgentGuardConfig {
  apiKey?: string;
  projectId?: number;
  apiUrl?: string;
  agentName?: string;
  enabled?: boolean;
}

interface APICallData {
  request_data: any;
  response_data: any;
  latency_ms: number;
  status_code: number;
  agent_name?: string;
}

class AgentGuard {
  private apiKey: string | undefined;
  private projectId: number | undefined;
  private apiUrl: string;
  private agentName: string | undefined;
  private enabled: boolean;
  private patched: boolean = false;
  private originalFunctions: Map<string, any> = new Map();
  private axiosInstance: AxiosInstance;

  constructor(config: AgentGuardConfig = {}) {
    this.apiKey = config.apiKey || process.env.AGENTGUARD_API_KEY;
    this.projectId = config.projectId 
      ? Number(config.projectId) 
      : (process.env.AGENTGUARD_PROJECT_ID ? Number(process.env.AGENTGUARD_PROJECT_ID) : undefined);
    this.apiUrl = config.apiUrl || process.env.AGENTGUARD_API_URL || 'https://api.agentguard.dev';
    this.agentName = config.agentName || process.env.AGENTGUARD_AGENT_NAME;
    this.enabled = (config.enabled !== false) && !!this.apiKey && !!this.projectId;

    this.axiosInstance = axios.create({
      timeout: 2000,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Initialize and patch OpenAI SDK automatically
   * 
   * This method automatically patches the OpenAI Node.js SDK to capture
   * all API calls without requiring code changes.
   * 
   * @example
   * ```typescript
   * import agentguard from '@agentguard/sdk';
   * agentguard.init();
   * 
   * // Now all OpenAI calls are automatically monitored
   * import OpenAI from 'openai';
   * const openai = new OpenAI();
   * const response = await openai.chat.completions.create({...});
   * ```
   */
  init(): void {
    if (!this.enabled) {
      console.log('AgentGuard: Monitoring disabled (missing API key or project ID)');
      return;
    }

    if (this.patched) {
      console.log('AgentGuard: Already initialized');
      return;
    }

    try {
      this.patchOpenAI();
      this.patched = true;
      console.log(`AgentGuard: Successfully initialized for project ${this.projectId}`);
    } catch (error: any) {
      console.log(`AgentGuard: Failed to initialize: ${error.message}`);
    }
  }

  private patchOpenAI(): void {
    try {
      // Try to patch OpenAI v4+ (ESM/CJS)
      const openaiModule = require('openai');
      
      if (openaiModule && openaiModule.default) {
        // ESM default export
        this.patchOpenAIClass(openaiModule.default);
      } else if (openaiModule && openaiModule.OpenAI) {
        // Named export
        this.patchOpenAIClass(openaiModule.OpenAI);
      } else if (openaiModule) {
        // Direct class
        this.patchOpenAIClass(openaiModule);
      }
    } catch (error) {
      // OpenAI not installed or different version
      console.log('AgentGuard: OpenAI SDK not found. Install with: npm install openai');
    }
  }

  private patchOpenAIClass(OpenAIClass: any): void {
    if (!OpenAIClass || typeof OpenAIClass !== 'function') {
      return;
    }

    const originalConstructor = OpenAIClass.prototype.constructor;
    const self = this;

    // Patch constructor to wrap chat.completions.create
    OpenAIClass.prototype.constructor = function(...args: any[]) {
      originalConstructor.apply(this, args);

      // Patch chat.completions.create if it exists
      if (this.chat && this.chat.completions && this.chat.completions.create) {
        const originalCreate = this.chat.completions.create;
        const instanceId = Math.random().toString(36).substring(7);
        
        this.chat.completions.create = async function(...createArgs: any[]) {
          return self.captureCall(originalCreate.bind(this), ...createArgs);
        };

        self.originalFunctions.set(`${instanceId}.chat.completions.create`, originalCreate);
      }
    };
  }

  private async captureCall(originalFunc: (...args: any[]) => Promise<any>, ...args: any[]): Promise<any> {
    const startTime = Date.now();
    const requestData = {
      args: args,
    };

    try {
      // Call original function
      const response = await originalFunc(...args);

      // Calculate latency
      const latencyMs = Date.now() - startTime;

      // Extract response data
      let responseData: any = {};
      if (response && typeof response === 'object') {
        if (response.toJSON) {
          responseData = response.toJSON();
        } else {
          responseData = JSON.parse(JSON.stringify(response));
        }
      }

      // Send to AgentGuard API (async, non-blocking)
      this.sendToAPI(requestData, responseData, latencyMs, 200).catch(() => {
        // Silently fail - don't block the application
      });

      return response;
    } catch (error: any) {
      // Calculate latency even on error
      const latencyMs = Date.now() - startTime;

      // Send error to AgentGuard API
      const errorData = {
        error: error.message || String(error),
        error_type: error.constructor?.name || 'Error',
      };
      this.sendToAPI(requestData, errorData, latencyMs, 500).catch(() => {
        // Silently fail - don't block the application
      });

      // Re-throw the exception
      throw error;
    }
  }

  private async sendToAPI(
    requestData: any,
    responseData: any,
    latencyMs: number,
    statusCode: number
  ): Promise<void> {
    if (!this.enabled) {
      return;
    }

    try {
      const payload = {
        project_id: Number(this.projectId),
        request_data: requestData,
        response_data: responseData,
        latency_ms: latencyMs,
        status_code: statusCode,
        agent_name: this.agentName,
      };

      // Send asynchronously (fire and forget)
      await this.axiosInstance.post(`${this.apiUrl}/api/v1/api-calls`, payload);
    } catch (error) {
      // Silently fail - don't block the application
    }
  }

  /**
   * Manually track an API call
   * 
   * Use this if you want to manually track calls instead of using auto-patching.
   * 
   * @param requestData - Request payload
   * @param responseData - Response payload
   * @param latencyMs - Latency in milliseconds
   * @param statusCode - HTTP status code
   * @param agentName - Optional agent name
   */
  async trackCall(
    requestData: any,
    responseData: any,
    latencyMs: number,
    statusCode: number = 200,
    agentName?: string
  ): Promise<void> {
    if (!this.enabled) {
      return;
    }

    await this.sendToAPI(requestData, responseData, latencyMs, statusCode);
  }
}

// Global instance
let globalInstance: AgentGuard | null = null;

/**
 * Initialize AgentGuard with zero-config setup
 * 
 * This function automatically patches the OpenAI SDK to capture all API calls.
 * 
 * @example
 * ```typescript
 * import agentguard from '@agentguard/sdk';
 * agentguard.init();
 * 
 * // Now all OpenAI calls are automatically monitored
 * import OpenAI from 'openai';
 * const openai = new OpenAI();
 * const response = await openai.chat.completions.create({...});
 * ```
 * 
 * @param config - Configuration options
 */
export function init(config: AgentGuardConfig = {}): void {
  globalInstance = new AgentGuard(config);
  globalInstance.init();
}

/**
 * Manually track an API call
 * 
 * Use this if you want to manually track calls instead of using auto-patching.
 * 
 * @param requestData - Request payload
 * @param responseData - Response payload
 * @param latencyMs - Latency in milliseconds
 * @param statusCode - HTTP status code
 * @param agentName - Optional agent name
 */
export async function trackCall(
  requestData: any,
  responseData: any,
  latencyMs: number,
  statusCode: number = 200,
  agentName?: string
): Promise<void> {
  if (globalInstance) {
    await globalInstance.trackCall(requestData, responseData, latencyMs, statusCode, agentName);
  } else {
    // Create a temporary instance
    const instance = new AgentGuard();
    await instance.trackCall(requestData, responseData, latencyMs, statusCode, agentName);
  }
}

// Export class for advanced usage
export { AgentGuard };

// Default export
export default {
  init,
  trackCall,
  AgentGuard,
};
