// @vitest-environment jsdom
/**
 * The signed-in shell.
 *
 * Two things matter here. The header must be `print:hidden` — it is the app
 * chrome that used to live on the creator page, and if it leaks into the print
 * stylesheet it ends up in every generated PDF. And the guard must not bounce a
 * signed-in user to the login screen while the stored session is still being
 * read.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), prefetch: vi.fn() }),
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

const ADA = {
  id: 1,
  email: "ada@example.com",
  display_name: "Ada Lovelace",
  created_at: "2026-09-15 12:00:00",
};

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
  window.localStorage.clear();
});

describe("the signed-in shell", () => {
  it("keeps the app chrome out of print", async () => {
    window.localStorage.setItem("prelegal.user", JSON.stringify(ADA));
    const { container } = renderShell();

    await screen.findByText("the page");
    expect(container.querySelector("header")?.className).toContain("print:hidden");
  });

  it("shows the signed-in user", async () => {
    window.localStorage.setItem("prelegal.user", JSON.stringify(ADA));
    renderShell();

    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
  });

  it("renders the page for a signed-in user", async () => {
    window.localStorage.setItem("prelegal.user", JSON.stringify(ADA));
    renderShell();

    expect(await screen.findByText("the page")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("sends a signed-out visitor to the login screen", async () => {
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
    window.localStorage.setItem("prelegal.user", JSON.stringify(ADA));
    const user = userEvent.setup();
    renderShell();

    await screen.findByText("the page");
    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(window.localStorage.getItem("prelegal.user")).toBeNull();
    expect(replace).toHaveBeenCalledWith("/login");
  });
});
