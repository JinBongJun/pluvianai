/** @type {import('next').NextConfig} */
const { withSentryConfig } = require("@sentry/nextjs");

const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: [],
    formats: ['image/avif', 'image/webp'],
  },
  // Redirect /favicon.ico to /favicon.svg (public folder)
  async rewrites() {
    return [
      {
        source: '/favicon.ico',
        destination: '/favicon.svg',
      },
    ];
  },
  // Code splitting optimization
  experimental: {
    optimizePackageImports: ['lucide-react'],
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
