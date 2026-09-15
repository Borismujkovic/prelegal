"use client";

/**
 * The entry point, which is only ever a redirect.
 *
 * A static export has no server to decide where "/" should go, so the decision
 * happens here once the stored session has been read.
 */

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/components/SessionProvider";

export default function Home() {
  const router = useRouter();
  const { status } = useSession();

  useEffect(() => {
    if (status === "loading") return;
    router.replace(status === "signed-in" ? "/documents" : "/login");
  }, [status, router]);

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <p className="text-sm text-brand-gray">Loading…</p>
    </div>
  );
}
