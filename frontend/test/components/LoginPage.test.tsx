// @vitest-environment jsdom
/**
 * The sign-in screen.
 *
 * The first test is the one that changed: this screen used to have to *say* it
 * was not real authentication, and now it has to ask for a password. The rest
 * is ordinary form behaviour.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), prefetch: vi.fn() }),
}));

import LoginPage from "@/app/login/page";
import { SessionProvider } from "@/components/SessionProvider";
import { ADA, bodyOf, SIGNED_OUT, signedIn, stubApi } from "../api-mock";

function renderLogin() {
  return render(
    <SessionProvider>
      <LoginPage />
    </SessionProvider>,
  );
}

beforeEach(() => {
  replace.mockClear();
  stubApi({ ...SIGNED_OUT, "POST /api/auth/login": { json: ADA } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the sign-in screen", () => {
  it("asks for a password", () => {
    const { container } = renderLogin();

    expect(container.querySelector('input[type="password"]')).not.toBeNull();
  });

  it("no longer claims to be a placeholder", () => {
    // It said so for as long as it was true. PL-7 made it untrue.
    renderLogin();

    expect(screen.queryByText(/Placeholder sign-in/i)).toBeNull();
    expect(screen.queryByText(/no authentication yet/i)).toBeNull();
  });

  it("signs in and goes to the documents dashboard", async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "hunter2hunter2");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/documents"));
  });

  it("sends what was typed", async () => {
    const fetchMock = stubApi({
      ...SIGNED_OUT,
      "POST /api/auth/login": { json: ADA },
    });
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText("Email"), "  ada@example.com  ");
    await user.type(screen.getByLabelText("Password"), "hunter2hunter2");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(replace).toHaveBeenCalled());
    const login = fetchMock.mock.calls.find(([url]) => url === "/api/auth/login");
    expect(bodyOf(login![1])).toEqual({
      email: "ada@example.com",
      password: "hunter2hunter2",
    });
  });

  it("shows why a sign-in failed, and lets you try again", async () => {
    stubApi({ ...SIGNED_OUT, "POST /api/auth/login": { status: 401 } });
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/do not match/);
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("offers a way to create an account", () => {
    renderLogin();

    expect(screen.getByRole("link", { name: /Create an account/ })).toHaveAttribute(
      "href",
      "/signup",
    );
  });

  it("skips the screen for someone already signed in", async () => {
    stubApi({ ...signedIn(), "POST /api/auth/login": { json: ADA } });
    renderLogin();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/documents"));
  });
});
