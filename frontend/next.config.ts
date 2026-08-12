import type { NextConfig } from "next";

// API calls are proxied at runtime by app/api/[...path]/route.ts using
// GENESIS_API_URL — no build-time backend coupling.
const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
