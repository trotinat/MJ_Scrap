import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Local runs without Docker: read the project-root .env (never overrides real variables).
const rootEnv = path.join(dirname, "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output (self-contained server) is only used for Docker images:
  // on Windows it needs symlink rights that a normal user does not have.
  ...(process.env.NEXT_STANDALONE === "1" ? { output: "standalone", outputFileTracingRoot: path.join(dirname, "../..") } : {}),
  transpilePackages: ["@mdw/shared", "@mdw/database", "@mdw/notifications", "@mdw/scoring"],
  serverExternalPackages: ["pg"],
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    serverActions: { bodySizeLimit: "1mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
