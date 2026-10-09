import type { NextConfig } from "next";

/**
 * Production: a static export (`out/`) that the FastAPI server serves, so SABHA still ships as one container.
 * Development: `next dev` on :3000 proxies REST calls to the Python server (SABHA_API, default :8765).
 * The WebSocket connects to the Python server directly (see lib/api.ts).
 */
const isDev = process.env.NODE_ENV !== "production";
const API = (process.env.SABHA_API || "http://127.0.0.1:8765").replace(/\/$/, "");

const nextConfig: NextConfig = {
  output: isDev ? undefined : "export",
  images: { unoptimized: true },
  ...(isDev && {
    async rewrites() {
      return ["/api/:path*", "/simulate", "/health"].map((source) => ({
        source,
        destination: `${API}${source}`,
      }));
    },
  }),
};

export default nextConfig;
