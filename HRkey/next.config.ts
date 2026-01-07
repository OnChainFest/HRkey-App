// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  /**
   * Turbopack workspace root
   * Fixes warning: "Next.js inferred your workspace root... detected multiple lockfiles"
   */
  turbopack: {
    root: __dirname,
  },

  // Skip trailing slash redirects to allow .html file access
  skipTrailingSlashRedirect: true,

  // Disable linting and type checking during build for faster deployments
  // Note: dirs: [] is redundant when ignoreDuringBuilds is true, but kept for clarity.
  eslint: {
    ignoreDuringBuilds: true,
    dirs: [],
  },
  typescript: {
    ignoreBuildErrors: true,
  },

  // Additional optimization: disable static type checking (typed routes)
  experimental: {
    typedRoutes: false,
  },

  // 👇 Evita que el Base Account SDK falle por COOP/COEP en dev
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // NO usar 'same-origin' con Base Account SDK
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          // Desactiva COEP para que el popup pueda comunicarse
          { key: "Cross-Origin-Embedder-Policy", value: "unsafe-none" },
        ],
      },
    ];
  },
};

export default nextConfig;
