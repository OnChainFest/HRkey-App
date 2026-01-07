// next.config.ts
import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Disable linting and type checking during build for faster deployments
  eslint: {
    ignoreDuringBuilds: true,
    dirs: [], // Skip linting all directories
  },
  typescript: {
    ignoreBuildErrors: true,
  },

  // Next.js 15: typedRoutes moved out of experimental
  typedRoutes: false,

  // Help Next pick the correct root when multiple lockfiles exist
  turbopack: {
    root: path.join(__dirname),
  },

  // Skip trailing slash redirects to allow .html file access
  skipTrailingSlashRedirect: true,

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
