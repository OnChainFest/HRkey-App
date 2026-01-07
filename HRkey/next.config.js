// next.config.js

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Skip linting + typecheck during build
  eslint: {
    ignoreDuringBuilds: true,
    dirs: [],
  },
  typescript: {
    ignoreBuildErrors: true,
  },

  // Next 15: moved out of experimental
  typedRoutes: false,

  // Fix "workspace root" warning when multiple lockfiles exist
  turbopack: {
    root: __dirname,
  },

  // Skip trailing slash redirects to allow .html file access
  skipTrailingSlashRedirect: true,

  // 👇 Evita que el Base Account SDK falle por COOP/COEP en dev
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          { key: "Cross-Origin-Embedder-Policy", value: "unsafe-none" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
