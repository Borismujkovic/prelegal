"use client";

/**
 * Opening a saved draft, and saving one.
 *
 * Shared by both creators. What is shared is the plumbing — reading the id out
 * of the URL, the request, the state of the button — and never the values
 * themselves, which stay typed per engine. That is the line these hooks are
 * drawn along: `save` takes an already-built object and the caller decides what
 * goes in it.
 *
 * A draft is identified by `?draft=<id>` rather than by a route segment.
 * `/documents/[documentId]` is statically exported with `generateStaticParams`
 * over the documents Prelegal can draft, and there is no equivalent list for
 * drafts — their ids do not exist until a user creates one, and could not be
 * enumerated at build time even in principle.
 *
 * Anything here that reads the URL makes the component calling it suspend on
 * first render, so it has to sit under a `<Suspense>` boundary. That is a hard
 * requirement of a static export, not a nicety: `next build` fails with
 * "Missing Suspense boundary with useSearchParams" otherwise.
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/components/SessionProvider";
import {
  createDraft,
  fetchDraft,
  updateDraft,
  type Draft,
  type SaveState,
} from "@/lib/drafts";
import { UnauthorizedError } from "@/lib/session";

/** The draft the URL is asking for, if it is asking for a real one. */
export function useDraftId(): number | null {
  const parameters = useSearchParams();
  const raw = parameters.get("draft");
  if (!raw) return null;

  const id = Number(raw);
  // A hand-edited `?draft=banana` opens a blank document rather than erroring:
  // there was nothing to lose, and nothing useful to say about it.
  return Number.isInteger(id) && id > 0 ? id : null;
}

export type DraftLoad =
  | { status: "none" }
  | { status: "loading" }
  | { status: "loaded"; draft: Draft }
  | { status: "error"; message: string };

const NOT_ASKED: DraftLoad = { status: "none" };

/**
 * Fetch the draft named in the URL, if there is one.
 *
 * "No draft asked for" is derived from the argument rather than stored, so the
 * common case — a creator opened fresh — never waits on the network and never
 * needs a render to work that out. Everything this does store is written from a
 * promise callback, so nothing here sets state synchronously during an effect.
 *
 * `draftId` is assumed not to change for the life of the hook, and both callers
 * guarantee it by freezing the value at mount. If that ever stops being true,
 * this needs to clear `fetched` when the id changes — otherwise the previous
 * draft would stay on screen while the next one was still in flight.
 */
export function useDraftLoad(draftId: number | null): DraftLoad {
  const { expire } = useSession();
  const [fetched, setFetched] = useState<DraftLoad>({ status: "loading" });

  useEffect(() => {
    if (draftId === null) return;

    const controller = new AbortController();

    fetchDraft(draftId, controller.signal)
      .then((draft) => setFetched({ status: "loaded", draft }))
      .catch((cause: unknown) => {
        if (cause instanceof Error && cause.name === "AbortError") return;
        if (cause instanceof UnauthorizedError) {
          expire();
          return;
        }
        setFetched({
          status: "error",
          message:
            cause instanceof Error ? cause.message : "That draft could not be opened.",
        });
      });

    return () => controller.abort();
  }, [draftId, expire]);

  return draftId === null ? NOT_ASKED : fetched;
}

export type DraftSaving = {
  savedId: number | null;
  saveState: SaveState;
  save: (title: string, values: object) => void;
  /** Called when the values change, so "Saved" stops claiming to be current. */
  markUnsaved: () => void;
};

/**
 * @param openedId the draft this creator was opened on, or null for a new one.
 *   Read once, as the initial value. Both callers freeze it at mount, so there
 *   is no effect here re-syncing it — opening a different draft remounts the
 *   creator, which is what gives the new id its own state.
 */
export function useDraftSaving(
  documentId: string,
  openedId: number | null,
): DraftSaving {
  const { expire } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [savedId, setSavedId] = useState<number | null>(openedId);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });

  /**
   * Whether this creator is still on screen.
   *
   * A save is deliberately *not* abortable: the user asked for it, and it
   * should reach the server whether or not they stay to watch. What must not
   * happen is the reply acting on a page that has gone. `router` is the App
   * Router singleton rather than anything scoped to this component, so
   * `router.replace` below would still navigate — dragging someone who had
   * moved on to another document back to this one, and taking whatever they
   * had typed there with it.
   */
  const onScreen = useRef(true);
  useEffect(() => {
    onScreen.current = true;
    return () => {
      onScreen.current = false;
    };
  }, []);

  const markUnsaved = useCallback(() => {
    setSaveState((current) =>
      current.status === "saved" ? { status: "idle" } : current,
    );
  }, []);

  const save = useCallback(
    (title: string, values: object) => {
      setSaveState({ status: "saving" });

      const written =
        savedId === null
          ? createDraft(documentId, title, values)
          : updateDraft(savedId, title, values);

      written
        .then((draft) => {
          if (!onScreen.current) return;
          setSavedId(draft.id);
          setSaveState({ status: "saved" });
          // Put the id in the URL, so reloading reopens what was just saved
          // rather than starting over. `replace` rather than `push`: saving is
          // not a place, and should not need a Back press to leave.
          router.replace(`${pathname}?draft=${draft.id}`, { scroll: false });
        })
        .catch((cause: unknown) => {
          if (!onScreen.current) return;
          if (cause instanceof UnauthorizedError) {
            expire();
            return;
          }
          setSaveState({
            status: "error",
            message:
              cause instanceof Error ? cause.message : "That draft could not be saved.",
          });
        });
    },
    [documentId, expire, pathname, router, savedId],
  );

  return { savedId, saveState, save, markUnsaved };
}
