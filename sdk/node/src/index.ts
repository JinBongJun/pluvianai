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
  proxyTimeout?: number;  // milliseconds
  firewallTimeout?: number;  // milliseconds
  piiTimeout?: number;  // milliseconds
  circuitBreaker?: {
    failureThreshold?: number;
    recoveryTimeSeconds?: number;
    halfOpenMaxCalls?: number;
  };
  healthCheckInterval?: number;  // milliseconds
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
  
  // Timeout configuration
  private proxyTimeout: number;
  private firewallTimeout: number;
  private piiTimeout: number;
  private healthCheckInterval: number;
  
  // Circuit Breaker state
  private circuitState: 'closed' | 'open' | 'half-open' = 'closed';
  private circuitFailures: number = 0;
  private circuitOpenedAt: number | null = null;
  private circuitBreakerConfig: {
    failureThreshold: number;
    recoveryTimeSeconds: number;
    halfOpenMaxCalls: number;
  };
  
  // Context for chain_id and agent_name (using AsyncLocalStorage for async context)
  private context: Map<string, any> = new Map();

  constructor(config: AgentGuardConfig = {}) {
    this.apiKey = config.apiKey || process.env.AGENTGUARD_API_KEY;
    this.projectId = config.projectId 
      ? Number(config.projectId) 
      : (process.env.AGENTGUARD_PROJECT_ID ? Number(process.env.AGENTGUARD_PROJECT_ID) : undefined);
    this.apiUrl = config.apiUrl || process.env.AGENTGUARD_API_URL || 'https://api.agentguard.dev';
    this.agentName = config.agentName || process.env.AGENTGUARD_AGENT_NAME;
    this.enabled = (config.enabled !== false) && !!this.apiKey && !!this.projectId;

    // Timeout configuration
    this.proxyTimeout = config.proxyTimeout || 30000;  // 30 seconds
    this.firewallTimeout = config.firewallTimeout || 1000;  // 1 second
    this.piiTimeout = config.piiTimeout || 100;  // 100ms
    this.healthCheckInterval = config.healthCheckInterval || 30000;  // 30 seconds

    // Circuit Breaker configuration
    this.circuitBreakerConfig = {
      failureThreshold: config.circuitBreaker?.failureThreshold || 5,
      recoveryTimeSeconds: config.circuitBreaker?.recoveryTimeSeconds || 30,
      halfOpenMaxCalls: config.circuitBreaker?.halfOpenMaxCalls || 3,
    };

    this.axiosInstance = axios.create({
      timeout: this.proxyTimeout,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    
    // Start health check monitoring
    if (this.enabled) {
      this.startHealthCheck();
    }
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

  /**
   * Get chain_id from context
   */
  private getChainId(): string | undefined {
    return this.context.get('chain_id');
  }

  /**
   * Get agent_name from context or default
   */
  private getAgentName(): string | undefined {
    return this.context.get('agent_name') || this.agentName;
  }

  /**
   * Context manager to set chain_id and agent_name for a chain of API calls
   * 
   * @example
   * ```typescript
   * await agentguard.chain("user-query-123", "data-collector", async () => {
   *   const response1 = await openai.chat.completions.create(...);
   *   const response2 = await openai.chat.completions.create(...);
   *   // Both calls will have chain_id="user-query-123"
   * });
   * ```
   */
  async chain<T>(
    chainId: string,
    agentName: string | undefined,
    callback: () => Promise<T>
  ): Promise<T> {
    const oldChainId = this.context.get('chain_id');
    const oldAgentName = this.context.get('agent_name');

    this.context.set('chain_id', chainId);
    if (agentName) {
      this.context.set('agent_name', agentName);
    }

    try {
      return await callback();
    } finally {
      if (oldChainId !== undefined) {
        this.context.set('chain_id', oldChainId);
      } else {
        this.context.delete('chain_id');
      }

      if (oldAgentName !== undefined) {
        this.context.set('agent_name', oldAgentName);
      } else if (agentName) {
        this.context.delete('agent_name');
      }
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
      // Get chain_id and agent_name from context
      const chainId = this.getChainId();
      const agentName = this.getAgentName();

      const payload: any = {
        project_id: Number(this.projectId),
        request_data: requestData,
        response_data: responseData,
        latency_ms: latencyMs,
        status_code: statusCode,
        agent_name: agentName,
      };

      // Add chain_id if available
      if (chainId) {
        payload.chain_id = chainId;
      }

      // Check Circuit Breaker state before sending
      if (!this.checkCircuitBreaker()) {
        // Circuit is open, bypass AgentGuard (fail-open)
        return;
      }

      // Send asynchronously (fire and forget)
      try {
        await this.axiosInstance.post(`${this.apiUrl}/api/v1/api-calls`, payload);
        // Success - reset circuit breaker
        this.resetCircuitBreaker();
      } catch (error) {
        // Record failure for circuit breaker
        this.recordCircuitFailure();
        // Silently fail - don't block the application (fail-open)
      }
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
   * @param chainId - Optional chain ID to group related calls
   */
  async trackCall(
    requestData: any,
    responseData: any,
    latencyMs: number,
    statusCode: number = 200,
    agentName?: string,
    chainId?: string
  ): Promise<void> {
    if (!this.enabled) {
      return;
    }

    // Store chain_id and agent_name temporarily
    const oldChainId = this.context.get('chain_id');
    const oldAgentName = this.context.get('agent_name');

    if (chainId) {
      this.context.set('chain_id', chainId);
    }
    if (agentName) {
      this.context.set('agent_name', agentName);
    }

    try {
      await this.sendToAPI(requestData, responseData, latencyMs, statusCode);
    } finally {
      // Restore old values
      if (oldChainId !== undefined) {
        this.context.set('chain_id', oldChainId);
      } else if (chainId) {
        this.context.delete('chain_id');
      }

      if (oldAgentName !== undefined) {
        this.context.set('agent_name', oldAgentName);
      } else if (agentName) {
        this.context.delete('agent_name');
      }
    }
  }
  
  private checkCircuitBreaker(): boolean {
    if (this.circuitState === 'closed') {
      return true;
    } else if (this.circuitState === 'open') {
      // Check if recovery time has passed
      if (this.circuitOpenedAt) {
        const elapsed = (Date.now() - this.circuitOpenedAt) / 1000;
        if (elapsed >= this.circuitBreakerConfig.recoveryTimeSeconds) {
          this.circuitState = 'half-open';
          this.circuitFailures = 0;
          return true;
        }
      }
      return false;
    } else if (this.circuitState === 'half-open') {
      return true;
    }
    return true;
  }
  
  private recordCircuitFailure(): void {
    this.circuitFailures++;
    if (this.circuitFailures >= this.circuitBreakerConfig.failureThreshold) {
      this.circuitState = 'open';
      this.circuitOpenedAt = Date.now();
    }
  }
  
  private resetCircuitBreaker(): void {
    if (this.circuitState === 'half-open') {
      this.circuitState = 'closed';
      this.circuitFailures = 0;
    } else if (this.circuitState === 'closed') {
      this.circuitFailures = 0;
    }
  }
  
  private startHealthCheck(): void {
    setInterval(async () => {
      try {
        const response = await axios.get(`${this.apiUrl}/api/v1/health`, { timeout: 5000 });
        if (response.status === 200) {
          this.resetCircuitBreaker();
        } else {
          this.recordCircuitFailure();
        }
      } catch (error) {
        this.recordCircuitFailure();
      }
    }, this.healthCheckInterval);
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
 * Context manager to set chain_id and agent_name for a chain of API calls
 * 
 * @example
 * ```typescript
 * import agentguard from '@agentguard/sdk';
 * agentguard.init();
 * 
 * await agentguard.chain("user-query-123", "data-collector", async () => {
 *   const response1 = await openai.chat.completions.create(...);
 *   const response2 = await openai.chat.completions.create(...);
 *   // Both calls will have chain_id="user-query-123"
 * });
 * ```
 */
export async function chain<T>(
  chainId: string,
  agentName: string | undefined,
  callback: () => Promise<T>
): Promise<T> {
  if (!globalInstance) {
    throw new Error('AgentGuard not initialized. Call agentguard.init() first.');
  }
  return globalInstance.chain(chainId, agentName, callback);
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
 * @param chainId - Optional chain ID to group related calls
 */
export async function trackCall(
  requestData: any,
  responseData: any,
  latencyMs: number,
  statusCode: number = 200,
  agentName?: string,
  chainId?: string
): Promise<void> {
  if (globalInstance) {
    await globalInstance.trackCall(requestData, responseData, latencyMs, statusCode, agentName, chainId);
  } else {
    // Create a temporary instance
    const instance = new AgentGuard();
    await instance.trackCall(requestData, responseData, latencyMs, statusCode, agentName, chainId);
  }
}

// Export class for advanced usage
export { AgentGuard };

// Default export
export default {
  init,
  chain,
  trackCall,
  AgentGuard,
};
