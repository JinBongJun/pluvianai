import posthog from 'posthog-js';

export const analytics = {
  init: () => {
    if (typeof window === 'undefined') return;
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
    if ((posthog as any).__loaded) return;
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
      api_host: 'https://app.posthog.com',
      capture_pageview: true,
    });
  },

  capture: (event: string, properties?: Record<string, any>) => {
    if (typeof window === 'undefined') return;
    try {
      posthog.capture(event, properties);
    } catch (error) {
      console.error('Error sending analytics event:', error);
    }
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
