/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      { source: '/WebDapp/:path*', destination: '/WebDapp/:path*' },
    ]
  },
  trailingSlash: false,
}
module.exports = nextConfig
