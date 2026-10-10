import { notFound } from "next/navigation";
import { Cockpit } from "@/components/cockpit";
import { DEFAULT_SECTION, isKnownSection } from "@/lib/types";

/**
 * Every cockpit screen is a real route. An unknown path answers 404 rather than
 * silently rendering Overview, which previously made `/nonexistent` and a
 * deliberate `/overview` indistinguishable to the owner.
 *
 * `isKnownSection` is imported from `@/lib/types`, a plain module. It must NOT be
 * imported from `components/cockpit.tsx`: that file is `"use client"`, and a server
 * component calling a function exported from a client module throws on every route.
 */
export default async function Page({ params }: { params: Promise<{ section?: string[] }> }) {
  const { section } = await params;
  // A deeper path than one segment is not a cockpit screen either; the catch-all
  // would otherwise render Overview for `/overview/anything`.
  if (section && section.length > 1) notFound();
  const requested = section?.[0] ?? DEFAULT_SECTION;
  if (!isKnownSection(requested)) notFound();
  return <Cockpit initialSection={requested} />;
}