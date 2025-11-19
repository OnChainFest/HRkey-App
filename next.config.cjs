/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Redirigir homepage a WebDapp
  async redirects() {
    return [
      {
        source: '/',
        destination: '/WebDapp/index.html',
        permanent: false,
      },
    ];
  },

  // No generar .next en build (solo APIs)
  distDir: '.next',
};

module.exports = nextConfig;
