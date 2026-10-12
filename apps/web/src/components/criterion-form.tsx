"use client";

import { useActionState, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  CATEGORY_SUGGESTIONS,
  NOTIFY_MODE_LABELS,
  NOTIFY_MODES,
  SPEC_ATTRIBUTES,
  SPEC_OPERATOR_LABELS,
  SPEC_OPERATORS,
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
}: {
  initial: Draft;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
}) {
  const [d, setD] = useState<Draft>(initial);
  const [state, formAction] = useActionState(action, {});
  const e = state.errors ?? {};
  const f = d.filters;
  const setF = (patch: Partial<Draft["filters"]>) => setD({ ...d, filters: { ...f, ...patch } });
  const money = (key: "minPrice" | "maxPrice" | "targetPrice") => ({
    value: f[key] ?? "",
    onChange: (ev: React.ChangeEvent<HTMLInputElement>) => setF({ [key]: numOrNull(ev.target.value) } as Partial<Draft["filters"]>),
  });

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="payload" value={JSON.stringify(d)} />
      {state.message && <div className="rounded-lg border border-promo/30 bg-promo-soft px-4 py-3 text-sm text-promo">{state.message}</div>}

      <Card title="Identification">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nom de la recherche" error={e.name} htmlFor="name">
            <input id="name" className={input} value={d.name} onChange={(ev) => setD({ ...d, name: ev.target.value })} required maxLength={120} />
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
            <p className="mb-2 text-xs text-ink-mute">Choisissez où chercher sur Marjane Mall. Sans rayon, la recherche n&apos;a rien à parcourir.</p>
            <CategoryPicker value={f.categoryPaths} onChange={(v) => setF({ categoryPaths: v })} />
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

      <div className="flex justify-end gap-2">
        <SubmitButton pendingLabel="Enregistrement…">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
