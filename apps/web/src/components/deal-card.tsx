import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { deriveGallery, type Highlight } from "@mdw/shared";
import { cx } from "./ui";
import { ProductGallery } from "./product-gallery";
import { formatMad } from "@/lib/format";

export interface DealCardData {
  offerId: string;
  title: string;
  url: string;
  imageUrl: string | null;
  brand: string | null;
  priceCents: number;
  originalPriceCents: number | null;
  discountPct: number | null;
  previousPriceCents: number | null;
  minPriceCents: number | null;
  firstSeenAt: Date | string | null;
  matches?: { id: string; name: string }[];
  status?: string;
  /** Profile / promo badges computed upstream from the shopper profile. */
  highlights?: Highlight[];
}

const DAY = 24 * 3600_000;

/** Facts we can prove from our own readings (never from the site's claims). */
export function dealFacts(d: DealCardData, now = Date.now()) {
  const saving = d.originalPriceCents && d.originalPriceCents > d.priceCents ? d.originalPriceCents - d.priceCents : null;
  const dropped = d.previousPriceCents !== null && d.priceCents < d.previousPriceCents;
  const lowest = dropped && d.minPriceCents !== null && d.priceCents <= d.minPriceCents;
  const isNew = d.firstSeenAt ? now - new Date(d.firstSeenAt).getTime() < DAY : false;
  const dropPct = dropped ? Math.round(((d.previousPriceCents! - d.priceCents) / d.previousPriceCents!) * 100) : null;
  return { saving, dropped, lowest, isNew, dropPct };
}

/** Amount without decimals when they are zero: "349 DH", "49,90 DH". */
function shortMad(cents: number): string {
  return formatMad(cents).replace(",00", "").replace(/\s?MAD$/, "");
}

export function DealCard({ d, size = "md", compareForm }: { d: DealCardData; size?: "md" | "lg"; compareForm?: string }) {
  const f = dealFacts(d);
  const big = size === "lg";
  const gallery = deriveGallery(d.imageUrl, 2);
  const profileTags = (d.highlights ?? []).filter((h) => h.tone === "profile");
  return (
    <article
      className={cx(
        "group relative flex flex-col overflow-hidden rounded-2xl border bg-paper-card card-soft transition duration-200 hover:-translate-y-1",
        profileTags.length > 0 ? "border-tag-deep/60 ring-1 ring-tag-deep/30" : "border-paper-line hover:border-tag-deep/40",
        big && "sm:flex-row",
        d.status && d.status !== "active" && "opacity-60",
      )}
    >
      <Link
        href={`/produits/${d.offerId}`}
        className={cx("relative block bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-tag-deep", big && "sm:w-1/2 sm:shrink-0")}
        aria-label={d.title}
      >
        <ProductGallery images={gallery} className={cx("w-full", big ? "aspect-[4/3] sm:aspect-square" : "aspect-square")} />
        {d.discountPct !== null && d.discountPct > 0 && (
          <span
            className="num absolute left-2 top-2 rounded-lg bg-promo px-2 py-1 font-display text-sm font-extrabold text-white shadow-sm"
            title="Remise annoncée par Marjane Mall"
          >
            -{Math.round(d.discountPct)}%
          </span>
        )}
        {profileTags.length > 0 && (
          <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-tag px-2 py-0.5 text-[11px] font-bold text-forest shadow-sm">
            ★ Pour vous
          </span>
        )}
        {f.lowest && (
          <span className="absolute bottom-2 left-2 rounded-full bg-proof px-2 py-0.5 text-xs font-semibold text-white">Prix le plus bas relevé</span>
        )}
      </Link>

      <div className={cx("flex min-w-0 flex-1 flex-col gap-2", big ? "p-4 sm:p-5" : "p-3")}>
        {profileTags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {profileTags.slice(0, 3).map((h) => (
              <span key={h.label} className="rounded-full bg-tag-soft px-2 py-0.5 text-[11px] font-semibold text-ink ring-1 ring-tag-deep/30">
                {h.label}
              </span>
            ))}
          </div>
        )}
        {d.brand && <p className="truncate text-xs font-medium text-ink-mute">{d.brand}</p>}
        <Link href={`/produits/${d.offerId}`} className={cx("font-medium leading-snug text-ink hover:underline", big ? "line-clamp-3 font-display text-xl font-semibold" : "line-clamp-2 min-h-[2.5rem] text-sm font-semibold")}>
          {d.title}
        </Link>

        <div className="mt-auto flex flex-wrap items-end gap-x-2 gap-y-1 pt-1">
          <span className={cx("price-tag num font-extrabold", big ? "text-3xl" : "text-xl")}>
            {shortMad(d.priceCents)}
            <span className="text-xs font-bold">DH</span>
          </span>
          {d.originalPriceCents && d.originalPriceCents > d.priceCents && (
            <span className="num text-sm text-ink-mute line-through">{shortMad(d.originalPriceCents)} DH</span>
          )}
        </div>

        {(f.saving || f.dropped) && (
          <div className="num space-y-0.5 text-xs">
            {f.saving && <p className="font-semibold text-proof">Vous économisez {shortMad(f.saving)} DH</p>}
            {f.dropped && (
              <p className="font-semibold text-proof" title="Calculé sur nos propres relevés de prix">
                -{f.dropPct}% depuis le dernier relevé
              </p>
            )}
          </div>
        )}

        {d.matches && d.matches.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {d.matches.slice(0, 2).map((m) => (
              <span key={m.id} className="max-w-full truncate rounded-full bg-tag-soft px-2 py-0.5 text-[11px] font-medium text-ink" title={m.name}>
                {m.name}
              </span>
            ))}
            {d.matches.length > 2 && <span className="text-[11px] text-ink-mute">+{d.matches.length - 2}</span>}
          </div>
        )}

        {compareForm && (
          <label className="inline-flex items-center gap-1.5 text-xs text-ink-mute">
            <input type="checkbox" name="ids" value={d.offerId} form={compareForm} className="h-3.5 w-3.5 rounded border-paper-line accent-ink" /> Comparer
          </label>
        )}
        <a
          href={d.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="mt-2 inline-flex items-center justify-center gap-1 rounded-full border border-paper-line px-3 py-1.5 text-xs font-semibold text-ink hover:border-ink hover:bg-ink hover:text-white"
        >
          Voir l'offre <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </a>
      </div>
    </article>
  );
}

export const dealGrid = "grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4";
