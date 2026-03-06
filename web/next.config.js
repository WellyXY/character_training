/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
      },
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  async rewrites() {
    const realApi = process.env.REAL_API_BASE;
    if (!realApi) return [];
    return [
      {
        source: "/api-proxy/:path*",
        destination: `${realApi}/:path*`,
      },
      {
        source: "/api-share/:path*",
        destination: `${realApi}/api/v1/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
