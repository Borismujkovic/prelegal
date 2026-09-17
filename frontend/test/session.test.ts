// @vitest-environment jsdom
/**
 * The session module.
 *
 * Note what is no longer here, because it no longer exists: nothing is written
 * to localStorage, and there is no stored value to parse, corrupt or guard
 * against. The session token lives in an HttpOnly cookie this code cannot read,
 * which is the point — so what is left to test is the requests, and that the
 * failures a user can actually hit come back as sentences rather than as status
 * codes.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchCurrentUser,
  register,
  signIn,
  signOut,
  UnauthorizedError,
} from "@/lib/session";
import { ADA, bodyOf, stubApi } from "./api-mock";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("registering", () => {
  it("posts the credentials and returns the new user", async () => {
    const fetchMock = stubApi({ "POST /api/auth/register": { json: ADA } });

    await expect(register("ada@example.com", "hunter2hunter2")).resolves.toEqual(ADA);

    const [, init] = fetchMock.mock.calls[0];
    expect(bodyOf(init)).toEqual({
      email: "ada@example.com",
      password: "hunter2hunter2",
      display_name: null,
    });
  });

  it("sends a display name when one was given", async () => {
    const fetchMock = stubApi({ "POST /api/auth/register": { json: ADA } });

    await register("ada@example.com", "hunter2hunter2", "  Ada  ");

    expect(bodyOf(fetchMock.mock.calls[0][1])).toMatchObject({ display_name: "Ada" });
  });

  it("says plainly when the email is already taken", async () => {
    stubApi({ "POST /api/auth/register": { status: 409 } });

    await expect(register("ada@example.com", "hunter2hunter2")).rejects.toThrow(
      /already has an account/,
    );
  });

  it("explains a password the server refused", async () => {
    stubApi({
      "POST /api/auth/register": {
        status: 422,
        json: { detail: [{ loc: ["body", "password"], msg: "too short" }] },
      },
    });

    await expect(register("ada@example.com", "short")).rejects.toThrow(
      /at least 8 characters/,
    );
  });

  it("explains an email the server refused", async () => {
    stubApi({
      "POST /api/auth/register": {
        status: 422,
        json: { detail: [{ loc: ["body", "email"], msg: "bad" }] },
      },
    });

    await expect(register("nope", "hunter2hunter2")).rejects.toThrow(
      /does not look like an email/,
    );
  });
});

describe("signing in", () => {
  it("posts the credentials and returns the user", async () => {
    const fetchMock = stubApi({ "POST /api/auth/login": { json: ADA } });

    await expect(signIn("ada@example.com", "hunter2hunter2")).resolves.toEqual(ADA);
    expect(bodyOf(fetchMock.mock.calls[0][1])).toEqual({
      email: "ada@example.com",
      password: "hunter2hunter2",
    });
  });

  it("sends the cookie along", async () => {
    // The whole design rests on this. A request that forgets it is a request
    // that is never authenticated, and the symptom would be a mystery.
    const fetchMock = stubApi({ "POST /api/auth/login": { json: ADA } });

    await signIn("ada@example.com", "hunter2hunter2");

    expect(fetchMock.mock.calls[0][1].credentials).toBe("same-origin");
  });

  it("reports a wrong password without saying which half was wrong", async () => {
    stubApi({ "POST /api/auth/login": { status: 401 } });

    await expect(signIn("ada@example.com", "wrong")).rejects.toThrow(
      /do not match an account/,
    );
  });

  it("explains an unreachable backend", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));

    await expect(signIn("ada@example.com", "hunter2hunter2")).rejects.toThrow(
      /Could not reach the server/,
    );
  });
});

describe("who is signed in", () => {
  it("returns the user when the cookie is good", async () => {
    stubApi({ "GET /api/auth/me": { json: ADA } });

    await expect(fetchCurrentUser()).resolves.toEqual(ADA);
  });

  it("reads a 401 as nobody rather than as an error", async () => {
    // Being signed out is the ordinary answer to this question, not a failure.
    stubApi({ "GET /api/auth/me": { status: 401 } });

    await expect(fetchCurrentUser()).resolves.toBeNull();
  });
});

describe("signing out", () => {
  it("tells the server to end the session", async () => {
    const fetchMock = stubApi({ "POST /api/auth/logout": { status: 204 } });

    await signOut();

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("never throws, even when the server cannot be reached", async () => {
    // A user who pressed "sign out" must not stay signed in because the network
    // was down.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));

    await expect(signOut()).resolves.toBeUndefined();
  });
});

describe("UnauthorizedError", () => {
  it("is identifiable, so a caller can end the session instead of showing an error", () => {
    const error = new UnauthorizedError();

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("UnauthorizedError");
  });
});
