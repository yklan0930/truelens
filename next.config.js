/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow large image uploads (10MB)
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
    // @contentauth/c2pa-node ships a NATIVE Rust addon (dist/index.node) that is
    // downloaded at build time (see scripts/ensure-c2pa-binary.mjs). Keep it
    // external so Next.js does not try to bundle/inline the native binary, which
    // would otherwise break with "Cannot find module './index.node'" at runtime
    // on Vercel.
    serverComponentsExternalPackages: ["@contentauth/c2pa-node"],
  },
  // Transpile next-auth so it resolves the correct React instance during
  // `next build` prerendering (avoids "useContext null" dual-React error)
  transpilePackages: ["next-auth"],
};

module.exports = nextConfig;
