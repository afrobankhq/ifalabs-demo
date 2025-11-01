import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    config.module.rules.push({
      test: /\.(mp4)$/i,
      type: 'asset/resource',
    });
    return config;
  },

  async rewrites() {
    return [
      {
        // Proxy all API requests to your external backend
        source: '/api/:path*',
        destination: process.env.NEXT_PUBLIC_API_BASE_URL
          ? `${process.env.NEXT_PUBLIC_API_BASE_URL}/:path*`
          : 'https://api.ifalabs.com/api/:path*',
      },
    ];
  },
};

export default nextConfig;
