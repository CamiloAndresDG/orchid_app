import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Servidor autocontenido (.next/standalone) para la imagen Docker.
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
