/**
 * A stand-in for the API, routed by method and path.
 *
 * Every suite used to stub `fetch` with a single canned reply, which worked
 * while a screen only ever called one endpoint. It does not any more: knowing
 * who is signed in is a request now, so almost every component test makes at
 * least two.
 *
 * An unmatched request rejects rather than returning something empty. A test
 * that quietly gets `undefined` back from an endpoint it forgot to stub fails
 * somewhere far from the cause, and usually looks like a bug in the component.
 */
import { vi, type Mock } from "vitest";
import type { User } from "@/lib/session";

export const ADA: User = {
  id: 1,
  email: "ada@example.com",
  display_name: "Ada Lovelace",
  created_at: "2026-09-15 12:00:00",
};

export type ApiReply = { status?: number; json?: unknown };

export type ApiRoutes = Record<
  string,
  ApiReply | ((init: RequestInit) => ApiReply)
>;

/**
 * Stub `fetch`. Keys are `"METHOD /path"`, e.g. `"GET /api/drafts"`.
 *
 * The query string is deliberately not part of the key: no route in this app
 * varies by one, and including it would make every stub restate a `?draft=`
 * that only the component under test knows about.
 */
export function stubApi(routes: ApiRoutes): Mock {
  const fetchMock = vi.fn(async (input: string, init: RequestInit = {}) => {
    const method = (init.method ?? "GET").toUpperCase();
    const { pathname } = new URL(input, "http://localhost");
    const key = `${method} ${pathname}`;

    const route = routes[key];
    if (!route) throw new Error(`No API stub for ${key}`);

    const reply = typeof route === "function" ? route(init) : route;
    const status = reply.status ?? 200;

    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => reply.json,
      text: async () => JSON.stringify(reply.json ?? ""),
    } as unknown as Response;
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The session endpoints, answering as a signed-in user. */
export function signedIn(user: User = ADA): ApiRoutes {
  return {
    "GET /api/auth/me": { json: user },
    "POST /api/auth/logout": { status: 204 },
  };
}

/** The session endpoints, answering as nobody. */
export const SIGNED_OUT: ApiRoutes = {
  "GET /api/auth/me": { status: 401, json: { detail: "You are not signed in." } },
};

/** What the request body was, parsed. */
export function bodyOf(init: RequestInit): unknown {
  return JSON.parse(String(init.body));
}
