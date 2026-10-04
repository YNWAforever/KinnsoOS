import type { NextConfig } from "next";
import path from "node:path";
import { existsSync } from "node:fs";
const parentRoot = path.resolve(process.cwd(), "../..");
const workspaceRoot = path.join(parentRoot, "apps", "journeys") === process.cwd() &&
  existsSync(path.join(parentRoot, "pnpm-workspace.yaml")) &&
  !existsSync(path.join(process.cwd(), "SOURCE_METADATA.json")) ? parentRoot : process.cwd();
const config: NextConfig = {
  turbopack:{root:workspaceRoot},
  outputFileTracingRoot:workspaceRoot,
  allowedDevOrigins:['127.0.0.1','localhost'],
  logging:{incomingRequests:{ignore:[/^\/share\//,/^\/api\/shared-media\//]},browserToTerminal:false},
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn.kinnso.ai", pathname: "/**" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};
export default config;
