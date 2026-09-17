"use client";

/**
 * The landing page.
 *
 * "/" used to be nothing but a redirect, which meant every visitor — including
 * one who had never heard of Prelegal — was shown the word "Loading…" and then
 * a login form. Now the signed-out case gets a page that says what this is, and
 * only a signed-in visitor is sent onwards.
 *
 * It renders during `loading` rather than waiting for the session check. That
 * is what makes the prerendered HTML the marketing page rather than a spinner:
 * a static export has no server to decide, so whatever this renders before the
 * answer arrives is what lands in `out/index.html`.
 *
 * The document list is built from the generated registry rather than fetched.
 * The same data reaches the dashboard over `/api/catalog`, but a first
 * impression should not depend on a round trip, and this list is baked in at
 * build time from the same `catalog.json`.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { SiteFooter } from "@/components/SiteFooter";
import { useSession } from "@/components/SessionProvider";
import { DOCUMENT_REGISTRY } from "@/lib/generated";

/**
 * The Mutual NDA is named separately because it is deliberately absent from the
 * generated registry — it has its own route and its own engine. See
 * `documents/[documentId]/page.tsx`.
 */
const DRAFTABLE = [
  "Mutual NDA",
  ...Object.values(DOCUMENT_REGISTRY).map((document) => document.name),
];

const STEPS = [
  {
    title: "Say what you need",
    body: "Describe the situation in your own words. The assistant works out which agreement fits, or tells you plainly when Prelegal does not draft it.",
  },
  {
    title: "Fill it in by talking",
    body: "Answer questions as they come. Every answer lands in the document as you go, and you can always type a value in by hand instead.",
  },
  {
    title: "Save it and take it away",
    body: "Download a PDF or Markdown file, and keep the draft in your account to come back to.",
  },
];

export default function Home() {
  const router = useRouter();
  const { status } = useSession();

  useEffect(() => {
    if (status === "signed-in") router.replace("/documents");
  }, [status, router]);

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-6 py-4">
          <span className="text-sm font-semibold tracking-[0.18em] text-brand-blue uppercase">
            Prelegal
          </span>
          <div className="flex-1" />
          <Link
            href="/login"
            className="text-sm font-medium text-slate-700 underline-offset-4 hover:text-navy hover:underline"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-md bg-brand-purple px-3.5 py-2 text-sm font-semibold text-white transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Get started
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
          <p className="text-sm font-semibold tracking-[0.18em] text-brand-blue uppercase">
            Contracts without the blank page
          </p>
          <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight text-navy sm:text-5xl">
            Draft a business agreement by describing the deal.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-slate-600">
            Prelegal turns a conversation into a finished agreement, built on
            Common Paper&rsquo;s open standard templates. Answer a few questions
            and download something you can send.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link
              href="/signup"
              className="rounded-md bg-brand-purple px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              Create an account
            </Link>
            <Link
              href="/login"
              className="rounded-md border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-navy transition hover:border-brand-blue focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:outline-none"
            >
              Sign in
            </Link>
          </div>
        </section>

        <section className="border-y border-slate-200 bg-white">
          <div className="mx-auto max-w-5xl px-6 py-14">
            <h2 className="text-xl font-semibold tracking-tight text-navy">
              How it works
            </h2>
            <ol className="mt-8 grid gap-8 sm:grid-cols-3">
              {STEPS.map((step, index) => (
                <li key={step.title}>
                  <span
                    aria-hidden
                    className="inline-flex size-8 items-center justify-center rounded-full bg-brand-blue/10 text-sm font-semibold text-brand-blue"
                  >
                    {index + 1}
                  </span>
                  <h3 className="mt-3 font-semibold text-navy">{step.title}</h3>
                  <p className="mt-2 text-sm text-slate-600">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-14">
          <h2 className="text-xl font-semibold tracking-tight text-navy">
            What you can draft today
          </h2>
          <p className="mt-2 text-sm text-brand-gray">
            More agreements are on the way, and the dashboard says which.
          </p>
          <ul className="mt-6 flex flex-wrap gap-2">
            {DRAFTABLE.map((name) => (
              <li
                key={name}
                className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm text-slate-700"
              >
                {name}
              </li>
            ))}
          </ul>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
