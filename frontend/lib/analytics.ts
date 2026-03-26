import { logger } from "@/lib/logger";

const SENSITIVE_KEY_PATTERN =
  /(email|token|secret|password|authorization|cookie|api[_-]?key|refresh_token|access_token)/i;
const EMAIL_VALUE_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

declare global {
  interface Window {
    __AGENTGUARD_ANALYTICS_SINK__?: (payload: {
      event: string;
      properties?: Record<string, unknown>;
    }) => void;
  }
}

function sanitizeAnalyticsValue(key: string, value: unknown): unknown {
  if (SENSITIVE_KEY_PATTERN.test(key)) {
    return "[REDACTED]";
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map(item => sanitizeAnalyticsValue(key, item));
  }

  if (value && typeof value === "object") {
    return sanitizeAnalyticsProperties(value as Record<string, unknown>);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (EMAIL_VALUE_PATTERN.test(trimmed)) {
      return "[REDACTED]";
    }
    if (trimmed.length > 200) {
      return trimmed.slice(0, 200);
    }
    return trimmed;
  }

  return value;
}

function sanitizeAnalyticsProperties(properties?: Record<string, unknown>) {
  if (!properties) return undefined;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    out[key] = sanitizeAnalyticsValue(key, value);
  }
  return out;
}

export const analytics = {
  init: () => {
    if (typeof window === "undefined") return;
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
    import("posthog-js").then(({ default: posthog }) => {
      if ((posthog as any).__loaded) return;
      posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
        api_host: "https://app.posthog.com",
        capture_pageview: true,
      });
    });
  },

  capture: (event: string, properties?: Record<string, any>) => {
    if (typeof window === "undefined") return;
    const sanitized = sanitizeAnalyticsProperties(properties);

    // Test hook: optional local sink for QA automation. No-op unless explicitly set.
    if (typeof window.__AGENTGUARD_ANALYTICS_SINK__ === "function") {
      try {
        window.__AGENTGUARD_ANALYTICS_SINK__({ event, properties: sanitized });
      } catch {
        // Never break runtime analytics flow because of test sink failures.
      }
    }

    import("posthog-js")
      .then(({ default: posthog }) => {
        posthog.capture(event, sanitized);
      })
      .catch(error => logger.error("Error sending analytics event", error));
  },

  trackError(event: string, context?: Record<string, any>) {
    analytics.capture(`error:${event}`, context);
  },

  trackUX(event: string, context?: Record<string, any>) {
    analytics.capture(`ux:${event}`, context);
  },

  trackLoad(event: string, durationMs: number, context?: Record<string, any>) {
    analytics.capture(`load:${event}`, { durationMs, ...context });
  },
};
