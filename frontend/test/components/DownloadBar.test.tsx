// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DownloadBar } from "@/components/DownloadBar";
import type { SaveState } from "@/lib/drafts";
import type { CoverPageValues } from "@/lib/nda-fields";
import { buildMarkdown } from "@/lib/markdown-export";
import { COMPLETE, EMPTY, withValues } from "../fixtures";

/**
 * jsdom implements neither object URLs nor printing, so both are stubbed and
 * the assertions look at what the component asked the browser to do.
 */
let createdBlobs: Blob[] = [];
let revoked: string[] = [];
let clicked: HTMLAnchorElement[] = [];

/**
 * The bar gained three save-related props in PL-7. Every test below is about
 * downloading or completeness, so they are supplied once here rather than
 * restated in each render.
 */
let saved: number;
function Bar({
  values,
  saveState = { status: "idle" },
  isSaved = false,
}: {
  values: CoverPageValues;
  saveState?: SaveState;
  isSaved?: boolean;
}) {
  return (
    <DownloadBar
      values={values}
      onSave={() => { saved += 1; }}
      saveState={saveState}
      isSaved={isSaved}
    />
  );
}

beforeEach(() => {
  createdBlobs = [];
  revoked = [];
  clicked = [];
  saved = 0;

  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn((blob: Blob) => {
      createdBlobs.push(blob);
      return `blob:mock/${createdBlobs.length}`;
    }),
    revokeObjectURL: vi.fn((url: string) => {
      revoked.push(url);
    }),
  });

  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push(this);
  });

  vi.stubGlobal("print", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("DownloadBar - completeness", () => {
  it("counts the fields still outstanding", () => {
    render(<Bar values={EMPTY} />);
    expect(screen.getByRole("button", { name: /8 fields still to fill/ })).toBeInTheDocument();
  });

  it("uses the singular for a single outstanding field", () => {
    render(<Bar values={withValues({ purpose: "" })} />);
    expect(screen.getByRole("button", { name: /1 field still to fill/ })).toBeInTheDocument();
    expect(screen.queryByText(/1 fields/)).not.toBeInTheDocument();
  });

  it("reports readiness once everything is supplied", () => {
    render(<Bar values={COMPLETE} />);
    expect(screen.getByText("Ready to download")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /still to fill/ })).not.toBeInTheDocument();
  });

  it("lists what is missing on request", async () => {
    const user = userEvent.setup();
    render(<Bar values={EMPTY} />);

    const toggle = screen.getByRole("button", { name: /still to fill/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Purpose")).toBeInTheDocument();
    expect(screen.getByText("Party 2 company")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(8);
  });

  it("hides the list again", async () => {
    const user = userEvent.setup();
    render(<Bar values={EMPTY} />);

    const toggle = screen.getByRole("button", { name: /still to fill/ });
    await user.click(toggle);
    await user.click(toggle);
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });
});

describe("DownloadBar - markdown download", () => {
  it("downloads the agreement as a markdown file", async () => {
    const user = userEvent.setup();
    render(<Bar values={COMPLETE} />);

    await user.click(screen.getByRole("button", { name: "Download .md" }));

    expect(createdBlobs).toHaveLength(1);
    expect(createdBlobs[0].type).toBe("text/markdown;charset=utf-8");
    expect(clicked).toHaveLength(1);
    expect(clicked[0].download).toBe("mutual-nda-acme-inc-globex-llc.md");
  });

  it("puts the rendered agreement in the blob", async () => {
    const user = userEvent.setup();
    render(<Bar values={COMPLETE} />);

    await user.click(screen.getByRole("button", { name: "Download .md" }));
    expect(await createdBlobs[0].text()).toBe(buildMarkdown(COMPLETE));
  });

  it("releases the object URL afterwards", async () => {
    const user = userEvent.setup();
    render(<Bar values={COMPLETE} />);

    await user.click(screen.getByRole("button", { name: "Download .md" }));
    expect(revoked).toEqual(["blob:mock/1"]);
  });

  it("leaves no anchor behind in the document", async () => {
    const user = userEvent.setup();
    render(<Bar values={COMPLETE} />);

    await user.click(screen.getByRole("button", { name: "Download .md" }));
    expect(document.querySelectorAll("a[download]")).toHaveLength(0);
  });

  it("downloads an incomplete agreement too, placeholders and all", async () => {
    const user = userEvent.setup();
    render(<Bar values={EMPTY} />);

    await user.click(screen.getByRole("button", { name: "Download .md" }));
    expect(clicked[0].download).toBe("mutual-nda.md");
    expect(await createdBlobs[0].text()).toContain("[Purpose]");
  });
});

describe("DownloadBar - PDF", () => {
  it("goes through the browser print dialog", async () => {
    const user = userEvent.setup();
    render(<Bar values={COMPLETE} />);

    await user.click(screen.getByRole("button", { name: "Download PDF" }));
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it("offers both downloads even while fields are outstanding", () => {
    render(<Bar values={EMPTY} />);
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Download .md" })).toBeEnabled();
  });
});

describe("DownloadBar - buttons", () => {
  it("marks every control as a non-submitting button", () => {
    render(<Bar values={EMPTY} />);
    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveAttribute("type", "button");
    }
  });
});

describe("DownloadBar - saving", () => {
  it("offers to save a draft that has not been saved before", () => {
    render(<Bar values={COMPLETE} />);
    expect(screen.getByRole("button", { name: "Save draft" })).toBeInTheDocument();
  });

  it("changes the verb once the draft exists", () => {
    render(<Bar values={COMPLETE} isSaved />);
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
  });

  it("asks the creator to save", async () => {
    const user = userEvent.setup();
    render(<Bar values={COMPLETE} />);

    await user.click(screen.getByRole("button", { name: "Save draft" }));

    expect(saved).toBe(1);
  });

  it("cannot be pressed twice while a save is in flight", () => {
    render(<Bar values={COMPLETE} saveState={{ status: "saving" }} />);
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  });

  it("confirms a save", () => {
    render(<Bar values={COMPLETE} saveState={{ status: "saved" }} />);
    expect(screen.getByText(/Saved\./)).toBeInTheDocument();
  });

  it("announces a save that failed", () => {
    // Losing work is worth interrupting a screen reader for; saving it is not.
    render(
      <Bar values={COMPLETE} saveState={{ status: "error", message: "Nope." }} />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Nope.");
  });
});

describe("DownloadBar - the draft notice", () => {
  it("says the document needs a lawyer before it is signed", () => {
    // This bar had no such notice until PL-7, while the generic creator's had
    // carried one since PL-6 — five of six documents warned you, and the
    // most-used one did not.
    render(<Bar values={COMPLETE} />);
    expect(screen.getByText(/reviewed by a lawyer before signing/)).toBeInTheDocument();
  });
});
