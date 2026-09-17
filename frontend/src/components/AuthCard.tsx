"use client";

/**
 * The frame the sign-in and sign-up screens share, and the fields they share.
 *
 * Two screens that differ by one field and one verb are the classic place for
 * copy-and-paste to settle in, and the parts most worth keeping identical —
 * label association, focus rings, how an error is announced — are exactly the
 * parts that get missed when it does.
 */
import Link from "next/link";
import type { ReactNode } from "react";

export const FIELD =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 " +
  "placeholder:text-slate-400 focus-visible:border-brand-blue focus-visible:ring-2 " +
  "focus-visible:ring-brand-blue/40 focus-visible:outline-none";

export const LABEL = "block text-sm font-medium text-slate-700";

export const SUBMIT =
  "mt-6 w-full rounded-md bg-brand-purple px-4 py-2.5 text-sm font-semibold text-white " +
  "transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-brand-purple " +
  "focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60";

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="flex min-h-full items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="text-sm font-semibold tracking-[0.18em] text-brand-blue uppercase"
        >
          Prelegal
        </Link>

        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-navy">
          {title}
        </h1>
        <p className="mt-2 text-sm text-brand-gray">{subtitle}</p>

        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {children}
        </div>

        <p className="mt-6 text-center text-sm text-brand-gray">{footer}</p>
      </div>
    </div>
  );
}

/** A failure, announced rather than merely displayed. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
    >
      {message}
    </p>
  );
}
