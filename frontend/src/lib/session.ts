/**
 * Who is signed in.
 *
 * Nothing about the session is stored here any more. It used to live in
 * localStorage, because there was no real session to store — the backend took
 * an email and handed back a user row. Now there is a password and a session
 * the server can end, and the token for it lives in an HttpOnly cookie that
 * this file cannot read and neither can anything else on the page. That is the
 * point: a token in localStorage is one cross-site script away from being
 * someone else's.
 *
 * So "am I signed in" becomes a question for the server rather than a value to
 * read, and `fetchCurrentUser` is how it is asked. The shape a component
 * consumes (`useSession`) is deliberately unchanged from before.
 */

export type User = {
  id: number;
  email: string;
  display_name: string;
  created_at: string;
};

/** Thrown when the server says the session is over. */
export class UnauthorizedError extends Error {
  constructor(message = "Your session has ended. Please sign in again.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

const UNREACHABLE = "Could not reach the server. Is the backend running?";

/**
 * `same-origin` is the browser default, and stated anyway: this whole design
 * rests on the cookie riding along, and a default is a poor place to keep
 * something load-bearing.
 */
async function send(path: string, body: unknown): Promise<Response> {
  try {
    return await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });
  } catch {
    // A network-level failure, not an HTTP status.
    throw new Error(UNREACHABLE);
  }
}

/**
 * Turn a validation failure into something a person can act on.
 *
 * FastAPI's 422 body is a list of per-field errors aimed at a developer. The
 * two that a user can actually hit are worth translating; anything else falls
 * back to a general message rather than showing them a JSON path.
 */
async function describeFailure(response: Response): Promise<string> {
  if (response.status === 409) {
    return "That email address already has an account. Sign in instead.";
  }
  if (response.status === 422) {
    const detail = await readDetail(response);
    return detail.includes("password")
      ? "Your password needs to be at least 8 characters."
      : "That does not look like an email address.";
  }
  if (response.status === 401) {
    return "That email address and password do not match an account.";
  }
  return UNREACHABLE;
}

async function readDetail(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    return JSON.stringify(body);
  } catch {
    return "";
  }
}

export async function register(
  email: string,
  password: string,
  displayName?: string,
): Promise<User> {
  const response = await send("/api/auth/register", {
    email,
    password,
    display_name: displayName?.trim() || null,
  });

  if (!response.ok) throw new Error(await describeFailure(response));
  return (await response.json()) as User;
}

export async function signIn(email: string, password: string): Promise<User> {
  const response = await send("/api/auth/login", { email, password });

  if (!response.ok) throw new Error(await describeFailure(response));
  return (await response.json()) as User;
}

/**
 * End the session. Never throws.
 *
 * Signing out has to work even when the server cannot be reached, because the
 * alternative is a user who has pressed "sign out" and is still apparently
 * signed in. The backend answers 204 even for a cookie it does not recognise,
 * so the only failure left here is the network — and in that case dropping the
 * session locally is still the right thing to do.
 */
export async function signOut(): Promise<void> {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
    });
  } catch {
    // Nothing useful to do, and nothing the user could do about it.
  }
}

/**
 * The signed-in user, or null. Never throws for "not signed in".
 *
 * A 401 here is the ordinary answer to the question, not an error: it is what
 * a visitor who has never signed in gets. Genuine failures — the backend being
 * down — also read as signed out, because the app cannot show anything behind
 * the guard without it anyway.
 */
export async function fetchCurrentUser(signal?: AbortSignal): Promise<User | null> {
  const response = await fetch("/api/auth/me", {
    credentials: "same-origin",
    signal,
  });

  if (response.status === 401) return null;
  if (!response.ok) throw new Error(UNREACHABLE);
  return (await response.json()) as User;
}
