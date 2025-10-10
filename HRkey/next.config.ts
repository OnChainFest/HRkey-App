// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

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

