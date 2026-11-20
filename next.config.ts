import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  output: "standalone",
  // Database drivers load with Node's require; Next lists them by default too, this keeps it explicit.
  serverExternalPackages: ["@libsql/client", "libsql", "pg"],
  // Added to every response, route handlers included; the attachment route keeps its own headers too.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
  experimental: {
    serverActions: {
      // Story comments carry up to 5 attachments of 10 MB each, plus multipart overhead.
      bodySizeLimit: "55mb",
    },
  },
  // Tailwind v4 via the Turbopack loader (set up by create-next-app; no postcss config exists).
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

// Reads the request config from `src/i18n/request.ts`.
export default createNextIntlPlugin()(nextConfig);
