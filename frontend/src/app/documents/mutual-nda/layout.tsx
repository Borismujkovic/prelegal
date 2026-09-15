/**
 * Exists only to title the tab. The page itself is a Client Component, and
 * those cannot export `metadata`.
 */
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mutual NDA · Prelegal",
  description:
    "Fill in a cover page and download a completed Common Paper Mutual Non-Disclosure Agreement.",
};

export default function MutualNdaLayout({
  children,
}: LayoutProps<"/documents/mutual-nda">) {
  return children;
}
