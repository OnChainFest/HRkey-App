/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      // Asegura que /WebDapp/* se sirva tal cual desde /public
      { source: '/WebDapp/:path*', destination: '/WebDapp/:path*' },
    ];
  },
  // Opcional, por si hay confusiones con /ruta/ vs /ruta
  trailingSlash: false,
};
module.exports = nextConfig;
