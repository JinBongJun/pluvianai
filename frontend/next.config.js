/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: [],
    formats: ['image/avif', 'image/webp'],
  },
  // Code splitting optimization
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  // Compress output
  compress: true,
  // Production optimizations
  swcMinify: true,
  // Optimize fonts
  optimizeFonts: true,
};

module.exports = nextConfig;
