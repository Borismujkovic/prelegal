/**
 * Shared test setup.
 *
 * The pure-logic suites run in the `node` environment, which is markedly faster
 * than spinning up jsdom per file; component suites opt in with a
 * `@vitest-environment jsdom` docblock. Testing Library needs a DOM, so it is
 * only wired up when one is present.
 */
import { afterEach } from "vitest";

if (typeof document !== "undefined") {
  await import("@testing-library/jest-dom/vitest");
  const { cleanup } = await import("@testing-library/react");
  afterEach(cleanup);
}
