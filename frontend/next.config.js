/** @type {import('next').NextConfig} */

const isProduction = process.env.NODE_ENV === "production";
const scriptSrc = ["'self'", "'unsafe-inline'", "https:"];
const connectSrc = ["'self'", "https:", "https://app.posthog.com", "https://*.posthog.com", "https://*.ingest.sentry.io"];

if (!isProduction) {
  // Next.js dev server relies on eval and websocket HMR.
  scriptSrc.splice(2, 0, "'unsafe-eval'");
  connectSrc.push(
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "ws://localhost:3000",
    "ws://127.0.0.1:3000",
    "http://localhost:8000",
    "http://127.0.0.1:8000"
  );
}

const contentSecurityPolicy = [
  "default-src 'self' https:",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  `script-src ${scriptSrc.join(" ")}`,
  "style-src 'self' 'unsafe-inline' https:",
  "img-src 'self' data: https:",
  "font-src 'self' data: https:",
  `connect-src ${connectSrc.join(" ")}`,
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
  outputFileTracingRoot: __dirname,
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
  },
  // Compress output
  compress: true,
};

// Wrap Next.js config with Sentry
module.exports = nextConfig;
