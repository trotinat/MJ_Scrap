import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { OpsDashboard } from "./ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Observatoire VPS", robots: { index: false, follow: false } };

export default async function ObservatoirePage() {
  await requireUser();
  return <OpsDashboard />;
}
