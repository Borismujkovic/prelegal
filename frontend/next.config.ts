import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root to this directory. Without it Turbopack walks up
    // looking for a lockfile and can latch onto an unrelated one outside the
    // repository.
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
