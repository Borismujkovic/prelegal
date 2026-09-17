// @vitest-environment jsdom
/**
 * The sign-up screen.
 *
 * The two checks worth pinning are the ones the server does not do: that the
 * confirmation has to match, and that a short password is caught before a round
 * trip rather than after one. Both are statements about this form, which is why
 * they live here and not in the API.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), prefetch: vi.fn() }),
}));

import SignupPage from "@/app/signup/page";
import { SessionProvider } from "@/components/SessionProvider";
import { ADA, bodyOf, SIGNED_OUT, stubApi } from "../api-mock";

function renderSignup() {
  return render(
    <SessionProvider>
      <SignupPage />
    </SessionProvider>,
  );
}

async function fillIn(
  user: ReturnType<typeof userEvent.setup>,
  password: string,
  confirmation = password,
) {
  await user.type(screen.getByLabelText("Email"), "ada@example.com");
  await user.type(screen.getByLabelText("Password"), password);
  await user.type(screen.getByLabelText("Confirm password"), confirmation);
}

beforeEach(() => {
  replace.mockClear();
  stubApi({ ...SIGNED_OUT, "POST /api/auth/register": { json: ADA } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the sign-up screen", () => {
  it("creates the account and goes to the dashboard", async () => {
    const user = userEvent.setup();
    renderSignup();

    await fillIn(user, "hunter2hunter2");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/documents"));
  });

  it("sends the optional name when one was given", async () => {
    const fetchMock = stubApi({
      ...SIGNED_OUT,
      "POST /api/auth/register": { json: ADA },
    });
    const user = userEvent.setup();
    renderSignup();

    await user.type(screen.getByLabelText(/Name/), "Ada Lovelace");
    await fillIn(user, "hunter2hunter2");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(replace).toHaveBeenCalled());
    const call = fetchMock.mock.calls.find(([url]) => url === "/api/auth/register");
    expect(bodyOf(call![1])).toMatchObject({ display_name: "Ada Lovelace" });
  });

  it("refuses two passwords that do not match, without asking the server", async () => {
    const fetchMock = stubApi({
      ...SIGNED_OUT,
      "POST /api/auth/register": { json: ADA },
    });
    const user = userEvent.setup();
    renderSignup();

    await fillIn(user, "hunter2hunter2", "hunter2hunter3");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/do not match/);
    expect(
      fetchMock.mock.calls.some(([url]) => url === "/api/auth/register"),
    ).toBe(false);
  });

  it("catches a short password before the round trip", async () => {
    const fetchMock = stubApi({
      ...SIGNED_OUT,
      "POST /api/auth/register": { json: ADA },
    });
    const user = userEvent.setup();
    renderSignup();

    await fillIn(user, "short");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/at least 8/);
    expect(
      fetchMock.mock.calls.some(([url]) => url === "/api/auth/register"),
    ).toBe(false);
  });

  it("reports an email that is already registered", async () => {
    stubApi({ ...SIGNED_OUT, "POST /api/auth/register": { status: 409 } });
    const user = userEvent.setup();
    renderSignup();

    await fillIn(user, "hunter2hunter2");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /already has an account/,
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it("offers a way back to signing in", () => {
    renderSignup();

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login",
    );
  });
});
