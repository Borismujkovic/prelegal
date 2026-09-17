/**
 * Saved drafts, as the browser talks to them.
 *
 * `values` is `unknown` in everything that comes *back*. The server stores
 * whatever JSON object it was handed and never looks inside — which is what
 * lets one table hold both the Mutual NDA's Cover Page and the generic
 * engine's open field map — so what arrives here carries no guarantee beyond
 * "some JSON". Narrowing it into a real type is the job of `restoreValues` in
 * `lib/generic/restore.ts` and `lib/nda-restore.ts`, which start from the
 * defaults and accept only what they recognise.
 *
 * Typing it `unknown` rather than `GenericValues` is the point: it makes that
 * narrowing step impossible to skip by accident.
 */

import { UnauthorizedError } from "./session";

export type DraftSummary = {
  id: number;
  document_id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type Draft = DraftSummary & { values: unknown };

const UNREACHABLE = "Could not reach the server. Is the backend running?";

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(path, { credentials: "same-origin", ...init });
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError") throw cause;
    throw new Error(UNREACHABLE);
  }

  // Raised as its own type so callers can end the session rather than showing
  // "something went wrong" to someone who has simply been signed out.
  if (response.status === 401) throw new UnauthorizedError();
  return response;
}

async function json<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await request(path, init);
  if (!response.ok) throw new Error(await describe(response));
  return (await response.json()) as T;
}

async function describe(response: Response): Promise<string> {
  if (response.status === 404) return "That draft no longer exists.";
  if (response.status === 422) return "That draft could not be saved.";
  return UNREACHABLE;
}

function writing(body: unknown): RequestInit {
  return {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export function listDrafts(signal?: AbortSignal): Promise<DraftSummary[]> {
  return json<DraftSummary[]>("/api/drafts", { signal });
}

export function fetchDraft(id: number, signal?: AbortSignal): Promise<Draft> {
  return json<Draft>(`/api/drafts/${id}`, { signal });
}

export function createDraft(
  documentId: string,
  title: string,
  values: object,
): Promise<Draft> {
  return json<Draft>("/api/drafts", {
    method: "POST",
    ...writing({ document_id: documentId, title, values }),
  });
}

export function updateDraft(
  id: number,
  title: string,
  values: object,
): Promise<Draft> {
  return json<Draft>(`/api/drafts/${id}`, {
    method: "PUT",
    ...writing({ title, values }),
  });
}

export async function deleteDraft(id: number): Promise<void> {
  const response = await request(`/api/drafts/${id}`, { method: "DELETE" });
  if (!response.ok) throw new Error(await describe(response));
}

/**
 * Where a save has got to, for the button that started it.
 *
 * "saved" is deliberately sticky rather than timed: it stays until the values
 * change again, so the bar answers "is my work safe right now" rather than
 * flashing a confirmation the user may not have been looking at.
 */
export type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "error"; message: string };
