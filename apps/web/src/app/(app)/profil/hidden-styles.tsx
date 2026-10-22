"use client";

import { useTransition } from "react";
import { Eye, EyeOff, RotateCcw } from "lucide-react";
import type { HiddenStyle } from "@mdw/shared";
import { showAllStylesAction, showStyleAction } from "../style-actions";

const KIND_LABELS: Record<HiddenStyle["kind"], string> = { product: "Produit", kind: "Type de produit", collection: "Collection ou ligne", brand: "Marque" };

export function HiddenStylesList({ styles }: { styles: HiddenStyle[] }) {
  const [pending, start] = useTransition();
  return (
    <section id="styles-masques" className="mb-6 scroll-mt-24 rounded-2xl border border-paper-line bg-paper-card p-4 sm:p-5" aria-labelledby="hidden-styles-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="hidden-styles-title" className="flex items-center gap-2 text-base font-bold text-ink"><EyeOff className="h-4 w-4 text-ink-mute" aria-hidden /> Styles masqués chez Urban Jungle{styles.length ? <span className="num rounded-full bg-brand-50 px-2 text-xs text-brand-700">{styles.length}</span> : null}</h2>
          <p className="mt-1 text-sm text-ink-mute">Ajoutés avec « Pas mon style » dans Pour vous. Ils n’apparaissent plus dans Pour vous, Mes résultats, Boutiques ni dans les alertes.</p>
        </div>
        {styles.length > 1 && (
          <button type="button" disabled={pending} onClick={() => start(async () => { await showAllStylesAction(); })}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-paper-line bg-paper px-3 text-sm font-semibold text-ink hover:border-brand-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-tag disabled:opacity-50">
            <RotateCcw className="h-4 w-4" aria-hidden /> Tout réafficher
          </button>
        )}
      </div>
      {styles.length ? (
        <ul className="mt-3 space-y-2">
          {styles.map((s) => (
            <li key={`${s.kind}:${s.value}`} className="flex items-center justify-between gap-3 rounded-xl border border-paper-line bg-paper px-3 py-2">
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-ink">{s.label}</span>
                <span className="text-xs text-ink-mute">{KIND_LABELS[s.kind]}</span>
              </span>
              <button type="button" disabled={pending} onClick={() => start(async () => { await showStyleAction(s); })}
                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-paper-line bg-paper-card px-3 text-sm font-semibold text-ink hover:border-brand-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-tag disabled:opacity-50">
                <Eye className="h-4 w-4" aria-hidden /> Afficher à nouveau
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-ink-mute">Aucun style masqué pour l’instant. Touchez l’icône « Pas mon style » sur un produit Urban Jungle dans Pour vous pour en ajouter.</p>
      )}
    </section>
  );
}
