"use client";

/**
 * Creating an account.
 *
 * The confirm-password field is checked here and nowhere else, deliberately:
 * the backend has no opinion about it, because "these two boxes match" is a
 * statement about a form rather than about a password. Sending both would mean
 * the server knowing about a UI decision.
 *
 * The minimum length is checked here *as well as* on the server. The server's
 * check is the one that counts; this one exists so the answer arrives while the
 * user is still looking at the field, rather than after a round trip.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { AuthCard, FIELD, FormError, LABEL, SUBMIT } from "@/components/AuthCard";
import { useSession } from "@/components/SessionProvider";
import { register } from "@/lib/session";

/** Mirrors `RegisterRequest.password` in the backend's models.py. */
const MINIMUM_PASSWORD_LENGTH = 8;

export default function SignupPage() {
  const router = useRouter();
  const { status, setUser } = useSession();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "signed-in") router.replace("/documents");
  }, [status, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < MINIMUM_PASSWORD_LENGTH) {
      setError(
        `Your password needs to be at least ${MINIMUM_PASSWORD_LENGTH} characters.`,
      );
      return;
    }
    if (password !== confirmation) {
      setError("Those two passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      setUser(await register(email.trim(), password, displayName));
      router.replace("/documents");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="Create your account"
      subtitle="Draft an agreement, save it, and come back to it later."
      footer={
        <>
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-brand-purple underline underline-offset-4"
          >
            Sign in
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
          <label htmlFor="displayName" className={LABEL}>
            Name <span className="font-normal text-brand-gray">(optional)</span>
          </label>
          <input
            id="displayName"
            name="displayName"
            type="text"
            autoComplete="name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Ada Lovelace"
            className={FIELD}
          />
        </div>

        <div className="mt-4">
          <label htmlFor="password" className={LABEL}>
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-describedby="password-hint"
            className={FIELD}
          />
          <p id="password-hint" className="mt-1 text-xs text-brand-gray">
            At least {MINIMUM_PASSWORD_LENGTH} characters.
          </p>
        </div>

        <div className="mt-4">
          <label htmlFor="confirmation" className={LABEL}>
            Confirm password
          </label>
          <input
            id="confirmation"
            name="confirmation"
            type="password"
            required
            autoComplete="new-password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            className={FIELD}
          />
        </div>

        <FormError message={error} />

        <button type="submit" disabled={submitting} className={SUBMIT}>
          {submitting ? "Creating your account…" : "Create account"}
        </button>
      </form>
    </AuthCard>
  );
}
