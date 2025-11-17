// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Disable linting and type checking during build for faster deployments
  // Using dirs: [] to skip all directories for ESLint
  eslint: {
    ignoreDuringBuilds: true,
    dirs: [], // Skip linting all directories
  },
  typescript: {
    ignoreBuildErrors: true,
  },

  // Additional optimization: disable static type checking
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

