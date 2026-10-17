"use client";

import { useActionState, useState } from "react";
import { Link2, Search, Sliders, UserCog } from "lucide-react";
import Link from "next/link";
import { SubmitButton } from "@/components/buttons";
import { CategoryPicker } from "@/components/category-picker";
import { input } from "@/components/ui";
import { quickAddFromCategoriesAction, quickAddFromUrlAction } from "./actions";

/**
 * The easy way to start a search: name what you want, browse the Marjane Mall
 * rayons, done. Pasting a filtered URL stays available for power users.
 */
export function QuickAddFromUrl({ hasProfile = false }: { hasProfile?: boolean }) {
  const [cats, catsAction] = useActionState(quickAddFromCategoriesAction, {});
  const [url, urlAction] = useActionState(quickAddFromUrlAction, {});
  const [keywords, setKeywords] = useState("");
  const [name, setName] = useState("");
  const [paths, setPaths] = useState<string[]>([]);
  const [useProfile, setUseProfile] = useState(hasProfile);

  return (
    <div className="overflow-hidden rounded-2xl border border-paper-line bg-paper-card card-soft">
      <div className="border-b border-paper-line bg-gradient-to-br from-tag-soft to-paper-card px-5 py-4">
        <div className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
          <Search className="h-5 w-5 text-tag-deep" aria-hidden /> Création rapide
        </div>
        <p className="mt-0.5 text-sm text-ink-soft">Pour lancer sans aperçu. Si vous voulez vérifier les produits d’abord, utilisez la nouvelle recherche guidée.</p>
      </div>

      <form action={catsAction} className="px-5 py-4">
        <input type="hidden" name="payload" value={JSON.stringify({ name: name || undefined, keywords: keywords || undefined, paths, useProfile })} readOnly />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink">Mots-clés</span>
            <input value={keywords} onChange={(e) => setKeywords(e.target.value)} className={input} placeholder="ex. Smart TV 55, friteuse, baskets" aria-label="Mots-clés" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink">Nom de la recherche (facultatif)</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={input} placeholder="ex. TV pour le salon" aria-label="Nom" maxLength={120} />
          </label>
        </div>
        <div className="mt-3">
          <CategoryPicker value={paths} onChange={setPaths} />
        </div>
        <label className="mt-3 flex items-start gap-2.5 rounded-xl border border-paper-line bg-paper/60 px-3 py-2.5 text-sm">
          <input type="checkbox" checked={useProfile} onChange={(e) => setUseProfile(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-paper-line accent-ink" />
          <span className="flex-1 text-ink-soft">
            <span className="flex items-center gap-1.5 font-medium text-ink"><UserCog className="h-4 w-4 text-tag-deep" aria-hidden /> Utiliser mon profil</span>
            Filtre les rayons mode par genre, pointure, taille et couleur, et applique vos marques, vendeurs et budget.{" "}
            <Link href="/profil" className="underline hover:text-ink">Modifier mon profil</Link>
          </span>
        </label>
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-xs text-ink-mute">{paths.length === 0 ? "Choisissez au moins un rayon." : `${paths.length} rayon${paths.length > 1 ? "s" : ""} sélectionné${paths.length > 1 ? "s" : ""}.`}</span>
          <SubmitButton pendingLabel="Création…" disabled={paths.length === 0}>Lancer la recherche</SubmitButton>
        </div>
        {cats.error && <p className="mt-2 text-sm text-promo">{cats.error}</p>}
      </form>

      <details className="border-t border-paper-line px-5 py-3">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink-soft">
          <Link2 className="h-4 w-4" aria-hidden /> J&apos;ai déjà un lien Marjane Mall (avec filtres)
        </summary>
        <form action={urlAction} className="mt-3 grid gap-2 sm:grid-cols-[1fr_14rem_auto]">
          <input
            name="url"
            required
            className={input}
            placeholder="https://www.marjanemall.ma/boutique-officielle/adidas?maas_46800=42&maas_28003=Homme"
            aria-label="Adresse de la page Marjane Mall"
          />
          <input name="name" className={input} placeholder="Nom (facultatif)" aria-label="Nom du critère" maxLength={120} />
          <SubmitButton pendingLabel="Création…">Surveiller</SubmitButton>
        </form>
        {url.error && <p className="mt-2 text-sm text-promo">{url.error}</p>}
      </details>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-paper-line px-5 py-2.5 text-xs text-ink-mute">
        <Sliders className="h-3.5 w-3.5" aria-hidden /> Vérifier avant d’activer ?
        <Link href="/criteres/nouveau" className="font-medium text-ink-soft underline hover:text-ink">Tester une recherche guidée</Link>
      </div>
    </div>
  );
}
