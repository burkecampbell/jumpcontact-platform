import type { NextConfig } from "next";

// Amplify SSR Lambda doesn't receive app-level env vars at runtime.
// Embed server-side env vars at build time.
const serverEnvKeys = [
  'CLERK_SECRET_KEY',
  'NEXT_PUBLIC_OPS_CENTER_URL',
];

const embeddedEnv: Record<string, string> = {};
for (const key of serverEnvKeys) {
  if (process.env[key]) {
    embeddedEnv[key] = process.env[key]!;
  }
}

const nextConfig: NextConfig = {
  env: embeddedEnv,
};

export default nextConfig;
