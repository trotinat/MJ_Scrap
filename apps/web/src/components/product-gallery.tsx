"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, ShoppingBag } from "lucide-react";
import { cx } from "./ui";

/** Touch, keyboard and pointer controls for exact images collected from a shop. */
export function ProductGallery({ images, className, alt = "" }: { images: string[]; className?: string; alt?: string }) {
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);
  const available = [...new Set(images.filter((image) => image && !failed.includes(image)))];
  const currentIndex = Math.min(index, Math.max(available.length - 1, 0));
  const current = available[currentIndex];
  const change = (direction: -1 | 1) => setIndex((currentIndex + direction + available.length) % available.length);

  if (!current) {
    return <div className={cx("flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-paper to-tag-soft/50 text-xs text-ink-mute", className)}><ShoppingBag className="h-8 w-8 stroke-1 opacity-40" aria-hidden="true" /><span>Visuel non disponible</span></div>;
  }

  return (
    <div className={cx("group relative isolate overflow-hidden bg-white", className)} role="group" aria-label="Photos du produit">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img key={current} src={current} alt={alt} width={640} height={640} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed((previous) => [...previous, current])} className="absolute inset-0 h-full w-full object-contain p-4" />
      {available.length > 1 && <>
        <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-1 text-xs font-semibold text-ink shadow-sm" aria-live="polite">{currentIndex + 1}/{available.length}</span>
        <button type="button" aria-label="Photo précédente" onClick={() => change(-1)} className="absolute bottom-2 left-2 inline-flex h-11 w-11 touch-manipulation items-center justify-center rounded-full bg-white/95 text-ink shadow-md hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600" style={{ WebkitTapHighlightColor: "transparent" }}>
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <button type="button" aria-label="Photo suivante" onClick={() => change(1)} className="absolute bottom-2 right-2 inline-flex h-11 w-11 touch-manipulation items-center justify-center rounded-full bg-white/95 text-ink shadow-md hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600" style={{ WebkitTapHighlightColor: "transparent" }}>
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </>}
    </div>
  );
}
