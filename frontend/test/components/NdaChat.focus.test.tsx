// @vitest-environment jsdom
/**
 * Where the cursor ends up after a turn.
 *
 * Answering a question should not cost a click. The composer is disabled while
 * a turn is in flight, and disabling the element holding focus makes the
 * browser drop it to the body — so without deliberate restoration the reply
 * arrives and the cursor is nowhere.
 *
 * The exception matters as much as the rule: someone who sends a message and
 * then starts editing the form while they wait has moved on, and pulling the
 * cursor back mid-edit would be worse than the problem being fixed.
 *
 * Kept in its own file rather than added to NdaChat.test.tsx so the existing
 * suite stays exactly as it was.
 */
import { afterEach, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NdaChat } from "@/components/NdaChat";
import { EMPTY } from "../fixtures";

function respondWith(body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body }),
  );
}

function deferredResponse() {
  let release: (value: unknown) => void = () => {};
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async () => {
      await pending;
      return { ok: true, status: 200, json: async () => ({ reply: "Done.", patch: {} }) };
    }),
  );
  return () => release(undefined);
}

const composer = () => screen.getByLabelText("Message the drafting assistant");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("returns the cursor to the message box after sending with the button", async () => {
  respondWith({ reply: "Noted.", patch: {} });
  const user = userEvent.setup();
  render(<NdaChat values={EMPTY} onPatch={vi.fn()} />);

  await user.type(composer(), "Acme and Globex.");
  await user.click(screen.getByRole("button", { name: "Send" }));

  await waitFor(() => expect(screen.getByText("Noted.")).toBeInTheDocument());
  expect(document.activeElement).toBe(composer());
});

it("returns the cursor to the message box after sending with Enter", async () => {
  respondWith({ reply: "Noted.", patch: {} });
  const user = userEvent.setup();
  render(<NdaChat values={EMPTY} onPatch={vi.fn()} />);

  await user.type(composer(), "Acme and Globex.{Enter}");

  await waitFor(() => expect(screen.getByText("Noted.")).toBeInTheDocument());
  expect(document.activeElement).toBe(composer());
});

it("returns the cursor after a failed turn is retried", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 502, json: async () => ({}) })
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ reply: "Noted.", patch: {} }) }),
  );
  const user = userEvent.setup();
  render(<NdaChat values={EMPTY} onPatch={vi.fn()} />);

  await user.type(composer(), "Acme and Globex.{Enter}");
  await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: "Try again" }));

  await waitFor(() => expect(screen.getByText("Noted.")).toBeInTheDocument());
  expect(document.activeElement).toBe(composer());
});

it("leaves the cursor alone when the user moved to another field mid-turn", async () => {
  const release = deferredResponse();
  const user = userEvent.setup();
  render(
    <>
      <NdaChat values={EMPTY} onPatch={vi.fn()} />
      <input aria-label="Somewhere else" />
    </>,
  );

  await user.type(composer(), "Acme and Globex.{Enter}");
  const elsewhere = screen.getByLabelText("Somewhere else");
  await user.click(elsewhere);
  release();

  await waitFor(() => expect(screen.getByText("Done.")).toBeInTheDocument());
  expect(document.activeElement).toBe(elsewhere);
});

it("does not take focus when the message was never sent from the chat", async () => {
  respondWith({ reply: "Noted.", patch: {} });
  render(<NdaChat values={EMPTY} onPatch={vi.fn()} />);
  const outside = document.createElement("input");
  document.body.append(outside);
  outside.focus();

  // Nothing was submitted, so nothing should move.
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(document.activeElement).toBe(outside);
  outside.remove();
});
