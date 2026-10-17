"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronRight, Layers, Search, X } from "lucide-react";
import { CATEGORY_CATALOG, CATEGORY_CATALOG_PATH_COUNT, type CatalogNode } from "@mdw/shared";
import { cx } from "./ui";

type Entry = { node: CatalogNode; trail: string[] };
const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const flatten = (nodes: CatalogNode[], trail: string[] = []): Entry[] =>
  nodes.flatMap(node => [{ node, trail: [...trail, node.label] }, ...flatten(node.children, [...trail, node.label])]);

export function CategoryPicker({ value, onChange }: { value: string[]; onChange: (paths: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [limitMessage, setLimitMessage] = useState("");
  const openerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const all = useMemo(() => flatten(CATEGORY_CATALOG), []);
  const byPath = useMemo(() => new Map(all.map(entry => [entry.node.path, entry])), [all]);
  const current = currentPath ? byPath.get(currentPath) : null;
  const selected = new Set(value);
  const level = current?.node.children ?? CATEGORY_CATALOG;
  const matches = useMemo(() => {
    const term = normalize(query.trim());
    return term ? all.filter(({ node, trail }) => normalize(`${trail.join(" ")} ${node.path}`).includes(term)) : [];
  }, [all, query]);
  useEffect(() => { if (open) searchRef.current?.focus(); }, [open]);

  const close = () => { setOpen(false); requestAnimationFrame(() => openerRef.current?.focus()); };
  const toggle = (path: string) => {
    setLimitMessage("");
    if (selected.has(path)) onChange(value.filter(item => item !== path));
    else if (value.length >= 10) setLimitMessage("Vous pouvez surveiller 10 rayons au maximum par recherche.");
    else onChange([...value, path]);
  };
  const back = () => {
    if (!currentPath) return;
    const parent = currentPath.slice(0, currentPath.lastIndexOf("/"));
    setCurrentPath(byPath.has(parent) ? parent : null);
  };
  const row = ({ node, trail }: Entry, search = false) => {
    const hasChildren = node.children.length > 0;
    const label = search ? trail.join(" › ") : node.label;
    const pickedBelow = value.some(path => path.startsWith(`${node.path}/`));
    return <div key={`${search ? "search" : "browse"}-${node.path}`} className="flex min-h-12 items-stretch overflow-hidden rounded-xl border border-paper-line bg-paper-card">
      <button type="button" onClick={() => hasChildren ? (setCurrentPath(node.path), setQuery("")) : node.selectable && toggle(node.path)}
        className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-[0.95rem] text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500">
        <span className="min-w-0 flex-1"><span className="block break-words font-medium">{label}</span>
          {hasChildren && <span className="block text-xs text-ink-mute">{node.children.length} sous-rayons{pickedBelow ? " · sélection en dessous" : ""}</span>}
        </span>
        {hasChildren ? <ChevronRight className="h-4 w-4 shrink-0 text-ink-mute" aria-hidden /> : selected.has(node.path) ? <Check className="h-4 w-4 shrink-0 text-proof" aria-hidden /> : null}
      </button>
      {hasChildren && node.selectable && <button type="button" onClick={() => toggle(node.path)} aria-label={`${selected.has(node.path) ? "Retirer" : "Surveiller"} ${label}`}
        aria-pressed={selected.has(node.path)} className={cx("flex w-12 shrink-0 items-center justify-center border-l border-paper-line focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500", selected.has(node.path) ? "bg-tag-soft text-ink" : "text-ink-mute")}>
        <span className={cx("flex h-5 w-5 items-center justify-center rounded-full border", selected.has(node.path) ? "border-tag-deep bg-tag-deep text-white" : "border-paper-line")}><Check className="h-3.5 w-3.5" aria-hidden /></span>
      </button>}
    </div>;
  };

  return <div>
    <div className="flex flex-wrap items-center gap-2">
      <button ref={openerRef} type="button" onClick={() => { setCurrentPath(null); setQuery(""); setOpen(true); }} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-tag">
        <Layers className="h-4 w-4" aria-hidden /> Parcourir les rayons
      </button>
      {value.length === 0 && <span className="text-xs text-ink-mute">Aucun rayon choisi pour l&apos;instant.</span>}
    </div>
    {value.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{value.map(path =>
      <span key={path} className="inline-flex max-w-full items-center gap-1 rounded-full bg-tag-soft py-1 pl-3 pr-1 text-sm font-medium text-ink ring-1 ring-tag-deep/30">
        <span className="truncate">{byPath.get(path)?.trail.join(" › ") ?? path}</span>
        <button type="button" onClick={() => toggle(path)} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-tag-deep/20" aria-label={`Retirer ${byPath.get(path)?.node.label ?? path}`}><X className="h-4 w-4" /></button>
      </span>)}</div>}
    {open && <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="presentation">
      <button type="button" className="absolute inset-0 bg-forest/50 backdrop-blur-sm" aria-label="Fermer" onClick={close} />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Choisir des rayons" onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); close(); }
        if (event.key !== "Tab") return;
        const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])') ?? [])];
        if (!focusable.length) return;
        if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0]?.focus(); }
      }} className="relative flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-paper-card shadow-2xl sm:rounded-3xl">
        <header className="flex items-start justify-between gap-3 border-b border-paper-line px-4 py-4 sm:px-5">
          <div><h2 className="font-display text-xl font-semibold text-ink">Choisir un rayon</h2><p className="text-xs text-ink-mute">Parcourez tous les niveaux ou cherchez un nom.</p></div>
          <button type="button" onClick={close} className="flex h-11 w-11 items-center justify-center rounded-full text-ink-soft hover:bg-paper" aria-label="Fermer"><X className="h-5 w-5" /></button>
        </header>
        <div className="border-b border-paper-line px-4 py-3 sm:px-5"><div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" aria-hidden />
          <input ref={searchRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="Ex. casquettes, robot, pneus…" aria-label="Rechercher un rayon"
            className="block min-h-11 w-full rounded-full border border-paper-line bg-paper py-2 pl-9 pr-3 text-base text-ink placeholder:text-ink-mute focus:border-ink focus:outline-none focus:ring-2 focus:ring-tag" />
        </div></div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">
          {query.trim() ? <>
            <p className="mb-3 text-xs text-ink-mute">{matches.length} rayon{matches.length > 1 ? "s" : ""} trouvé{matches.length > 1 ? "s" : ""}{matches.length > 80 ? " · affinez votre recherche" : ""}</p>
            <div className="space-y-2">{matches.slice(0, 80).map(entry => row(entry, true))}</div>
          </> : <>
            {current && <button type="button" onClick={back} className="mb-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-ink"><ArrowLeft className="h-4 w-4" /> Retour</button>}
            <p className="mb-3 text-sm font-semibold text-ink">{current?.trail.join(" › ") ?? "Tous les rayons"}</p>
            {current?.node.selectable && <button type="button" aria-pressed={selected.has(current.node.path)} onClick={() => toggle(current.node.path)} className={cx("mb-3 flex min-h-11 w-full items-center gap-2 rounded-xl border px-3 text-left text-sm font-semibold", selected.has(current.node.path) ? "border-tag-deep bg-tag-soft text-ink" : "border-paper-line bg-paper text-ink")}><Check className="h-4 w-4" /> Surveiller tout ce rayon</button>}
            <div className="space-y-2">{level.map(node => row({ node, trail: byPath.get(node.path)?.trail ?? [node.label] }))}</div>
            {level.length === 0 && <p className="text-sm text-ink-mute">Aucun sous-rayon supplémentaire.</p>}
          </>}
        </div>
        <footer className="flex items-center justify-between gap-3 border-t border-paper-line px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
          <span role="status" className="text-xs text-ink-mute">{limitMessage || `${value.length}/10 sélectionné${value.length > 1 ? "s" : ""} · ${CATEGORY_CATALOG_PATH_COUNT} chemins du site`}</span>
          <button type="button" onClick={close} className="min-h-11 rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700">Terminé</button>
        </footer>
      </div>
    </div>}
  </div>;
}
