// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DownloadBar } from "@/components/DownloadBar";
import { buildMarkdown } from "@/lib/markdown-export";
import { COMPLETE, EMPTY, withValues } from "../fixtures";

/**
 * jsdom implements neither object URLs nor printing, so both are stubbed and
 * the assertions look at what the component asked the browser to do.
 */
let createdBlobs: Blob[] = [];
let revoked: string[] = [];
let clicked: HTMLAnchorElement[] = [];

beforeEach(() => {
  createdBlobs = [];
  revoked = [];
  clicked = [];

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
    render(<DownloadBar values={EMPTY} />);
    expect(screen.getByRole("button", { name: /8 fields still to fill/ })).toBeInTheDocument();
  });

  it("uses the singular for a single outstanding field", () => {
    render(<DownloadBar values={withValues({ purpose: "" })} />);
    expect(screen.getByRole("button", { name: /1 field still to fill/ })).toBeInTheDocument();
    expect(screen.queryByText(/1 fields/)).not.toBeInTheDocument();
  });

  it("reports readiness once everything is supplied", () => {
    render(<DownloadBar values={COMPLETE} />);
    expect(screen.getByText("Ready to download")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /still to fill/ })).not.toBeInTheDocument();
  });

  it("lists what is missing on request", async () => {
    const user = userEvent.setup();
    render(<DownloadBar values={EMPTY} />);

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
    render(<DownloadBar values={EMPTY} />);

    const toggle = screen.getByRole("button", { name: /still to fill/ });
    await user.click(toggle);
    await user.click(toggle);
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });
});

describe("DownloadBar - markdown download", () => {
  it("downloads the agreement as a markdown file", async () => {
    const user = userEvent.setup();
    render(<DownloadBar values={COMPLETE} />);

    await user.click(screen.getByRole("button", { name: "Download .md" }));

    expect(createdBlobs).toHaveLength(1);
    expect(createdBlobs[0].type).toBe("text/markdown;charset=utf-8");
    expect(clicked).toHaveLength(1);
    expect(clicked[0].download).toBe("mutual-nda-acme-inc-globex-llc.md");
  });

  it("puts the rendered agreement in the blob", async () => {
    const user = userEvent.setup();
    render(<DownloadBar values={COMPLETE} />);

    await user.click(screen.getByRole("button", { name: "Download .md" }));
    expect(await createdBlobs[0].text()).toBe(buildMarkdown(COMPLETE));
  });

  it("releases the object URL afterwards", async () => {
    const user = userEvent.setup();
    render(<DownloadBar values={COMPLETE} />);

    await user.click(screen.getByRole("button", { name: "Download .md" }));
    expect(revoked).toEqual(["blob:mock/1"]);
  });

  it("leaves no anchor behind in the document", async () => {
    const user = userEvent.setup();
    render(<DownloadBar values={COMPLETE} />);

    await user.click(screen.getByRole("button", { name: "Download .md" }));
    expect(document.querySelectorAll("a[download]")).toHaveLength(0);
  });

  it("downloads an incomplete agreement too, placeholders and all", async () => {
    const user = userEvent.setup();
    render(<DownloadBar values={EMPTY} />);

    await user.click(screen.getByRole("button", { name: "Download .md" }));
    expect(clicked[0].download).toBe("mutual-nda.md");
    expect(await createdBlobs[0].text()).toContain("[Purpose]");
  });
});

describe("DownloadBar - PDF", () => {
  it("goes through the browser print dialog", async () => {
    const user = userEvent.setup();
    render(<DownloadBar values={COMPLETE} />);

    await user.click(screen.getByRole("button", { name: "Download PDF" }));
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it("offers both downloads even while fields are outstanding", () => {
    render(<DownloadBar values={EMPTY} />);
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Download .md" })).toBeEnabled();
  });
});

describe("DownloadBar - buttons", () => {
  it("marks every control as a non-submitting button", () => {
    render(<DownloadBar values={EMPTY} />);
    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveAttribute("type", "button");
    }
  });
});
