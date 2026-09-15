"use client";

/**
 * Makes the stored user available to the tree, and keeps the "still checking"
 * state explicit.
 *
 * localStorage is an external store, so it is read through
 * `useSyncExternalStore` rather than copied into state inside an effect. That
 * buys three things: no cascading re-render on mount, a signed-out tab that
 * notices when another tab signs in, and a `hydrated` flag that is honest about
 * the one render where the answer is not yet known.
 *
 * `hydrated` matters because the app is a static export. The prerendered HTML
 * is built with nobody signed in, so the first client render must agree with it
 * or hydration mismatches. Reporting "loading" for that render is what stops
 * the shell flashing signed-out chrome and the route guard bouncing a
 * signed-in user to the login screen.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  SESSION_CHANGED_EVENT,
  clearStoredUser,
  readStoredUserFrom,
  storeUser,
  type User,
} from "@/lib/session";

type SessionStatus = "loading" | "signed-in" | "signed-out";

type SessionContextValue = {
  user: User | null;
  status: SessionStatus;
  setUser: (user: User) => void;
  signOut: () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

/** Notified by `storage` (other tabs) and our own event (this tab). */
function subscribeToStoredUser(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(SESSION_CHANGED_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(SESSION_CHANGED_EVENT, onChange);
  };
}

/** The raw string, so React can compare snapshots by value. */
function getStoredUserSnapshot(): string | null {
  try {
    return window.localStorage.getItem("prelegal.user");
  } catch {
    return null;
  }
}

/** Nobody is signed in in the prerendered HTML. */
function getStoredUserServerSnapshot(): string | null {
  return null;
}

const subscribeToNothing = () => () => {};

export function SessionProvider({ children }: { children: ReactNode }) {
  // False for the prerender and the hydrating render, true from then on.
  const hydrated = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );

  const raw = useSyncExternalStore(
    subscribeToStoredUser,
    getStoredUserSnapshot,
    getStoredUserServerSnapshot,
  );

  const user = useMemo(() => readStoredUserFrom(raw), [raw]);

  const setUser = useCallback((next: User) => {
    storeUser(next);
  }, []);

  const signOut = useCallback(() => {
    clearStoredUser();
  }, []);

  const status: SessionStatus = !hydrated
    ? "loading"
    : user
      ? "signed-in"
      : "signed-out";

  const value = useMemo(
    () => ({ user, status, setUser, signOut }),
    [user, status, setUser, signOut],
  );

  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error("useSession must be used inside a SessionProvider");
  }
  return value;
}
