"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Grid2X2, List } from "lucide-react";

const STORAGE_KEY = "hawta:deal-layout:v1";
type Layout = "list" | "two";

export function DealResultsGrid({ children, className }: { children: ReactNode; className: string }) {
  const [layout, setLayout] = useState<Layout>("list");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "two" || saved === "list") setLayout(saved);
    const sync = (event: Event) => setLayout((event as CustomEvent<Layout>).detail);
    window.addEventListener("hawta-deal-layout-change", sync);
    return () => window.removeEventListener("hawta-deal-layout-change", sync);
  }, []);

  function choose(next: Layout) {
    setLayout(next);
    localStorage.setItem(STORAGE_KEY, next);
    window.dispatchEvent(new CustomEvent("hawta-deal-layout-change", { detail: next }));
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <div role="group" aria-label="Affichage des produits" className="inline-flex rounded-xl border border-paper-line bg-white p-1">
          <button type="button" onClick={() => choose("list")} aria-pressed={layout === "list"} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-ink-soft hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 aria-pressed:bg-ink aria-pressed:text-white">
            <List className="h-4 w-4" aria-hidden="true" /> Liste
          </button>
          <button type="button" onClick={() => choose("two")} aria-pressed={layout === "two"} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-ink-soft hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 aria-pressed:bg-ink aria-pressed:text-white">
            <Grid2X2 className="h-4 w-4" aria-hidden="true" /> 2 colonnes
          </button>
        </div>
      </div>
      <div data-layout={layout} className={className}>{children}</div>
    </div>
  );
}
