import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The whole app is client-side, so it exports to plain HTML/CSS/JS in `out/`
  // and FastAPI serves it. One process, one port, one container.
  //
  // This rules out server-side features by design — no Server Actions, no
  // Route Handlers reading a request, no server redirects. Anything needing a
  // server belongs in the FastAPI backend under /api.
  output: "export",

  turbopack: {
    // Pin the workspace root to this directory. Without it Turbopack walks up
    // looking for a lockfile and can latch onto an unrelated one outside the
    // repository.
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
