"use client";

/**
 * Signing in.
 *
 * This screen used to carry a notice saying it was not real authentication.
 * The notice is gone because the statement is no longer true: there is a
 * password now, it is checked against a stored scrypt hash, and the session is
 * a token the server can revoke.
 *
 * The form renders while the session is still being checked rather than showing
 * a spinner first. Someone arriving here is overwhelmingly likely to be signed
 * out, and making them wait on a round trip to be told so is the wrong default;
 * the redirect for the rarer case fires as soon as the answer arrives.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { AuthCard, FIELD, FormError, LABEL, SUBMIT } from "@/components/AuthCard";
import { useSession } from "@/components/SessionProvider";
import { signIn } from "@/lib/session";

export default function LoginPage() {
  const router = useRouter();
  const { status, setUser } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "signed-in") router.replace("/documents");
  }, [status, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      setUser(await signIn(email.trim(), password));
      router.replace("/documents");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="Sign in"
      subtitle="Pick up where you left off, or start a new agreement."
      footer={
        <>
          New here?{" "}
          <Link
            href="/signup"
            className="font-medium text-brand-purple underline underline-offset-4"
          >
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="email" className={LABEL}>
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
          className={FIELD}
        />

        <div className="mt-4">
          <label htmlFor="password" className={LABEL}>
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={FIELD}
          />
        </div>

        <FormError message={error} />

        <button type="submit" disabled={submitting} className={SUBMIT}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </AuthCard>
  );
}
