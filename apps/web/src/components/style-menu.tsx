"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { EyeOff, Undo2 } from "lucide-react";
import type { HiddenStyle } from "@mdw/shared";
import { hideStyleAction, showStyleAction } from "@/app/(app)/style-actions";

// The hidden card leaves the page, so the undo notice lives outside it and is told through this channel.
const listeners = new Set<(style: HiddenStyle | null) => void>();
const announce = (style: HiddenStyle | null) => listeners.forEach((l) => l(style));

const describe = (s: HiddenStyle) => (s.kind === "product" ? "ce produit" : s.label.charAt(0).toLowerCase() + s.label.slice(1));

/** "Pas mon style" button for an Urban Jungle card: the shopper picks how broadly to hide. */
export function StyleMenu({ styles, title }: { styles: HiddenStyle[]; title: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  if (!styles.length) return null;
  const hide = (style: HiddenStyle) => start(async () => {
    const result = await hideStyleAction(style);
    setOpen(false);
    if (result.ok) announce(style);
  });
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)} disabled={pending} aria-haspopup="menu" aria-expanded={open} aria-label={`Pas mon style : ${title}`} title="Pas mon style"
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-paper-line bg-paper px-2.5 text-ink-mute transition-colors hover:border-brand-300 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-tag disabled:opacity-50">
        <EyeOff className="h-4 w-4" aria-hidden />
      </button>
      {open && (
        <div role="menu" aria-label="Pas mon style" className="absolute right-0 top-12 z-30 w-72 rounded-2xl border border-paper-line bg-paper-card p-2 shadow-lg">
          <p className="px-3 pb-1 pt-1 text-xs font-semibold text-ink-mute">Pas mon style · ne plus voir chez Urban Jungle :</p>
          {styles.map((s) => (
            <button key={`${s.kind}:${s.value}`} type="button" role="menuitem" onClick={() => hide(s)} disabled={pending}
              className="block min-h-11 w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-ink hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-tag disabled:opacity-50">
              {s.kind === "product" ? "Ce produit uniquement" : s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Mounted once per page: confirms what was hidden and offers to undo it. */
export function StyleUndoNotice() {
  const [style, setStyle] = useState<HiddenStyle | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    listeners.add(setStyle);
    return () => { listeners.delete(setStyle); };
  }, []);
  useEffect(() => {
    if (!style) return;
    const timer = setTimeout(() => setStyle(null), 8000);
    return () => clearTimeout(timer);
  }, [style]);
  if (!style) return null;
  return (
    <div role="status" aria-live="polite" className="fixed inset-x-4 bottom-24 z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-sm text-white shadow-xl sm:bottom-6">
      <span className="flex-1">Masqué chez Urban Jungle : {describe(style)}. <Link href="/profil#styles-masques" className="whitespace-nowrap font-semibold underline">Voir la liste</Link></span>
      <button type="button" disabled={pending} onClick={() => start(async () => { await showStyleAction(style); setStyle(null); })}
        className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-white/15 px-3 font-semibold hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-tag disabled:opacity-50">
        <Undo2 className="h-4 w-4" aria-hidden /> Annuler
      </button>
    </div>
  );
}
