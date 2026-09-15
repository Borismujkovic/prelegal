"use client";

/**
 * The signed-in shell: header, current user, sign out — and the route guard.
 *
 * The guard is client-side because this is a static export; there is no server
 * in the request path to redirect an unauthenticated visitor. It is a
 * convenience, not a security boundary, and nothing behind it is protected.
 * Real enforcement has to live in the API when real auth arrives.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useSession } from "@/components/SessionProvider";

export default function DocumentsLayout({ children }: { children: ReactNode }) {
  const { user, status, signOut } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "signed-out") {
      router.replace("/login");
    }
  }, [status, router]);

  // Render nothing while the stored session is being read, and while the
  // redirect above is in flight — otherwise the shell flashes empty.
  if (status !== "signed-in" || !user) {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <p className="text-sm text-brand-gray">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      {/* print:hidden keeps the app chrome out of the generated PDF. */}
      <header className="border-b border-slate-200 bg-white print:hidden">
        <div className="mx-auto flex max-w-[100rem] flex-wrap items-center gap-x-4 gap-y-2 px-6 py-4">
          <Link
            href="/documents"
            className="text-sm font-semibold tracking-[0.18em] text-brand-blue uppercase"
          >
            Prelegal
          </Link>

          <nav className="flex-1">
            <Link
              href="/documents"
              className="text-sm text-slate-600 underline-offset-4 hover:text-navy hover:underline"
            >
              All documents
            </Link>
          </nav>

          <span className="text-sm text-brand-gray">{user.display_name}</span>
          <button
            type="button"
            onClick={() => {
              signOut();
              router.replace("/login");
            }}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-slate-400 hover:text-navy focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:outline-none"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[100rem] flex-1 px-6 py-6 print:max-w-none print:p-0">
        {children}
      </main>
    </div>
  );
}
