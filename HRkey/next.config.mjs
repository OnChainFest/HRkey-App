// next.config.mjs
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Removed turbopack.root to avoid conflict with outputFileTracingRoot
  // Next.js will detect the root automatically
};

export default nextConfig;
