// @vitest-environment jsdom
/**
 * The landing page.
 *
 * The property worth protecting is that a signed-out visitor sees the page
 * itself rather than a spinner — including on the very first render, before the
 * session check has come back. That first render is what a static export writes
 * into `out/index.html`, so if this regressed to a loading state the deployed
 * homepage would literally be the word "Loading".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), prefetch: vi.fn() }),
}));

import Home from "@/app/page";
import { SessionProvider } from "@/components/SessionProvider";
import { SIGNED_OUT, signedIn, stubApi } from "../api-mock";

function renderHome() {
  return render(
    <SessionProvider>
      <Home />
    </SessionProvider>,
  );
}

beforeEach(() => {
  replace.mockClear();
  stubApi(SIGNED_OUT);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the landing page", () => {
  it("says what Prelegal does", () => {
    renderHome();

    expect(
      screen.getByRole("heading", { name: /Draft a business agreement/i }),
    ).toBeInTheDocument();
  });

  it("offers both ways in", () => {
    renderHome();

    expect(
      screen.getByRole("link", { name: /Create an account/ }),
    ).toHaveAttribute("href", "/signup");
    expect(screen.getAllByRole("link", { name: /Sign in/ })[0]).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("names the documents it can draft", () => {
    renderHome();

    expect(screen.getByText("Mutual NDA")).toBeInTheDocument();
    expect(screen.getByText("Pilot Agreement")).toBeInTheDocument();
  });

  it("keeps the Common Paper attribution and the draft notice in the footer", () => {
    renderHome();

    // The hero names Common Paper too, so match the licence line itself.
    expect(screen.getByText(/licensed under CC BY 4.0/)).toBeInTheDocument();
    expect(screen.getByText(/reviewed by a lawyer/)).toBeInTheDocument();
  });

  it("does not redirect a signed-out visitor away", async () => {
    renderHome();

    await waitFor(() =>
      expect(screen.getByText(/licensed under CC BY 4.0/)).toBeVisible(),
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it("sends a signed-in visitor straight to their documents", async () => {
    stubApi(signedIn());
    renderHome();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/documents"));
  });
});
