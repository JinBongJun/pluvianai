/** @type {import('next').NextConfig} */
const { withSentryConfig } = require("@sentry/nextjs");

const isProduction = process.env.NODE_ENV === "production";

const contentSecurityPolicy = [
  "default-src 'self' https:",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline' https:",
  "style-src 'self' 'unsafe-inline' https:",
  "img-src 'self' data: https:",
  "font-src 'self' data: https:",
  "connect-src 'self' https: https://app.posthog.com https://*.posthog.com https://*.ingest.sentry.io",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=()" },
  ...(isProduction
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
    : []),
];

const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: [],
    formats: ["image/avif", "image/webp"],
  },
  async rewrites() {
    return [{ source: "/favicon.ico", destination: "/icon.svg" }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  // Code splitting optimization
  experimental: {
    optimizePackageImports: ["lucide-react"],
    // Enable instrumentation hook for Sentry
    instrumentationHook: false,
  },
  // Compress output
  compress: true,
  // Production optimizations
  swcMinify: true,
  // Optimize fonts
  optimizeFonts: true,
};

// Wrap Next.js config with Sentry
module.exports = nextConfig;
