/**
 * Centralized logging utility
 * In production, logs to Sentry instead of console
 */

import * as Sentry from "@sentry/nextjs";

const isDevelopment = process.env.NODE_ENV === "development";

export const logger = {
  error: (message: string, error?: Error | unknown, context?: Record<string, unknown>) => {
    if (isDevelopment) {
      console.error(message, error, context);
    } else {
      // In production, send to Sentry
      if (error instanceof Error) {
        Sentry.captureException(error, {
          extra: { message, ...context },
        });
      } else {
        Sentry.captureMessage(message, {
          level: "error",
          extra: { error, ...context },
        });
      }
    }
  },

  warn: (message: string, context?: Record<string, unknown>) => {
    if (isDevelopment) {
      console.warn(message, context);
    } else {
      Sentry.captureMessage(message, {
        level: "warning",
        extra: context,
      });
    }
  },

  log: (message: string, context?: Record<string, unknown>) => {
    if (isDevelopment) {
      console.log(message, context);
    }
    // In production, only log to Sentry if it's important
    // Regular logs are not sent to Sentry to avoid noise
  },

  info: (message: string, context?: Record<string, unknown>) => {
    if (isDevelopment) {
      console.info(message, context);
    }
    // Info logs are not sent to Sentry
  },
};
