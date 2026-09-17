// @vitest-environment jsdom
/**
 * Saving a draft, and opening one again.
 *
 * The round trip is the feature: values go up as opaque JSON, come back as
 * opaque JSON, and have to arrive in the document intact. `restore.test.ts`
 * covers the narrowing on its own; this covers it wired to the creator, plus
 * the two things only the creator can get wrong — writing over the wrong draft,
 * and opening a draft that belongs to a different agreement.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

let searchParams = new URLSearchParams();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/documents/pilot-agreement",
  useSearchParams: () => searchParams,
}));

const expire = vi.fn();
vi.mock("@/components/SessionProvider", () => ({
  useSession: () => ({
    user: null,
    status: "signed-in",
    setUser: vi.fn(),
    signOut: vi.fn(),
    expire,
  }),
}));

import { DocumentCreator } from "@/components/generic/DocumentCreator";
import { DOCUMENT_REGISTRY } from "@/lib/generated";
import { bodyOf, stubApi } from "../api-mock";

const pilot = DOCUMENT_REGISTRY["pilot-agreement"];
const firstField = pilot.sections[0].fields[0];

const SAVED_DRAFT = {
  id: 7,
  document_id: "pilot-agreement",
  title: "Pilot Agreement — Acme & Globex",
  created_at: "2026-09-16 10:00:00",
  updated_at: "2026-09-16 10:00:00",
  values: {
    fields: { [firstField.id]: "Ninety days flat" },
    party1: { name: "Ada", title: "", company: "Acme", noticeAddress: "" },
    party2: { name: "Bo", title: "", company: "Globex", noticeAddress: "" },
  },
};

function documentText(): string {
  return (document.querySelector("article")?.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

beforeEach(() => {
  searchParams = new URLSearchParams();
  replace.mockClear();
  expire.mockClear();
  stubApi({ "POST /api/drafts": { status: 201, json: { ...SAVED_DRAFT, id: 12 } } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("opening a saved draft", () => {
  it("puts the saved values back into the document", async () => {
    searchParams = new URLSearchParams("draft=7");
    stubApi({ "GET /api/drafts/7": { json: SAVED_DRAFT } });

    render(<DocumentCreator document={pilot} />);

    await waitFor(() => expect(documentText()).toContain("Ninety days flat"));
    expect(documentText()).toContain("Acme");
  });

  it("says so while it is fetching", () => {
    searchParams = new URLSearchParams("draft=7");
    stubApi({ "GET /api/drafts/7": { json: SAVED_DRAFT } });

    render(<DocumentCreator document={pilot} />);

    expect(screen.getByText(/Opening your saved draft/)).toBeInTheDocument();
  });

  it("refuses a draft that belongs to a different agreement", async () => {
    // `?draft=` is editable by hand. Pouring an NDA's values into a Pilot
    // Agreement would leave every field silently resolving to nothing.
    searchParams = new URLSearchParams("draft=7");
    stubApi({
      "GET /api/drafts/7": {
        json: { ...SAVED_DRAFT, document_id: "mutual-nda" },
      },
    });

    render(<DocumentCreator document={pilot} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /different agreement/,
    );
  });

  it("reports a draft it could not open", async () => {
    searchParams = new URLSearchParams("draft=7");
    stubApi({ "GET /api/drafts/7": { status: 404 } });

    render(<DocumentCreator document={pilot} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/no longer exists/);
  });

  it("starts blank when the id in the URL is not a number", async () => {
    // Nothing was lost, and there is nothing useful to say about it.
    searchParams = new URLSearchParams("draft=banana");
    const fetchMock = stubApi({});

    render(<DocumentCreator document={pilot} />);

    await screen.findByRole("region", { name: "Agreement preview" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not fetch anything when no draft was asked for", async () => {
    const fetchMock = stubApi({});

    render(<DocumentCreator document={pilot} />);

    await screen.findByRole("region", { name: "Agreement preview" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("saving a draft", () => {
  it("creates one, titled after the agreement and the parties", async () => {
    const fetchMock = stubApi({
      "POST /api/drafts": { status: 201, json: { ...SAVED_DRAFT, id: 12 } },
    });
    const user = userEvent.setup();
    render(<DocumentCreator document={pilot} />);

    await user.click(screen.getByText("Edit fields manually"));
    await user.type(screen.getAllByLabelText("Company")[0], "Acme");
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const call = fetchMock.mock.calls.find(([url]) => url === "/api/drafts");
    expect(bodyOf(call![1])).toMatchObject({
      document_id: "pilot-agreement",
      title: "Pilot Agreement — Acme",
    });
  });

  it("puts the new id in the URL, so a reload reopens it", async () => {
    const user = userEvent.setup();
    render(<DocumentCreator document={pilot} />);

    await user.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/documents/pilot-agreement?draft=12", {
        scroll: false,
      }),
    );
  });

  it("saves over the draft it opened rather than creating a second one", async () => {
    searchParams = new URLSearchParams("draft=7");
    const fetchMock = stubApi({
      "GET /api/drafts/7": { json: SAVED_DRAFT },
      "PUT /api/drafts/7": { json: SAVED_DRAFT },
    });
    const user = userEvent.setup();
    render(<DocumentCreator document={pilot} />);

    await waitFor(() => expect(documentText()).toContain("Ninety days flat"));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) => url === "/api/drafts/7" && init?.method === "PUT",
        ),
      ).toBe(true),
    );
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/drafts")).toBe(false);
  });

  it("confirms the save, and stops confirming once the values move on", async () => {
    const user = userEvent.setup();
    render(<DocumentCreator document={pilot} />);

    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByText(/Saved\./)).toBeInTheDocument();

    await user.click(screen.getByText("Edit fields manually"));
    await user.type(screen.getAllByLabelText("Company")[0], "A");

    await waitFor(() => expect(screen.queryByText(/Saved\./)).toBeNull());
  });

  it("reports a save that failed", async () => {
    stubApi({ "POST /api/drafts": { status: 422 } });
    const user = userEvent.setup();
    render(<DocumentCreator document={pilot} />);

    await user.click(screen.getByRole("button", { name: "Save draft" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be saved/);
  });

  it("ends the session when the server rejects it, rather than showing an error", async () => {
    // The database is recreated on every boot, so an ordinary restart puts
    // every signed-in user here.
    stubApi({ "POST /api/drafts": { status: 401, json: { detail: "no" } } });
    const user = userEvent.setup();
    render(<DocumentCreator document={pilot} />);

    await user.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(expire).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("a save that lands after the user has moved on", () => {
  it("does not drag them back to the page they left", async () => {
    // `router` is the App Router singleton, not something scoped to this
    // component, so a `replace` fired from a resolved save would navigate for
    // real — pulling someone who had already opened another document back here
    // and discarding whatever they had typed there.
    let land: (response: unknown) => void = () => {};
    const inFlight = new Promise((resolve) => {
      land = resolve;
    });
    vi.stubGlobal("fetch", vi.fn(() => inFlight));

    const user = userEvent.setup();
    const { unmount } = render(<DocumentCreator document={pilot} />);
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    unmount();
    land({
      ok: true,
      status: 201,
      json: async () => ({ ...SAVED_DRAFT, id: 12 }),
      text: async () => "",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(replace).not.toHaveBeenCalled();
  });

  it("still lets the save itself reach the server", async () => {
    // The user asked for it. Leaving the page is not a reason to abandon their
    // work, so the request is never aborted — only its reply is ignored.
    const fetchMock = stubApi({
      "POST /api/drafts": { status: 201, json: { ...SAVED_DRAFT, id: 12 } },
    });

    const user = userEvent.setup();
    const { unmount } = render(<DocumentCreator document={pilot} />);
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    unmount();

    const call = fetchMock.mock.calls.find(([url]) => url === "/api/drafts");
    expect(call![1].method).toBe("POST");
    expect(call![1].signal).toBeUndefined();
  });
});
