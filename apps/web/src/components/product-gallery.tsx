"use client";

import { useState } from "react";
import { ShoppingBag } from 'lucide-react';
import { cx } from "./ui";

/**
 * Shows the product image and, on hover, cross-fades to a second one derived
 * from Marjane's `_imgN` URL pattern. Derived images that 404 are dropped via
 * onError, so a product with a single photo simply never reveals a second.
 */
export function ProductGallery({ images, className }: { images: string[]; className?: string }) {
  const [alt, setAlt] = useState<string | null>(images[1] ?? null);
  const primary = images[0] ?? null;
  const [failed, setFailed] = useState<string | null>(null);

  if (!primary || failed === primary) {
    return <div className={cx("flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-paper to-tag-soft/50 text-xs text-ink-mute", className)}><ShoppingBag className="h-12 w-12 stroke-1 opacity-40" /><span>Visuel non disponible</span></div>;
  }
  return (
    <div className={cx("relative overflow-hidden bg-white", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={primary} alt="" loading="lazy" onError={() => setFailed(primary)} referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-contain p-5 transition-transform duration-300 group-hover:scale-[1.04]" />
      {alt && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={alt}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setAlt(null)}
          className="absolute inset-0 h-full w-full object-contain p-4 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        />
      )}
      {alt && (
        <span className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-ink/70 px-1.5 py-0.5 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
          <span className="h-1.5 w-1.5 rounded-full bg-white/70" /> photos
        </span>
      )}
    </div>
  );
}
