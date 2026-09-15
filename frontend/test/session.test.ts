// @vitest-environment jsdom
/**
 * The session module.
 *
 * Note what is *not* tested, because it does not exist: no password, no token,
 * no expiry. These tests pin the storage contract and the failure modes, since
 * a corrupt or unreadable localStorage must present as "signed out" rather than
 * crashing the app on boot.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearStoredUser,
  readStoredUser,
  signIn,
  storeUser,
  type User,
} from "@/lib/session";

const ADA: User = {
  id: 1,
  email: "ada@example.com",
  display_name: "Ada Lovelace",
  created_at: "2026-09-15 12:00:00",
};

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("stored session", () => {
  it("round-trips a user", () => {
    storeUser(ADA);
    expect(readStoredUser()).toEqual(ADA);
  });

  it("reads as signed out when nothing is stored", () => {
    expect(readStoredUser()).toBeNull();
  });

  it("clears", () => {
    storeUser(ADA);
    clearStoredUser();
    expect(readStoredUser()).toBeNull();
  });

  it("treats unparseable storage as signed out", () => {
    window.localStorage.setItem("prelegal.user", "{not json");
    expect(readStoredUser()).toBeNull();
  });

  it("rejects a stored value of the wrong shape", () => {
    window.localStorage.setItem("prelegal.user", JSON.stringify({ id: "1" }));
    expect(readStoredUser()).toBeNull();
  });

  it("survives localStorage throwing", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readStoredUser()).toBeNull();
  });
});

describe("signIn", () => {
  it("posts the email and returns the user", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ADA,
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(signIn("ada@example.com")).resolves.toEqual(ADA);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/session");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      email: "ada@example.com",
      display_name: null,
    });
  });

  it("explains a rejected email", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 422 }));
    await expect(signIn("nope")).rejects.toThrow(/does not look like an email/);
  });

  it("explains an unreachable backend", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(signIn("ada@example.com")).rejects.toThrow(/Could not reach the server/);
  });
});

describe("change notification", () => {
  it("announces a sign-in to the current tab", () => {
    // The DOM "storage" event only fires in other tabs, so without this the tab
    // that signed in would never re-render.
    const listener = vi.fn();
    window.addEventListener("prelegal:session-changed", listener);

    storeUser(ADA);

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener("prelegal:session-changed", listener);
  });

  it("announces a sign-out to the current tab", () => {
    const listener = vi.fn();
    window.addEventListener("prelegal:session-changed", listener);

    clearStoredUser();

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener("prelegal:session-changed", listener);
  });

  it("still announces when the write itself fails", () => {
    // Storage blocked in private mode must not leave the UI stuck on the old
    // session; the in-memory view still needs to update.
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const listener = vi.fn();
    window.addEventListener("prelegal:session-changed", listener);

    storeUser(ADA);

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener("prelegal:session-changed", listener);
  });
});
