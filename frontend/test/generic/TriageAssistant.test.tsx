// @vitest-environment jsdom
/**
 * The assistant on the dashboard that works out which document you need.
 *
 * The three outcomes want three genuinely different things on screen, and the
 * one that matters most is the honest refusal: a user asking for something
 * Prelegal does not draft must not be handed a link that pretends otherwise.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TriageAssistant } from "@/components/generic/TriageAssistant";
import type { CatalogDocument } from "@/lib/catalog";

const CATALOG: CatalogDocument[] = [
  {
    id: "pilot-agreement",
    name: "Pilot Agreement",
    abbreviation: null,
    summary: "A time-boxed paid trial.",
    use_when: "A prospect wants to prove the product works.",
    standard_terms: "templates/pilot-agreement.md",
    cover_page: null,
    attaches_to: null,
    available: true,
  },
  {
    id: "cloud-service-agreement",
    name: "Cloud Service Agreement",
    abbreviation: "CSA",
    summary: "The primary contract for selling a hosted service.",
    use_when: "You sell SaaS.",
    standard_terms: "templates/cloud-service-agreement.md",
    cover_page: null,
    attaches_to: null,
    available: false,
  },
];

function respondWith(body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function ask(text: string) {
  const user = userEvent.setup();
  render(<TriageAssistant catalog={CATALOG} />);
  await user.type(screen.getByLabelText("Describe what you need"), `${text}{Enter}`);
  return user;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("recommending a document", () => {
  it("links to a document that can be drafted now", async () => {
    respondWith({
      reply: "That sounds like a pilot.",
      recommendedDocumentId: "pilot-agreement",
      status: "available",
    });

    await ask("A customer wants to trial the product");

    await waitFor(() =>
      expect(screen.getByRole("link", { name: /Pilot Agreement/ })).toHaveAttribute(
        "href",
        "/documents/pilot-agreement",
      ),
    );
    expect(screen.getByText("Start drafting →")).toBeInTheDocument();
  });

  it("names a document that is not ready without linking to it", async () => {
    respondWith({
      reply: "You would want a Cloud Service Agreement.",
      recommendedDocumentId: "cloud-service-agreement",
      status: "not_yet_available",
    });

    await ask("We sell SaaS");

    await waitFor(() =>
      expect(screen.getByText("Cloud Service Agreement")).toBeInTheDocument(),
    );
    // Named, explained, and deliberately not a link — it would go nowhere.
    expect(screen.getByText(/Coming soon/)).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Cloud Service Agreement/ }),
    ).not.toBeInTheDocument();
  });

  it("offers no card at all when Prelegal cannot help", async () => {
    respondWith({
      reply:
        "Prelegal does not draft employment contracts. Nothing in the catalogue is close.",
      recommendedDocumentId: null,
      status: "no_recommendation",
    });

    await ask("I need an employment contract");

    await waitFor(() =>
      expect(
        screen.getByText(/does not draft employment contracts/),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByText(/Start drafting/)).not.toBeInTheDocument();
  });
});

describe("the conversation", () => {
  it("sends the transcript, greeting included", async () => {
    const fetchMock = respondWith({
      reply: "Which of those is it?",
      recommendedDocumentId: null,
      status: "no_recommendation",
    });

    await ask("Not sure");

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.messages).toHaveLength(2);
    expect(sent.messages[0].role).toBe("assistant");
    // Triage fills nothing in, so there is nothing to send but the words.
    expect(sent.values).toBeUndefined();
  });

  it("keeps asking until it knows enough", async () => {
    respondWith({
      reply: "Is anything signed already?",
      recommendedDocumentId: null,
      status: "no_recommendation",
    });

    await ask("We are talking to a reseller");

    await waitFor(() =>
      expect(screen.getByText("Is anything signed already?")).toBeInTheDocument(),
    );
  });

  it("offers a retry when the assistant is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => ({}) }),
    );

    await ask("Help");

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/unavailable/),
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
