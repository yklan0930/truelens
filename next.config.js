/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow large image uploads (10MB)
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // Transpile next-auth so it resolves the correct React instance during
  // `next build` prerendering (avoids "useContext null" dual-React error)
  transpilePackages: ["next-auth"],
};

module.exports = nextConfig;
