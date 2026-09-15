// @vitest-environment jsdom
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CoverPageForm } from "@/components/CoverPageForm";
import { DEFAULT_VALUES, type CoverPageValues, type Party } from "@/lib/nda-fields";
import { COMPLETE } from "../fixtures";

/** Drives the form the way the page does, so controlled inputs really update. */
function Harness({
  initial = DEFAULT_VALUES,
  onValues,
}: {
  initial?: CoverPageValues;
  onValues?: (values: CoverPageValues) => void;
}) {
  const [values, setValues] = useState(initial);

  return (
    <CoverPageForm
      values={values}
      onChange={(patch) =>
        setValues((current) => {
          const next = { ...current, ...patch };
          onValues?.(next);
          return next;
        })
      }
      onPartyChange={(party, patch) =>
        setValues((current) => {
          const next = { ...current, [party]: { ...current[party], ...patch } };
          onValues?.(next);
          return next;
        })
      }
    />
  );
}

describe("CoverPageForm - text fields", () => {
  it("records what the user types in the purpose", async () => {
    const user = userEvent.setup();
    let latest: CoverPageValues | undefined;
    render(<Harness onValues={(values) => (latest = values)} />);

    await user.type(screen.getByLabelText("Purpose"), "Evaluating a deal");
    expect(latest?.purpose).toBe("Evaluating a deal");
  });

  it("records the governing law and jurisdiction", async () => {
    const user = userEvent.setup();
    let latest: CoverPageValues | undefined;
    render(<Harness onValues={(values) => (latest = values)} />);

    await user.type(screen.getByLabelText("Governing law"), "Delaware");
    await user.type(screen.getByLabelText("Jurisdiction"), "New Castle, DE");

    expect(latest?.governingLaw).toBe("Delaware");
    expect(latest?.jurisdiction).toBe("New Castle, DE");
  });

  it("records the effective date from the date input", async () => {
    const onChange = vi.fn();
    render(
      <CoverPageForm values={DEFAULT_VALUES} onChange={onChange} onPartyChange={vi.fn()} />,
    );

    const input = screen.getByLabelText("Effective date");
    expect(input).toHaveAttribute("type", "date");

    const user = userEvent.setup();
    await user.type(input, "2026-03-09");
    expect(onChange).toHaveBeenCalledWith({ effectiveDate: "2026-03-09" });
  });

  it("records modifications", async () => {
    const user = userEvent.setup();
    let latest: CoverPageValues | undefined;
    render(<Harness onValues={(values) => (latest = values)} />);

    await user.type(screen.getByLabelText("Modifications"), "Clause 5 deleted");
    expect(latest?.modifications).toBe("Clause 5 deleted");
  });

  it("labels every input so it can be reached by name", () => {
    render(<Harness />);
    for (const label of [
      "Purpose",
      "Effective date",
      "Governing law",
      "Jurisdiction",
      "Modifications",
    ]) {
      expect(screen.getByLabelText(label), label).toBeInTheDocument();
    }
  });
});

describe("CoverPageForm - party fields", () => {
  it("routes each party's edits to that party alone", async () => {
    const user = userEvent.setup();
    let latest: CoverPageValues | undefined;
    render(<Harness onValues={(values) => (latest = values)} />);

    const [party1Name, party2Name] = screen.getAllByLabelText("Print name");
    await user.type(party1Name, "Jane");
    expect(latest?.party1.name).toBe("Jane");
    expect(latest?.party2.name).toBe("");

    await user.type(party2Name, "John");
    expect(latest?.party1.name).toBe("Jane");
    expect(latest?.party2.name).toBe("John");
  });

  it("records every party detail", async () => {
    const user = userEvent.setup();
    let latest: CoverPageValues | undefined;
    render(<Harness onValues={(values) => (latest = values)} />);

    await user.type(screen.getAllByLabelText("Print name")[0], "Jane Doe");
    await user.type(screen.getAllByLabelText("Title")[0], "CEO");
    await user.type(screen.getAllByLabelText("Company")[0], "Acme");
    await user.type(screen.getAllByLabelText("Notice address")[0], "legal@acme.com");

    expect(latest?.party1).toEqual({
      name: "Jane Doe",
      title: "CEO",
      company: "Acme",
      noticeAddress: "legal@acme.com",
    });
  });

  it("gives both parties their own set of inputs", () => {
    render(<Harness />);
    expect(screen.getAllByLabelText("Print name")).toHaveLength(2);
    expect(screen.getAllByLabelText("Company")).toHaveLength(2);
  });

  it("passes the party key through to the caller", async () => {
    const onPartyChange = vi.fn<(party: "party1" | "party2", patch: Partial<Party>) => void>();
    render(
      <CoverPageForm values={DEFAULT_VALUES} onChange={vi.fn()} onPartyChange={onPartyChange} />,
    );

    const user = userEvent.setup();
    await user.type(screen.getAllByLabelText("Company")[1], "G");
    expect(onPartyChange).toHaveBeenCalledWith("party2", { company: "G" });
  });
});

describe("CoverPageForm - term choices", () => {
  it("starts on the fixed-length option for both terms", () => {
    render(<Harness />);
    const radios = screen.getAllByRole("radio");
    expect(radios.filter((radio) => (radio as HTMLInputElement).checked)).toHaveLength(2);
  });

  it("switches the MNDA term to until-terminated", async () => {
    const user = userEvent.setup();
    let latest: CoverPageValues | undefined;
    render(<Harness onValues={(values) => (latest = values)} />);

    await user.click(screen.getByRole("radio", { name: /Continues until terminated/ }));
    expect(latest?.ndaTerm).toEqual({ kind: "untilTerminated" });
  });

  it("switches the confidentiality term to perpetual", async () => {
    const user = userEvent.setup();
    let latest: CoverPageValues | undefined;
    render(<Harness onValues={(values) => (latest = values)} />);

    await user.click(screen.getByRole("radio", { name: /In perpetuity/ }));
    expect(latest?.confidentialityTerm).toEqual({ kind: "perpetual" });
  });

  it("switches back to a fixed term with a sane default", async () => {
    const user = userEvent.setup();
    let latest: CoverPageValues | undefined;
    render(<Harness onValues={(values) => (latest = values)} />);

    await user.click(screen.getByRole("radio", { name: /Continues until terminated/ }));
    await user.click(screen.getByRole("radio", { name: /Expires/ }));
    expect(latest?.ndaTerm).toEqual({ kind: "fixed", years: 1 });
  });

  it("keeps the two term choices independent", async () => {
    const user = userEvent.setup();
    let latest: CoverPageValues | undefined;
    render(<Harness onValues={(values) => (latest = values)} />);

    await user.click(screen.getByRole("radio", { name: /In perpetuity/ }));
    expect(latest?.confidentialityTerm).toEqual({ kind: "perpetual" });
    expect(latest?.ndaTerm).toEqual({ kind: "fixed", years: 1 });
  });
});

describe("CoverPageForm - years input", () => {
  it("records a new term length", async () => {
    const user = userEvent.setup();
    let latest: CoverPageValues | undefined;
    render(<Harness onValues={(values) => (latest = values)} />);

    const years = screen.getAllByLabelText("Number of years")[0];
    await user.clear(years);
    await user.type(years, "5");
    expect(latest?.ndaTerm).toEqual({ kind: "fixed", years: 5 });
  });

  it("disables the length box when the term has no number", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const years = screen.getAllByLabelText("Number of years")[0];
    expect(years).toBeEnabled();

    await user.click(screen.getByRole("radio", { name: /Continues until terminated/ }));
    expect(years).toBeDisabled();
  });

  it("flags an emptied length box as invalid", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const years = screen.getAllByLabelText("Number of years")[0];
    expect(years).toHaveAttribute("aria-invalid", "false");

    await user.clear(years);
    expect(years).toHaveAttribute("aria-invalid", "true");
  });

  it("does not flag a disabled length box as invalid", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const years = screen.getAllByLabelText("Number of years")[0];
    await user.clear(years);
    await user.click(screen.getByRole("radio", { name: /Continues until terminated/ }));
    expect(years).toHaveAttribute("aria-invalid", "false");
  });

  it("refuses zero and negative lengths at the input level", () => {
    render(<Harness />);
    const years = screen.getAllByLabelText("Number of years")[0];
    expect(years).toHaveAttribute("min", "1");
    expect(years).toHaveAttribute("step", "1");
  });
});

describe("CoverPageForm - submission", () => {
  it("never navigates away, since everything stays in the browser", () => {
    const { container } = render(<Harness initial={COMPLETE} />);
    const form = container.querySelector("form");
    expect(form).not.toBeNull();

    const submit = new Event("submit", { bubbles: true, cancelable: true });
    form?.dispatchEvent(submit);
    expect(submit.defaultPrevented).toBe(true);
  });
});
