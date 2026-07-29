import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Ship a self-contained server bundle so the Docker image stays small.
  output: 'standalone',
  // better-sqlite3 is a native addon — it must be required at runtime, never bundled.
  serverExternalPackages: ['better-sqlite3'],
  poweredByHeader: false,
};

export default nextConfig;
