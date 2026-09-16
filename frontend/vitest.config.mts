import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    // Pure-logic suites run in node; component suites opt into jsdom with a
    // `@vitest-environment jsdom` docblock, which keeps the fast suites fast.
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.{ts,tsx}"],
    globals: true,
    // The default 5s is measured per test, but the clock runs while other
    // workers compete for the CPU. Since PL-6 the suite renders six documents'
    // worth of jsdom alongside the Mutual NDA's, and `userEvent` typing — which
    // waits on real timers between keystrokes — starts losing races it would
    // win when run alone. The symptom is a keystroke-interleaved value like
    // "dDeeallaware", which is contention rather than anything the code did.
    testTimeout: 20_000,
  },
});
