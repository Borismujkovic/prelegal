/**
 * The creator for every agreement except the Mutual NDA.
 *
 * A Server Component, unusually for this app, and not by preference:
 * `generateStaticParams` cannot live in a `"use client"` module, and a static
 * export refuses a dynamic route that has no `generateStaticParams`. So this
 * file enumerates the routes and hands the resolved id to a Client Component
 * that does the actual work.
 *
 * The Mutual NDA is deliberately not in the registry, so it is never generated
 * here. Its own `documents/mutual-nda/page.tsx` keeps that path to itself and
 * the two never compete for it — which is a stronger arrangement than relying
 * on a literal segment out-ranking a dynamic one.
 *
 * `dynamicParams = false` makes anything not listed a 404 rather than a route
 * that cannot be built.
 */
import { notFound } from "next/navigation";
import { DocumentCreator } from "@/components/generic/DocumentCreator";
import { DOCUMENT_REGISTRY, DRAFTABLE_DOCUMENT_IDS } from "@/lib/generated";

export const dynamicParams = false;

export function generateStaticParams() {
  return DRAFTABLE_DOCUMENT_IDS.map((documentId) => ({ documentId }));
}

export async function generateMetadata({
  params,
}: PageProps<"/documents/[documentId]">) {
  const { documentId } = await params;
  const agreement = DOCUMENT_REGISTRY[documentId];

  return agreement
    ? {
        title: `${agreement.name} · Prelegal`,
        description: agreement.summary,
      }
    : { title: "Prelegal" };
}

export default async function DocumentPage({
  params,
}: PageProps<"/documents/[documentId]">) {
  const { documentId } = await params;
  const agreement = DOCUMENT_REGISTRY[documentId];
  if (!agreement) notFound();

  return <DocumentCreator document={agreement} />;
}
