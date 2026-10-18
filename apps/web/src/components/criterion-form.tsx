"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Loader2, Plus, SearchCheck, Trash2 } from "lucide-react";
import {
  CATEGORY_SUGGESTIONS,
  NOTIFY_MODE_LABELS,
  NOTIFY_MODES,
  SPEC_ATTRIBUTES,
  SPEC_OPERATOR_LABELS,
  SPEC_OPERATORS,
  URBAN_JUNGLE_COLLECTIONS,
  type CriterionInput,
  type SpecRule,
} from "@mdw/shared";
import { TagInput } from "./tag-input";
import { CategoryPicker } from "./category-picker";
import { SubmitButton } from "./buttons";
import { btn, Card, Field, input } from "./ui";

export interface FormState {
  errors?: Record<string, string>;
  message?: string;
}

type Draft = Omit<CriterionInput, "filters"> & { filters: CriterionInput["filters"] };
type PreviewItem = { url: string; title: string; imageUrl: string | null; priceCents: number; originalPriceCents: number | null; advertisedDiscountPct: number | null; seller: string | null; score: number; dealClass: string };
type PreviewEvent = { type: string; item?: PreviewItem; message?: string; path?: string; checked?: number; found?: number; rejected?: number; errors?: number; count?: number; title?: string; reasons?: string[] };
type PreviewState = { phase: "idle" | "running" | "done" | "error"; items: PreviewItem[]; rejected: number; examples: { title: string; reasons: string[] }[]; checked: number; found: number; errors: number; message: string; testedPayload: string };

/** A shop's collections as toggle buttons (its equivalent of rayons). */
function CollectionPicker({ collections, value, onChange }: { collections: { path: string; label: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {collections.map((c) => {
        const on = value.includes(c.path);
        return (
          <button key={c.path} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((p) => p !== c.path) : [...value, c.path])}
            className={`min-h-11 rounded-full border px-4 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-tag ${on ? "border-brand-600 bg-brand-50 text-brand-700" : "border-paper-line bg-paper text-ink hover:border-brand-300"}`}>
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

const numOrNull = (s: string): number | null => {
  if (s.trim() === "") return null;
  const n = Number(s.replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(n) ? n : null;
};

function RuleEditor({ title, hint, rules, onChange }: { title: string; hint: string; rules: SpecRule[]; onChange: (r: SpecRule[]) => void }) {
  return (
    <div>
      <p className="text-sm font-medium text-ink-soft">{title}</p>
      <p className="mb-2 text-xs text-ink-mute">{hint}</p>
      <div className="space-y-2">
        {rules.map((r, i) => (
          <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_10rem_10rem_auto]">
            <select
              className={input}
              value={r.attribute}
              onChange={(e) => onChange(rules.map((x, j) => (j === i ? { ...x, attribute: e.target.value } : x)))}
              aria-label="Caractéristique"
            >
              {SPEC_ATTRIBUTES.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                  {a.unit ? ` (${a.unit})` : ""}
                </option>
              ))}
            </select>
            <select
              className={input}
              value={r.operator}
              onChange={(e) => onChange(rules.map((x, j) => (j === i ? { ...x, operator: e.target.value as SpecRule["operator"] } : x)))}
              aria-label="Opérateur"
            >
              {SPEC_OPERATORS.map((o) => (
                <option key={o} value={o}>
                  {SPEC_OPERATOR_LABELS[o]}
                </option>
              ))}
            </select>
            <input
              className={input}
              value={r.value}
              placeholder="ex. 55, 4K, 16, QLED"
              onChange={(e) => onChange(rules.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
              aria-label="Valeur"
            />
            <button type="button" className={btn.ghost} onClick={() => onChange(rules.filter((_, j) => j !== i))} aria-label="Supprimer la règle">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <button type="button" className={`${btn.ghost} mt-2`} onClick={() => onChange([...rules, { attribute: "screen_size_in", operator: "eq", value: "" }])}>
        <Plus className="h-4 w-4" /> Ajouter une règle
      </button>
    </div>
  );
}

export function CriterionForm({
  initial,
  action,
  submitLabel,
  previewBeforeSave = false,
  shops = [],
}: {
  initial: Draft;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  previewBeforeSave?: boolean;
  shops?: { id: string; name: string }[];
}) {
  const [d, setD] = useState<Draft>(initial);
  const [state, formAction] = useActionState(action, {});
  const [preview, setPreview] = useState<PreviewState>({ phase: "idle", items: [], rejected: 0, examples: [], checked: 0, found: 0, errors: 0, message: "", testedPayload: "" });
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);
  const suggestedName = d.filters.keywords[0] || d.filters.altKeywords[0] || d.filters.categoryPaths[0]?.split("?")[0]?.split("/").filter(Boolean).at(-1)?.replaceAll("-", " ") || "Ma recherche";
  const payload = JSON.stringify({ ...d, name: d.name.trim() || (previewBeforeSave ? suggestedName.slice(0, 120) : d.name) });
  const filterSignature = JSON.stringify([d.shopId, d.filters]);
  const selectedShop = shops.find(shop => shop.id === d.shopId)?.name ?? "la boutique";
  const isCurrentPreview = preview.phase === "done" && preview.testedPayload === filterSignature;
  const hasSearchScope = d.filters.categoryPaths.length > 0 || d.filters.keywords.length > 0 || d.filters.altKeywords.length > 0 || Boolean(d.filters.modelRef);
  async function testSearch() {
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    setPreview({ phase: "running", items: [], rejected: 0, examples: [], checked: 0, found: 0, errors: 0, message: `Connexion à ${selectedShop}…`, testedPayload: filterSignature });
    try {
      const response = await fetch("/api/criteres/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, signal: abort.signal });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message ?? "Le test a échoué.");
      }
      if (!response.body) throw new Error("Le navigateur ne peut pas afficher les résultats progressifs.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const accept = (line: string) => {
        if (!line.trim()) return;
        const event = JSON.parse(line) as PreviewEvent;
        setPreview((p) => {
          if (event.type === "match" && event.item) return { ...p, items: [...p.items, event.item], found: p.found + 1 };
          if (event.type === "reject") return { ...p, rejected: p.rejected + 1, examples: event.title && p.examples.length < 3 ? [...p.examples, { title: event.title, reasons: event.reasons ?? [] }] : p.examples };
          if (event.type === "progress") return { ...p, checked: event.checked ?? p.checked, found: event.found ?? p.found, errors: event.errors ?? p.errors };
          if (event.type === "path") return { ...p, message: `Exploration de ${event.path}…` };
          if (event.type === "listing") return { ...p, message: `${event.count ?? 0} produits repérés · vérification des fiches…` };
          if (event.type === "warning") return { ...p, errors: p.errors + 1, message: event.message ?? "Rayon indisponible." };
          if (event.type === "error") return { ...p, phase: "error", message: event.message ?? "Le test a échoué." };
          if (event.type === "done") return { ...p, phase: "done", checked: event.checked ?? p.checked, found: event.found ?? p.found, rejected: event.rejected ?? p.rejected, errors: event.errors ?? p.errors, message: "Test terminé" };
          return p;
        });
      };
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) accept(line);
      }
      if (buffer.trim()) accept(buffer);
      setPreview((p) => p.phase === "running" ? { ...p, phase: "error", message: "Le test s’est interrompu. Réessayez." } : p);
    } catch (error) {
      if (!abort.signal.aborted) setPreview((p) => ({ ...p, phase: "error", message: error instanceof Error ? error.message : "Le test a échoué." }));
    }
  }
  const e = state.errors ?? {};
  const f = d.filters;
  const setF = (patch: Partial<Draft["filters"]>) => setD({ ...d, filters: { ...f, ...patch } });
  const money = (key: "minPrice" | "maxPrice" | "targetPrice") => ({
    value: f[key] ?? "",
    onChange: (ev: React.ChangeEvent<HTMLInputElement>) => setF({ [key]: numOrNull(ev.target.value) } as Partial<Draft["filters"]>),
  });

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="payload" value={payload} />
      <label className="block text-sm font-semibold text-ink">Boutique
        <select className={`${input} mt-2`} value={d.shopId} onChange={e => setD({ ...d, shopId: e.target.value, filters: { ...d.filters, categoryPaths: [] } })}>
          {shops.map(shop => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
        </select>
      </label>
      {state.message && <div className="rounded-lg border border-promo/30 bg-promo-soft px-4 py-3 text-sm text-promo">{state.message}</div>}

      {previewBeforeSave && <Card title="1. Que cherchez-vous ?">
        <div className="space-y-4">
          <Field label="Produit ou mots-clés" hint="Validez avec Entrée ou une virgule. Plusieurs mots sont des alternatives.">
            <TagInput value={f.keywords} onChange={(v) => setF({ keywords: v })} placeholder="Ex. casquette, sneakers, TV 4K" ariaLabel="Produit ou mots-clés" />
          </Field>
          <div>
            <p className="mb-1 text-sm font-medium text-ink">Rayons à surveiller</p>
            <p className="mb-2 text-xs text-ink-mute">Facultatif. Les rayons dépendent de la boutique choisie.</p>
            {d.shopId === "marjane-mall" && <CategoryPicker value={f.categoryPaths} onChange={(v) => setF({ categoryPaths: v })} />}
            {d.shopId === "urban-jungle-ma" && <CollectionPicker collections={URBAN_JUNGLE_COLLECTIONS} value={f.categoryPaths} onChange={(v) => setF({ categoryPaths: v })} />}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Prix maximum (MAD)" htmlFor="quick-max-price"><input id="quick-max-price" className={input} inputMode="decimal" {...money("maxPrice")} /></Field>
            <Field label="Pour qui ?" htmlFor="quick-gender" hint="Selon mon profil évite les offres mode non pertinentes.">
              <select id="quick-gender" className={input} value={f.genders[0] ?? ""} onChange={ev => setF({ genders: ev.target.value ? [ev.target.value] : [] })}>
                <option value="">Selon mon profil</option><option>Homme</option><option>Femme</option><option>Mixte</option><option>Garçon</option><option>Fille</option>
              </select>
            </Field>
          </div>
        </div>
      </Card>}

      <details open={!previewBeforeSave} className={previewBeforeSave ? "rounded-[1.35rem] border border-paper-line bg-paper-card p-4 sm:p-5" : "space-y-5"}>
        <summary className={previewBeforeSave ? "cursor-pointer text-sm font-semibold text-ink" : "sr-only"}>Plus de filtres et options <span className="font-normal text-ink-mute">· nom, tailles, marques, alertes</span></summary>
        <div className="mt-5 space-y-5">
      <Card title="Identification">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nom de la recherche" error={e.name} htmlFor="name">
            <input id="name" className={input} value={d.name} onChange={(ev) => setD({ ...d, name: ev.target.value })} required={!previewBeforeSave} placeholder={previewBeforeSave ? suggestedName : undefined} maxLength={120} />
          </Field>
          <Field label="Statut">
            <label className="mt-2 inline-flex items-center gap-2 text-sm text-ink-soft">
              <input type="checkbox" checked={d.enabled} onChange={(ev) => setD({ ...d, enabled: ev.target.checked })} className="h-4 w-4 rounded border-paper-line text-ink" />
              Critère actif (inclus dans les collectes)
            </label>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Description" error={e.description} htmlFor="description">
              <textarea id="description" className={input} rows={2} value={d.description} onChange={(ev) => setD({ ...d, description: ev.target.value })} maxLength={1000} />
            </Field>
          </div>
        </div>
      </Card>

      <Card title="Où et quoi chercher">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <p className="mb-1 block text-sm font-medium text-ink">Rayons à surveiller</p>
            <p className="mb-2 text-xs text-ink-mute">{d.shopId === "urban-jungle-ma" ? "Choisissez des collections Urban Jungle. Sans collection, la recherche parcourt les soldes." : "Choisissez où chercher sur Marjane Mall. Sans rayon, la recherche parcourt les pages promos configurées."}</p>
            {d.shopId === "marjane-mall" && <CategoryPicker value={f.categoryPaths} onChange={(v) => setF({ categoryPaths: v })} />}
            {d.shopId === "urban-jungle-ma" && <CollectionPicker collections={URBAN_JUNGLE_COLLECTIONS} value={f.categoryPaths} onChange={(v) => setF({ categoryPaths: v })} />}
            {e["filters.categoryPaths"] && <p className="mt-1 text-xs text-promo">{e["filters.categoryPaths"]}</p>}
            <details className="mt-3 rounded-xl border border-paper-line bg-paper/60 px-3 py-2">
              <summary className="cursor-pointer text-xs font-medium text-ink-soft">Coller une URL ou un chemin exact (filtres pointure, genre…)</summary>
              <div className="mt-2">
                <TagInput
                  value={f.categoryPaths}
                  onChange={(v) => setF({ categoryPaths: v })}
                  placeholder="https://www.marjanemall.ma/boutique-officielle/adidas?maas_46800=42"
                  suggestions={CATEGORY_SUGGESTIONS.map((c) => ({ value: c.path, label: c.label }))}
                  ariaLabel="Catégories"
                />
                <p className="mt-1 text-xs text-ink-mute">Une URL filtrée est ouverte dans le navigateur headless, car le site applique ces filtres en JavaScript.</p>
              </div>
            </details>
          </div>
          <Field label="Mots-clés" hint="Au moins un doit apparaître dans le titre." error={e["filters.keywords"]}>
            <TagInput value={f.keywords} onChange={(v) => setF({ keywords: v })} placeholder="TV 4K, Smart TV" ariaLabel="Mots-clés" />
          </Field>
          <Field label="Mots-clés alternatifs / synonymes" error={e["filters.altKeywords"]}>
            <TagInput value={f.altKeywords} onChange={(v) => setF({ altKeywords: v })} placeholder="Téléviseur, QLED" ariaLabel="Synonymes" />
          </Field>
          <Field label="Nom exact ou référence du modèle" hint="Facultatif. Ex. QA55Q6FAAUXMV" error={e["filters.modelRef"]}>
            <input className={input} value={f.modelRef ?? ""} onChange={(ev) => setF({ modelRef: ev.target.value || null })} maxLength={60} />
          </Field>
          <Field label="État du produit">
            <select className={input} value={f.condition} onChange={(ev) => setF({ condition: ev.target.value as "any" | "new_only" })}>
              <option value="any">Indifférent</option>
              <option value="new_only">Neuf uniquement (exclut reconditionné / occasion)</option>
            </select>
          </Field>
        </div>
      </Card>

      <Card title="Correspondance précise">
        <p className="mb-4 text-sm text-ink-mute">Un attribut obligatoire absent de la fiche exclut le produit. Les tailles du profil s’appliquent aux recherches mode si vous laissez ces champs vides.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Type de produit">
            <select aria-label="Type de produit" className={input} value={f.productType} onChange={ev => setF({productType: ev.target.value as typeof f.productType})}>
              <option value="any">Automatique selon le rayon</option><option value="shoes">Chaussures</option><option value="pants">Pantalons & jeans</option><option value="tops">Hauts & vestes</option>
            </select>
          </Field>
          <Field label="Tailles ou pointures obligatoires" hint="Une taille parmi celles indiquées doit être confirmée.">
            <TagInput value={f.sizes} onChange={v => setF({sizes:v})} placeholder="42 ou M ou 32, 33" ariaLabel="Tailles obligatoires" />
          </Field>
          <Field label="Genre obligatoire" hint="Le profil fournit la valeur par défaut pour la mode.">
            <select aria-label="Genre obligatoire" className={input} value={f.genders[0] ?? ''} onChange={ev => setF({genders:ev.target.value ? [ev.target.value] : []})}>
              <option value="">Selon mon profil</option><option>Homme</option><option>Femme</option><option>Mixte</option><option>Garçon</option><option>Fille</option>
            </select>
          </Field>
        </div>
      </Card>

      <Card title="Marques et vendeurs">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Marques préférées" hint="Bonus de score, non obligatoire.">
            <TagInput value={f.preferredBrands} onChange={(v) => setF({ preferredBrands: v })} placeholder="TCL, Samsung, LG" ariaLabel="Marques préférées" />
          </Field>
          <Field label="Marques imposées" hint="Si renseigné, seules ces marques sont acceptées.">
            <TagInput value={f.includedBrands} onChange={(v) => setF({ includedBrands: v })} ariaLabel="Marques imposées" />
          </Field>
          <Field label="Marques exclues">
            <TagInput value={f.excludedBrands} onChange={(v) => setF({ excludedBrands: v })} ariaLabel="Marques exclues" />
          </Field>
          <Field label="Vendeurs préférés" hint="Ex. MARJANE (vendu par Marjane).">
            <TagInput value={f.preferredSellers} onChange={(v) => setF({ preferredSellers: v })} ariaLabel="Vendeurs préférés" />
          </Field>
          <Field label="Vendeurs exclus">
            <TagInput value={f.excludedSellers} onChange={(v) => setF({ excludedSellers: v })} ariaLabel="Vendeurs exclus" />
          </Field>
        </div>
      </Card>

      <Card title="Prix et remises (MAD)">
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Prix minimum" error={e["filters.minPrice"]}>
            <input className={input} inputMode="decimal" {...money("minPrice")} />
          </Field>
          <Field label="Prix maximum" error={e["filters.maxPrice"]}>
            <input className={input} inputMode="decimal" {...money("maxPrice")} />
          </Field>
          <Field label="Prix cible" hint="Alerte dès qu'il est atteint." error={e["filters.targetPrice"]}>
            <input className={input} inputMode="decimal" {...money("targetPrice")} />
          </Field>
          <Field label="Remise annoncée minimale (%)" error={e["filters.minDiscountPct"]}>
            <input className={input} inputMode="decimal" value={f.minDiscountPct ?? ""} onChange={(ev) => setF({ minDiscountPct: numOrNull(ev.target.value) })} />
          </Field>
        </div>
      </Card>

      <Card title="Caractéristiques techniques">
        <div className="space-y-6">
          <RuleEditor
            title="Exigences obligatoires"
            hint="Un produit qui ne respecte pas (ou ne permet pas de vérifier) une exigence n'est jamais présenté comme une correspondance."
            rules={f.mandatorySpecs}
            onChange={(r) => setF({ mandatorySpecs: r })}
          />
          <RuleEditor title="Spécifications préférées" hint="Améliorent le score sans être obligatoires." rules={f.preferredSpecs} onChange={(r) => setF({ preferredSpecs: r })} />
          {(e["filters.mandatorySpecs"] || e["filters.preferredSpecs"]) && <p className="text-xs text-promo">{e["filters.mandatorySpecs"] ?? e["filters.preferredSpecs"]}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Caractéristiques préférées (texte)" hint="Ex. Dolby Atmos, Android TV">
              <TagInput value={f.preferredCharacteristics} onChange={(v) => setF({ preferredCharacteristics: v })} ariaLabel="Caractéristiques préférées" />
            </Field>
            <Field label="Caractéristiques exclues (texte)" hint="Ex. reconditionné, incurvé">
              <TagInput value={f.excludedCharacteristics} onChange={(v) => setF({ excludedCharacteristics: v })} ariaLabel="Caractéristiques exclues" />
            </Field>
            <Field label="Note client minimale (sur 5)" hint="Rarement affichée par le site : un produit sans note sera exclu.">
              <input className={input} inputMode="decimal" value={f.minRating ?? ""} onChange={(ev) => setF({ minRating: numOrNull(ev.target.value) })} />
            </Field>
            <Field label="Nombre d'avis minimal" hint="Un produit sans avis affiché sera exclu.">
              <input className={input} inputMode="numeric" value={f.minReviewCount ?? ""} onChange={(ev) => setF({ minReviewCount: numOrNull(ev.target.value) })} />
            </Field>
          </div>
        </div>
      </Card>

      <Card title="Notifications Telegram">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Mode de notification">
            <select className={input} value={d.notifyMode} onChange={(ev) => setD({ ...d, notifyMode: ev.target.value as Draft["notifyMode"] })}>
              {NOTIFY_MODES.map((m) => (
                <option key={m} value={m}>
                  {NOTIFY_MODE_LABELS[m]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Score minimal pour notifier (0–100)" hint="Le prix cible atteint notifie toujours." error={e.notifyMinScore}>
            <input className={input} inputMode="numeric" value={d.notifyMinScore} onChange={(ev) => setD({ ...d, notifyMinScore: Number(ev.target.value) || 0 })} />
          </Field>
          <Field label="Baisse significative (%)" hint="Seuil pour une alerte de baisse de prix." error={e.minPriceDropPct}>
            <input className={input} inputMode="decimal" value={d.minPriceDropPct} onChange={(ev) => setD({ ...d, minPriceDropPct: Number(ev.target.value.replace(",", ".")) || 0 })} />
          </Field>
        </div>
      </Card>
        </div>
      </details>

      {previewBeforeSave && <section className="rounded-[1.35rem] border border-paper-line bg-paper-card p-5" aria-label="Test de la recherche">
        <h2 className="font-display text-lg font-bold text-ink">2. Vérifier les résultats</h2>
        <p className="mt-1 text-sm text-ink-mute">Les correspondances apparaissent à mesure que leurs fiches sont vérifiées. Aperçu limité aux 2 premiers rayons et à 16 fiches, sans historique de prix.</p>
        {!hasSearchScope && <p className="mt-3 text-sm text-promo">Ajoutez un produit ou choisissez un rayon pour commencer.</p>}
        <button type="button" onClick={testSearch} disabled={preview.phase === "running" || !hasSearchScope} className={`${btn.secondary} mt-4 min-h-11 w-full sm:w-auto`}>
          {preview.phase === "running" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <SearchCheck className="h-4 w-4" aria-hidden />}
          {preview.phase === "running" ? "Test en cours…" : preview.phase === "idle" ? "Tester la recherche" : "Relancer le test"}
        </button>
        <div role="status" aria-live="polite" className="mt-3 text-sm text-ink-soft">
          {preview.phase !== "idle" && <p>{preview.message} · {preview.checked} fiche{preview.checked > 1 ? "s" : ""} vérifiée{preview.checked > 1 ? "s" : ""} · {preview.found} résultat{preview.found > 1 ? "s" : ""}</p>}
          {preview.rejected > 0 && <p className="mt-1">{preview.rejected} produit{preview.rejected > 1 ? "s" : ""} écarté{preview.rejected > 1 ? "s" : ""} par vos filtres.</p>}
          {preview.errors > 0 && <p className="mt-1 text-promo">{preview.errors} fiche{preview.errors > 1 ? "s" : ""} ou rayon{preview.errors > 1 ? "s" : ""} non vérifié{preview.errors > 1 ? "s" : ""} : aperçu incomplet.</p>}
          {preview.phase === "done" && preview.found === 0 && <p className="mt-1">Aucun résultat dans cet échantillon. Vous pouvez ajuster les critères et relancer.</p>}
          {preview.testedPayload !== filterSignature && preview.phase !== "idle" && <p className="mt-1 text-promo">Les filtres ont changé depuis le test. Relancez-le pour valider.</p>}
        </div>
        {preview.items.length > 0 && <ul className="mt-4 space-y-2" aria-label="Produits correspondants">
          {preview.items.map((item) => <li key={item.url} className="flex gap-3 rounded-xl border border-paper-line p-3">
            {item.imageUrl && <img src={item.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-lg bg-paper object-contain" loading="lazy" />}
            <div className="min-w-0 flex-1">
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="line-clamp-2 text-sm font-semibold text-ink underline-offset-2 hover:underline">{item.title}</a>
              <p className="num mt-1 font-bold text-ink">{(item.priceCents / 100).toLocaleString("fr-MA")} MAD <span className="ml-1 text-xs font-normal text-ink-mute">{item.advertisedDiscountPct !== null ? `−${item.advertisedDiscountPct} % annoncé` : "remise non indiquée"}</span></p>
              <p className="text-xs text-ink-mute">Fiche vérifiée · score {item.score}/100 sans historique{item.seller ? ` · ${item.seller}` : ""}</p>
            </div>
          </li>)}
        </ul>}
        {preview.examples.length > 0 && <details className="mt-4 rounded-xl border border-paper-line px-3 py-2 text-sm text-ink-soft">
          <summary className="cursor-pointer font-medium">Pourquoi certains produits sont écartés ?</summary>
          <ul className="mt-2 space-y-2">{preview.examples.map((example, i) => <li key={i}><span className="font-medium text-ink">{example.title}</span><span className="block text-xs">{example.reasons.join(" · ")}</span></li>)}</ul>
        </details>}
      </section>}
      <div className="flex flex-col gap-2 pb-[env(safe-area-inset-bottom)] sm:items-end">
        {previewBeforeSave && <p className="text-xs text-ink-mute">3. La collecte complète démarre après validation.</p>}
        <SubmitButton pendingLabel="Enregistrement…" disabled={previewBeforeSave && !isCurrentPreview}>{previewBeforeSave ? "Valider et créer la recherche" : submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
