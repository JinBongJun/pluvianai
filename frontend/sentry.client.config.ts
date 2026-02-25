// This file configures the initialization of Sentry on the client.
// The config you add here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: 0.1,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // Reduce replay rates to avoid hitting Sentry rate limits
  // Only replay 10% of errors (was 100%)
  replaysOnErrorSampleRate: 0.1,

  // This sets the sample rate to be 1% (reduced from 10% to reduce load)
  // in production
  replaysSessionSampleRate: 0.01,

  // You can remove this option if you're not planning to use the Sentry Session Replay feature:
  integrations: [
    Sentry.replayIntegration({
      // Additional Replay configuration goes in here, for example:
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || "production",

  // Set release version
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE || "pluvianai@0.1.0",
});
