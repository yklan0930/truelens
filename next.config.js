/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow large image uploads (10MB)
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
    // @contentauth/c2pa-wasm ships a WASM module loaded via
    // `new URL('x.wasm', import.meta.url)`. Keep it external so webpack does not
    // try to bundle the .wasm asset (which would break at runtime on Vercel
    // serverless). Externalizing lets Node load it directly from node_modules.
    serverComponentsExternalPackages: ["@contentauth/c2pa-wasm"],
  },
  // Transpile next-auth so it resolves the correct React instance during
  // `next build` prerendering (avoids "useContext null" dual-React error)
  transpilePackages: ["next-auth"],
};

module.exports = nextConfig;
