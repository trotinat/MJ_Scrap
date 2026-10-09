"use client";

import { useActionState } from "react";
import { Link2 } from "lucide-react";
import { SubmitButton } from "@/components/buttons";
import { input } from "@/components/ui";
import { quickAddFromUrlAction } from "./actions";

/** Paste a Marjane Mall link (with its filters) to start monitoring it immediately. */
export function QuickAddFromUrl() {
  const [state, action] = useActionState(quickAddFromUrlAction, {});
  return (
    <form action={action} className="rounded-xl border border-brand-100 bg-brand-50 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-brand-900">
        <Link2 className="h-4 w-4" aria-hidden /> Surveiller une page Marjane Mall
      </div>
      <p className="mt-1 text-xs text-slate-600">
        Collez l&apos;adresse d&apos;une catégorie, d&apos;une boutique ou d&apos;une recherche filtrée (pointure, genre, livraison express…). Le critère est créé et une collecte démarre aussitôt.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_16rem_auto]">
        <input
          id="quick-url"
          name="url"
          required
          className={input}
          placeholder="https://www.marjanemall.ma/boutique-officielle/adidas?maas_46800=42&maas_28003=Homme"
          aria-label="Adresse de la page Marjane Mall"
        />
        <input id="quick-name" name="name" className={input} placeholder="Nom (facultatif)" aria-label="Nom du critère" maxLength={120} />
        <SubmitButton pendingLabel="Création…">Surveiller</SubmitButton>
      </div>
      {state.error && <p className="mt-2 text-sm text-rose-700">{state.error}</p>}
    </form>
  );
}
