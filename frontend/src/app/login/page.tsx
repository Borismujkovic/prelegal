"use client";

/**
 * The fake login.
 *
 * No password, no verification, no security — type any email and you are that
 * user. The screen says so, because a login form that looks real and is not is
 * worse than an obviously placeholder one.
 *
 * What it does prove is the whole stack: the email goes to FastAPI, which
 * creates a row in SQLite and hands it back.
 */

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useSession } from "@/components/SessionProvider";
import { signIn } from "@/lib/session";

export default function LoginPage() {
  const router = useRouter();
  const { status, setUser } = useSession();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already signed in? Skip the screen.
  useEffect(() => {
    if (status === "signed-in") {
      router.replace("/documents");
    }
  }, [status, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      setUser(await signIn(email.trim()));
      router.replace("/documents");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <p className="text-sm font-semibold tracking-[0.18em] text-brand-blue uppercase">
          Prelegal
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-navy">
          Sign in
        </h1>

        <p className="mt-4 rounded-md border border-brand-yellow/40 bg-brand-yellow/10 px-3 py-2 text-xs text-slate-700">
          <strong className="font-semibold">Placeholder sign-in.</strong> There is
          no authentication yet — any email gets you in, and no password is
          asked for or stored.
        </p>

        <form onSubmit={handleSubmit} className="mt-6">
          <label
            htmlFor="email"
            className="block text-sm font-medium text-slate-700"
          >
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:border-brand-blue focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:outline-none"
          />

          {error && (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-5 w-full rounded-md bg-brand-purple px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60"
          >
            {submitting ? "Signing in…" : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
