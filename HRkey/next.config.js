/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  async rewrites() {
    return [
      {
        source: '/auth',
        destination: '/auth.html'
      },
      {
        source: '/app',
        destination: '/app.html'
      },
      {
        source: '/request-reference',
        destination: '/request-reference.html'
      },
      {
        source: '/reference-management-page',
        destination: '/reference-management-page.html'
      },
      {
        source: '/referee-evaluation-page',
        destination: '/referee-evaluation-page.html'
      },
      {
        source: '/pricing',
        destination: '/pricing.html'
      }
    ]
  }
}

module.exports = nextConfig
