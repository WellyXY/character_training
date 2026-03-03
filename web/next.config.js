/** @type {import('next').NextConfig} */
const nextConfig = {
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
    ];
  },
};

module.exports = nextConfig;
