"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";
import { cx } from "./ui";

/**
 * Shares a public Marjane offer link with a friend. Uses the native share
 * sheet (iOS/Android: WhatsApp, Messages…) when available, else copies the
 * link to the clipboard. Never shares the private dashboard URL.
 */
export function ShareButton({ url, title, label, className }: { url: string; title?: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function share(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const data = { title: title ?? "Bon plan Marjane Mall", text: title, url };
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share(data);
        return;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      // A failed share can still fall back to copying the link.
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked (no HTTPS / permissions): nothing more we can do
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      aria-label={copied ? "Lien copié" : "Partager ce bon plan"}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-full border border-paper-line px-3 py-1.5 text-xs font-semibold text-ink hover:border-ink hover:bg-ink hover:text-white",
        className,
      )}
    >
      {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Share2 className="h-3.5 w-3.5" aria-hidden />}
      {label ?? (copied ? "Lien copié" : "Partager")}
    </button>
  );
}
