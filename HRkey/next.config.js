/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      // Passthrough directo a /public/WebDapp/*
      { source: '/WebDapp/:path*', destination: '/WebDapp/:path*' },
    ];
  },
};
module.exports = nextConfig;
