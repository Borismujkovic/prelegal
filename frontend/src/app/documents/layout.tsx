"use client";

/**
 * The signed-in shell: header, navigation, current user, sign out — and the
 * route guard.
 *
 * The guard is still client-side, because this is a static export and there is
 * no server in the request path to redirect an unauthenticated visitor. What
 * has changed is what stands behind it: the API now checks a session cookie on
 * every request that touches a user's data, so this is a convenience that keeps
 * signed-out visitors out of a page that would not work, rather than the only
 * thing between a stranger and someone's drafts.
 *
 * It waits for `status` to settle before doing anything. Treating "loading" as
 * "signed out" would bounce every signed-in user to the login screen while the
 * session check was still in flight — and that check is a network round trip
 * now, so the window is real rather than theoretical.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { SiteFooter } from "@/components/SiteFooter";
import { useSession } from "@/components/SessionProvider";

const NAV = [
  { href: "/documents", label: "All documents" },
  { href: "/documents/history", label: "Saved drafts" },
];

export default function DocumentsLayout({ children }: { children: ReactNode }) {
  const { user, status, signOut } = useSession();
  const router = useRouter();
  const pathname = usePathname();

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
        <div className="mx-auto flex max-w-[100rem] flex-wrap items-center gap-x-6 gap-y-3 px-6 py-4">
          <Link
            href="/documents"
            className="text-sm font-semibold tracking-[0.18em] text-brand-blue uppercase"
          >
            Prelegal
          </Link>

          <nav aria-label="Main" className="flex flex-1 items-center gap-5">
            {NAV.map((item) => {
              const current = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={current ? "page" : undefined}
                  className={
                    current
                      ? "text-sm font-medium text-navy underline decoration-brand-blue decoration-2 underline-offset-8"
                      : "text-sm text-slate-600 underline-offset-8 hover:text-navy hover:underline"
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <span className="text-sm text-brand-gray">{user.display_name}</span>
          <button
            type="button"
            onClick={() => {
              // Not awaited: the session is cleared locally first, so the UI
              // has nothing to wait for. See SessionProvider.signOut.
              void signOut();
              router.replace("/login");
            }}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-navy focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:outline-none"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[100rem] flex-1 px-6 py-8 print:max-w-none print:p-0">
        {children}
      </main>

      <SiteFooter />
    </div>
  );
}
