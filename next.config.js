/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow large image uploads (10MB)
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

module.exports = nextConfig;
