/**
 * Who is "signed in".
 *
 * There is no authentication here and none is implied. The backend creates a
 * user row for whatever email is typed, without a password and without
 * verifying anything, and this module keeps the resulting row in localStorage.
 * Anyone can be anyone. PL-4 asks only for a way into the platform.
 *
 * When real auth lands it replaces this file: the shape a component consumes
 * (`useSession`) is meant to survive, the storage mechanism is not.
 */

export type User = {
  id: number;
  email: string;
  display_name: string;
  created_at: string;
};

const STORAGE_KEY = "prelegal.user";

/**
 * Dispatched after a write. The DOM "storage" event only fires in *other* tabs,
 * so without this the tab that signed in would never re-render.
 */
export const SESSION_CHANGED_EVENT = "prelegal:session-changed";

function announceChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
}

/** Parse a raw stored value. Anything unexpected reads as signed out. */
export function readStoredUserFrom(raw: string | null): User | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isUser(parsed) ? parsed : null;
  } catch {
    // A corrupt or hand-edited value: treat as signed out.
    return null;
  }
}

/** Read the stored user, or null. Safe to call before hydration. */
export function readStoredUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    return readStoredUserFrom(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    // Private mode, or site data disabled.
    return null;
  }
}

export function storeUser(user: User): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } catch {
    // Non-fatal: the session just will not survive a reload.
  }
  announceChange();
}

export function clearStoredUser(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Non-fatal.
  }
  announceChange();
}

/** Guards against a stale or hand-edited localStorage value. */
function isUser(value: unknown): value is User {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "number" &&
    typeof candidate.email === "string" &&
    typeof candidate.display_name === "string" &&
    typeof candidate.created_at === "string"
  );
}

/** Sign in, creating the user on first use. Throws with a readable message. */
export async function signIn(email: string, displayName?: string): Promise<User> {
  const response = await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, display_name: displayName || null }),
  });

  if (!response.ok) {
    throw new Error(
      response.status === 422
        ? "That does not look like an email address."
        : "Could not reach the server. Is the backend running?",
    );
  }

  return (await response.json()) as User;
}
