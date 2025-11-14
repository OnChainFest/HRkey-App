// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: {
    // Temporalmente ignorar errores de TypeScript durante el build
    ignoreBuildErrors: true,
  },
  eslint: {
    // Temporalmente ignorar errores de ESLint durante el build
    ignoreDuringBuilds: true,
  },

  // Servir landing page HTML estática
  async rewrites() {
    return [
      {
        source: '/WebDapp',
        destination: '/WebDapp/index.html',
      },
      {
        source: '/WebDapp/',
        destination: '/WebDapp/index.html',
      },
    ];
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

