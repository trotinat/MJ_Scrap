"use client";

import { useActionState, useState } from "react";
import { Check, Palette, Ruler, Shirt, Store, Tag, User, Wallet } from "lucide-react";
import { MARJANE_FACETS, type ShopperProfile } from "@mdw/shared";
import { SubmitButton } from "@/components/buttons";
import { TagInput } from "@/components/tag-input";
import { Card, cx, input } from "@/components/ui";
import { saveProfileAction } from "./actions";

function Chips({ values, selected, onToggle }: { values: readonly string[]; selected: string[]; onToggle: (v: string) => void }) {
  const on = new Set(selected);
  return (
    <div className="flex flex-wrap gap-2">
      {values.map((v) => {
        const active = on.has(v);
        return (
          <button
            key={v}
            type="button"
            onClick={() => onToggle(v)}
            aria-pressed={active}
            className={cx(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition",
              active ? "border-tag-deep bg-tag-soft font-semibold text-ink" : "border-paper-line bg-paper-card text-ink-soft hover:border-ink-mute hover:text-ink",
            )}
          >
            {active && <Check className="h-3.5 w-3.5 text-tag-deep" aria-hidden />}
            {v}
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

export function ProfileForm({ initial }: { initial: ShopperProfile }) {
  const [p, setP] = useState<ShopperProfile>(initial);
  const [state, action] = useActionState(saveProfileAction, {});
  const toggle = (key: "genders" | "shoeSizes" | "clothingSizes" | "pantsSizes" | "colors") => (v: string) =>
    setP((prev) => ({ ...prev, [key]: prev[key].includes(v) ? prev[key].filter((x) => x !== v) : [...prev[key], v] }));

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="payload" value={JSON.stringify(p)} readOnly />
      {state.message && (
        <div className={cx("rounded-xl border px-4 py-3 text-sm", state.ok ? "border-proof/30 bg-proof-soft text-proof" : "border-promo/30 bg-promo-soft text-promo")}>{state.message}</div>
      )}

      <Card title="Qui achète">
        <div className="space-y-5">
          <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-medium text-ink"><User className="h-4 w-4 text-ink-mute" /> Genre</p>
            <Chips values={MARJANE_FACETS.gender.values} selected={p.genders} onToggle={toggle("genders")} />
          </div>
          <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-medium text-ink"><Ruler className="h-4 w-4 text-ink-mute" /> Pointure(s)</p>
            <Chips values={MARJANE_FACETS.shoeSize.values} selected={p.shoeSizes} onToggle={toggle("shoeSizes")} />
          </div>
          <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-medium text-ink"><Shirt className="h-4 w-4 text-ink-mute" /> Taille(s) de haut</p>
            <Chips values={MARJANE_FACETS.clothingSize.values} selected={p.clothingSizes} onToggle={toggle("clothingSizes")} />
          </div>
          <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-medium text-ink"><Ruler className="h-4 w-4 text-ink-mute" /> Taille(s) de pantalon</p>
            <Chips values={MARJANE_FACETS.pantsSize.values} selected={p.pantsSizes} onToggle={toggle("pantsSizes")} />
          </div>
          <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-medium text-ink"><Palette className="h-4 w-4 text-ink-mute" /> Couleurs préférées</p>
            <Chips values={MARJANE_FACETS.color.values} selected={p.colors} onToggle={toggle("colors")} />
          </div>
        </div>
      </Card>

      <Card title="Marques & vendeurs">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1 flex items-center gap-2 text-sm font-medium text-ink"><Tag className="h-4 w-4 text-ink-mute" /> Marques préférées</p>
            <TagInput value={p.preferredBrands} onChange={(v) => setP({ ...p, preferredBrands: v })} placeholder="Adidas, Nike, Samsung" ariaLabel="Marques préférées" />
          </div>
          <div>
            <p className="mb-1 flex items-center gap-2 text-sm font-medium text-ink"><Tag className="h-4 w-4 text-ink-mute" /> Marques à éviter</p>
            <TagInput value={p.excludedBrands} onChange={(v) => setP({ ...p, excludedBrands: v })} ariaLabel="Marques à éviter" />
          </div>
          <div className="sm:col-span-2">
            <p className="mb-1 flex items-center gap-2 text-sm font-medium text-ink"><Store className="h-4 w-4 text-ink-mute" /> Vendeurs préférés</p>
            <TagInput value={p.preferredSellers} onChange={(v) => setP({ ...p, preferredSellers: v })} placeholder="MARJANE" ariaLabel="Vendeurs préférés" />
          </div>
        </div>
      </Card>

      <Card title="Budget">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 flex items-center gap-2 text-sm font-medium text-ink"><Wallet className="h-4 w-4 text-ink-mute" /> Budget maximum par article (MAD)</span>
            <input className={input} inputMode="decimal" defaultValue={p.maxPrice ?? ""} onChange={(e) => setP({ ...p, maxPrice: numOrNull(e.target.value) })} placeholder="ex. 2000" />
          </label>
          <label className="block">
            <span className="mb-1 flex items-center gap-2 text-sm font-medium text-ink"><Tag className="h-4 w-4 text-ink-mute" /> Remise minimale souhaitée (%)</span>
            <input className={input} inputMode="decimal" defaultValue={p.minDiscountPct ?? ""} onChange={(e) => setP({ ...p, minDiscountPct: numOrNull(e.target.value) })} placeholder="ex. 30" />
          </label>
        </div>
      </Card>

      <div className="sticky bottom-20 z-10 flex justify-end lg:bottom-4">
        <SubmitButton pendingLabel="Enregistrement…">Enregistrer mon profil</SubmitButton>
      </div>
    </form>
  );
}
