// @vitest-environment jsdom
/**
 * The signed-in shell.
 *
 * Two things matter here. The header must be `print:hidden` — it is the app
 * chrome that used to live on the creator page, and if it leaks into the print
 * stylesheet it ends up in every generated PDF. And the guard must not bounce a
 * signed-in user to the login screen while the session is still being checked.
 *
 * That second one matters more than it used to. The session used to be a
 * synchronous read of localStorage; it is now a request to `/api/auth/me`, so
 * the window in which the answer is unknown is a real network round trip rather
 * than a single render.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/documents",
}));

// Lets one test hold the session in its "loading" state. Testing Library
// flushes effects inside act(), so the provider has always resolved by the time
// render() returns and the loading branch is otherwise unobservable.
let sessionOverride: { status?: string; user?: unknown } | null = null;
vi.mock("@/components/SessionProvider", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/components/SessionProvider")>();
  return {
    ...actual,
    useSession: () => {
      const real = actual.useSession();
      return sessionOverride ? { ...real, ...sessionOverride } : real;
    },
  };
});

import DocumentsLayout from "@/app/documents/layout";
import { SessionProvider } from "@/components/SessionProvider";
import { SIGNED_OUT, signedIn, stubApi } from "../api-mock";

function renderShell() {
  return render(
    <SessionProvider>
      <DocumentsLayout>
        <p>the page</p>
      </DocumentsLayout>
    </SessionProvider>,
  );
}

beforeEach(() => {
  replace.mockClear();
  sessionOverride = null;
  stubApi(signedIn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the signed-in shell", () => {
  it("keeps the app chrome out of print", async () => {
    const { container } = renderShell();

    await screen.findByText("the page");
    expect(container.querySelector("header")?.className).toContain("print:hidden");
  });

  it("shows the signed-in user", async () => {
    renderShell();

    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
  });

  it("renders the page for a signed-in user", async () => {
    renderShell();

    expect(await screen.findByText("the page")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("offers a way to the saved drafts", async () => {
    renderShell();

    await screen.findByText("the page");
    expect(screen.getByRole("link", { name: "Saved drafts" })).toHaveAttribute(
      "href",
      "/documents/history",
    );
  });

  it("marks the page you are on", async () => {
    renderShell();

    await screen.findByText("the page");
    expect(screen.getByRole("link", { name: "All documents" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Saved drafts" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("sends a signed-out visitor to the login screen", async () => {
    stubApi(SIGNED_OUT);
    renderShell();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(screen.queryByText("the page")).not.toBeInTheDocument();
  });

  it("does not flash the page or redirect while the session is loading", () => {
    sessionOverride = { status: "loading", user: null };
    renderShell();

    expect(screen.queryByText("the page")).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("signs out back to the login screen", async () => {
    const fetchMock = stubApi(signedIn());
    const user = userEvent.setup();
    renderShell();

    await screen.findByText("the page");
    await user.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) => url === "/api/auth/logout"),
      ).toBe(true),
    );
    expect(replace).toHaveBeenCalledWith("/login");
  });

  it("carries the draft notice and the attribution in the footer", async () => {
    renderShell();

    await screen.findByText("the page");
    expect(screen.getByText(/reviewed by a lawyer/)).toBeInTheDocument();
    expect(screen.getByText(/Common Paper/)).toBeInTheDocument();
  });
});
