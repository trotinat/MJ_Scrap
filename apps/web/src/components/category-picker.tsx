"use client";

import { useMemo, useState } from "react";
import {
  Baby,
  Car,
  Check,
  ChevronRight,
  Dumbbell,
  Hammer,
  Home,
  Laptop,
  Layers,
  Plug,
  Search,
  Shirt,
  Smartphone,
  Sparkles,
  Tv,
  X,
  type LucideIcon,
} from "lucide-react";
import { CATEGORY_TREE } from "@mdw/shared";
import { cx } from "./ui";

const ICONS: Record<string, LucideIcon> = {
  smartphone: Smartphone,
  tv: Tv,
  laptop: Laptop,
  plug: Plug,
  home: Home,
  sparkles: Sparkles,
  shirt: Shirt,
  dumbbell: Dumbbell,
  baby: Baby,
  car: Car,
  hammer: Hammer,
};

/**
 * A visual browser for Marjane Mall's departments: pick a rayon, then a
 * subcategory, with no URL to paste. Selected paths bubble up via onChange.
 */
export function CategoryPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [deptPath, setDeptPath] = useState(CATEGORY_TREE[0]!.path);
  const [q, setQ] = useState("");

  const selected = new Set(value);
  const toggle = (path: string) => onChange(selected.has(path) ? value.filter((p) => p !== path) : [...value, path]);

  const dept = CATEGORY_TREE.find((d) => d.path === deptPath) ?? CATEGORY_TREE[0]!;

  // Flat label lookup so selected chips read nicely even for manual paths.
  const labelOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of CATEGORY_TREE) {
      m.set(d.path, d.label);
      for (const c of d.children) m.set(c.path, `${d.label} › ${c.label}`);
    }
    return m;
  }, []);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return null;
    const out: { path: string; label: string }[] = [];
    for (const d of CATEGORY_TREE) {
      if (d.label.toLowerCase().includes(term)) out.push({ path: d.path, label: d.label });
      for (const c of d.children) if (`${d.label} ${c.label}`.toLowerCase().includes(term)) out.push({ path: c.path, label: `${d.label} › ${c.label}` });
    }
    return out;
  }, [q]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-tag"
        >
          <Layers className="h-4 w-4" aria-hidden /> Parcourir les rayons
        </button>
        {value.length === 0 && <span className="text-xs text-ink-mute">Aucun rayon choisi pour l&apos;instant.</span>}
      </div>

      {value.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {value.map((path) => (
            <span key={path} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-tag-soft py-1 pl-3 pr-1.5 text-sm font-medium text-ink ring-1 ring-tag-deep/30">
              <span className="truncate">{labelOf.get(path) ?? path}</span>
              <button type="button" onClick={() => toggle(path)} className="rounded-full p-0.5 text-ink-soft hover:bg-tag-deep/20 hover:text-ink" aria-label={`Retirer ${path}`}>
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Choisir des rayons">
          <button type="button" className="absolute inset-0 bg-forest/50 backdrop-blur-sm" aria-label="Fermer" onClick={() => setOpen(false)} />
          <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-paper-card shadow-2xl sm:rounded-3xl">
            <header className="flex items-center justify-between gap-3 border-b border-paper-line px-5 py-4">
              <div>
                <h2 className="font-display text-xl font-semibold text-ink">Que cherchez-vous&nbsp;?</h2>
                <p className="text-xs text-ink-mute">Choisissez un rayon à surveiller. Vous pouvez en cocher plusieurs.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full p-2 text-ink-soft hover:bg-paper" aria-label="Fermer">
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="border-b border-paper-line px-5 py-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" aria-hidden />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Rechercher un rayon (ex. téléviseur, friteuse, baskets)…"
                  className="block w-full rounded-full border border-paper-line bg-paper py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-mute focus:border-ink focus:outline-none focus:ring-2 focus:ring-tag"
                  aria-label="Rechercher un rayon"
                />
              </div>
            </div>

            {results ? (
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {results.length === 0 ? (
                  <p className="py-8 text-center text-sm text-ink-mute">Aucun rayon ne correspond. Essayez un autre mot.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {results.map((r) => (
                      <SubTile key={r.path} label={r.label} active={selected.has(r.path)} onClick={() => toggle(r.path)} />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="grid min-h-0 flex-1 grid-cols-[9.5rem_1fr] sm:grid-cols-[13rem_1fr]">
                {/* Departments */}
                <nav className="overflow-y-auto border-r border-paper-line bg-paper py-2" aria-label="Rayons">
                  {CATEGORY_TREE.map((d) => {
                    const Icon = ICONS[d.icon] ?? Layers;
                    const on = d.path === deptPath;
                    const picked = selected.has(d.path) || d.children.some((c) => selected.has(c.path));
                    return (
                      <button
                        key={d.path}
                        type="button"
                        onClick={() => setDeptPath(d.path)}
                        className={cx(
                          "flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm sm:px-4",
                          on ? "bg-paper-card font-semibold text-ink" : "text-ink-soft hover:bg-paper-card/60",
                        )}
                      >
                        <Icon className={cx("h-[18px] w-[18px] shrink-0", on ? "text-tag-deep" : "text-ink-mute")} aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{d.label}</span>
                        {picked && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-tag-deep" aria-hidden />}
                        {on && <ChevronRight className="h-4 w-4 shrink-0 text-ink-mute" aria-hidden />}
                      </button>
                    );
                  })}
                </nav>

                {/* Subcategories */}
                <div className="overflow-y-auto p-4">
                  <SubTile label={`Tout le rayon « ${dept.label} »`} active={selected.has(dept.path)} onClick={() => toggle(dept.path)} wide />
                  {dept.children.length > 0 ? (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {dept.children.map((c) => (
                        <SubTile key={c.path} label={c.label} active={selected.has(c.path)} onClick={() => toggle(c.path)} />
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-ink-mute">Ce rayon n&apos;a pas de sous-rayon détaillé : surveillez-le en entier.</p>
                  )}
                </div>
              </div>
            )}

            <footer className="flex items-center justify-between gap-3 border-t border-paper-line px-5 py-3">
              <span className="text-sm text-ink-mute">
                {value.length === 0 ? "Rien de sélectionné" : `${value.length} rayon${value.length > 1 ? "s" : ""} sélectionné${value.length > 1 ? "s" : ""}`}
              </span>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700">
                Terminé
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}

function SubTile({ label, active, onClick, wide }: { label: string; active: boolean; onClick: () => void; wide?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-left text-sm transition",
        wide && "w-full",
        active ? "border-tag-deep bg-tag-soft font-semibold text-ink" : "border-paper-line bg-paper-card text-ink-soft hover:border-ink-mute hover:text-ink",
      )}
    >
      <span className="min-w-0 truncate">{label}</span>
      <span className={cx("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border", active ? "border-tag-deep bg-tag-deep text-white" : "border-paper-line text-transparent")}>
        <Check className="h-3.5 w-3.5" aria-hidden />
      </span>
    </button>
  );
}
