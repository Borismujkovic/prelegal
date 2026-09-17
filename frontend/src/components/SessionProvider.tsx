"use client";

/**
 * Makes the signed-in user available to the tree, and keeps the "still
 * checking" state explicit.
 *
 * This used to read localStorage through `useSyncExternalStore`, with a
 * `hydrated` flag so the first client render agreed with the prerendered HTML.
 * The session now lives in an HttpOnly cookie that no script can read, so the
 * answer has to come from the server — which, as it happens, removes the
 * hydration problem rather than complicating it. The prerender and the first
 * client render both report "loading", because at that point neither of them
 * knows, and that is simply true.
 *
 * `status` is the thing to branch on, and it has three values for a reason: a
 * route guard that treats "loading" as "signed out" bounces every signed-in
 * user to the login screen for one render.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  fetchCurrentUser,
  signOut as endSession,
  type User,
} from "@/lib/session";

type SessionStatus = "loading" | "signed-in" | "signed-out";

type SessionContextValue = {
  user: User | null;
  status: SessionStatus;
  /** Adopt the user a sign-in or sign-up just returned. */
  setUser: (user: User) => void;
  signOut: () => Promise<void>;
  /**
   * Drop the session because the server rejected it.
   *
   * Any request can come back 401 — the database is recreated on every boot, so
   * a perfectly ordinary restart invalidates every session in existence. This
   * is how a component that hit one tells the rest of the app, instead of
   * leaving a signed-out user looking at a page that thinks otherwise.
   */
  expire: () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [status, setStatus] = useState<SessionStatus>("loading");

  useEffect(() => {
    const controller = new AbortController();

    fetchCurrentUser(controller.signal)
      .then((current) => {
        setUserState(current);
        setStatus(current ? "signed-in" : "signed-out");
      })
      .catch((cause: unknown) => {
        if (cause instanceof Error && cause.name === "AbortError") return;
        // The backend being unreachable is not a signed-in state, and there is
        // nothing behind the guard that would work without it.
        setUserState(null);
        setStatus("signed-out");
      });

    return () => controller.abort();
  }, []);

  const setUser = useCallback((next: User) => {
    setUserState(next);
    setStatus("signed-in");
  }, []);

  const expire = useCallback(() => {
    setUserState(null);
    setStatus("signed-out");
  }, []);

  const signOut = useCallback(async () => {
    // Clear locally first. `endSession` never throws, but the user pressed a
    // button and should not watch a spinner to be let out.
    expire();
    await endSession();
  }, [expire]);

  const value = useMemo(
    () => ({ user, status, setUser, signOut, expire }),
    [user, status, setUser, signOut, expire],
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
