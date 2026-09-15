// @vitest-environment jsdom
/**
 * The fake login screen.
 *
 * The first test is the important one: the screen has to *say* it is not real
 * authentication. Everything else here is ordinary form behaviour.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), prefetch: vi.fn() }),
}));

import LoginPage from "@/app/login/page";
import { SessionProvider } from "@/components/SessionProvider";

const ADA = {
  id: 1,
  email: "ada@example.com",
  display_name: "Ada",
  created_at: "2026-09-15 12:00:00",
};

function renderLogin() {
  return render(
    <SessionProvider>
      <LoginPage />
    </SessionProvider>,
  );
}

beforeEach(() => {
  replace.mockClear();
  window.localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ADA }),
  );
});

describe("the login screen", () => {
  it("says plainly that it is not real authentication", () => {
    renderLogin();
    expect(screen.getByText(/Placeholder sign-in/i)).toBeInTheDocument();
    expect(screen.getByText(/no authentication yet/i)).toBeInTheDocument();
  });

  it("asks for no password", () => {
    const { container } = renderLogin();
    expect(container.querySelector('input[type="password"]')).toBeNull();
  });

  it("signs in and goes to the documents dashboard", async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/documents"));
  });

  it("stores the user so a reload stays signed in", async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() =>
      expect(window.localStorage.getItem("prelegal.user")).toContain("ada@example.com"),
    );
  });

  it("shows the reason a sign-in failed and stays put", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Could not reach the server/);
    expect(replace).not.toHaveBeenCalledWith("/documents");
  });

  it("lets the user retry after a failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("alert");

    // The button must not be stuck in its submitting state.
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("skips the screen for someone already signed in", async () => {
    window.localStorage.setItem("prelegal.user", JSON.stringify(ADA));
    renderLogin();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/documents"));
  });
});
