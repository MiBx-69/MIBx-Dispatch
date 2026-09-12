import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow Shopify Admin iframe embedding and fast responsive streaming
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,

  turbopack: {
    root: process.cwd(),
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors https://*.myshopify.com https://admin.shopify.com https://*.spin.dev http://localhost:* 'self';",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
