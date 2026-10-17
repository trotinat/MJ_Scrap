import Link from "next/link";
import { RetailerLink } from "./retailer-link";
import { ShareButton } from "./share-button";
import { CheckCheck, TrendingDown } from "lucide-react";
import { DEAL_CLASS_LABELS, deriveGallery, type DealClass, type Highlight } from "@mdw/shared";
import { cx, StockBadge } from "./ui";
import { ProductGallery } from "./product-gallery";
import { formatMad } from "@/lib/format";

export interface DealCardData {
  offerId: string;
  shopName?: string;
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
  stockStatus?: string;
  score?: number;
  dealClass?: DealClass;
  /** Profile / promo badges computed upstream from the shopper profile. */
  highlights?: Highlight[];
  observedAt?: Date | string | null;
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
  const host = new URL(d.url).hostname.replace(/^www\./, "");
  const source = d.shopName ?? (host === "marjanemall.ma" ? "Marjane Mall" : host);
  return (
    <article
      className={cx(
        "group relative flex flex-col overflow-hidden rounded-[1.35rem] border bg-paper-card card-soft transition-transform duration-200 hover:-translate-y-0.5",
        d.matches?.length ? "border-brand-100" : "border-paper-line hover:border-brand-100",
        big && "sm:flex-row",
        d.status && d.status !== "active" && "opacity-60",
      )}
    >
      <Link
        href={`/produits/${d.offerId}`}
        className={cx("relative block bg-[#F7F8FC] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600", big && "sm:w-1/2 sm:shrink-0")}
        aria-label={d.title}
      >
        <ProductGallery images={gallery} className={cx("w-full", big ? "aspect-[4/3] sm:aspect-[5/4]" : "aspect-[5/4]")} />
        {d.discountPct !== null && d.discountPct > 0 && (
          <span
            className="num absolute left-2 top-2 rounded-lg bg-white/95 px-2 py-1 text-xs font-extrabold text-promo shadow-sm"
            title={`Remise annoncée par ${source}`}
          >
            -{Math.round(d.discountPct)}% <span className="text-[9px] font-semibold">annoncés</span>
          </span>
        )}
        {Boolean(d.matches?.length) && (
          <span className="absolute right-2 top-2 flex items-center gap-1 rounded-lg bg-brand-600 px-2 py-1 text-[10px] font-bold text-white shadow-sm">
            <CheckCheck className="h-3 w-3" /> Pour vous
          </span>
        )}
        {f.lowest && (
          <span className="absolute bottom-2 left-2 rounded-lg bg-proof px-2 py-1 text-[10px] font-bold text-white">Prix le plus bas relevé</span>
        )}
      </Link>

      <div className={cx("flex min-w-0 flex-1 flex-col gap-2", big ? "p-5 sm:p-6" : "p-3.5")}>
        <div className="flex min-w-0 items-center justify-between gap-2"><p className="truncate text-[11px] font-semibold text-ink-mute">{source}</p>{d.stockStatus && <StockBadge stock={d.stockStatus} />}</div>
        {d.score !== undefined && d.dealClass && (
          <p className={cx("text-[11px] font-bold", d.dealClass === "ordinary" ? "text-ink-mute" : "text-brand-700")}>
            {DEAL_CLASS_LABELS[d.dealClass]} · {d.score}/100
          </p>
        )}
        {profileTags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {profileTags.slice(0, 3).map((h) => (
              <span key={h.label} className="rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
                {h.label}
              </span>
            ))}
          </div>
        )}
        {d.brand && <p className="truncate text-[11px] font-extrabold uppercase tracking-[.12em] text-brand-600">{d.brand}</p>}
        <Link href={`/produits/${d.offerId}`} className={cx("font-semibold leading-snug text-ink hover:underline", big ? "line-clamp-3 font-display text-xl font-extrabold" : "line-clamp-2 min-h-[2.5rem] text-sm")}>
          {d.title}
        </Link>

        <div className="mt-auto flex flex-wrap items-end gap-x-2 gap-y-1 border-t border-paper-line pt-3">
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
            {f.saving && <p className="text-ink-mute">{shortMad(f.saving)} DH sous le prix barré annoncé</p>}
            {f.dropped && (
              <p className="font-semibold text-proof" title="Calculé sur nos propres relevés de prix">
                <TrendingDown className="mr-1 inline h-3.5 w-3.5" /> -{f.dropPct}% mesurés depuis le dernier relevé
              </p>
            )}
          </div>
        )}

        <p className="text-[11px] text-ink-mute">Article seul · hors livraison</p>
        {!f.dropped && <p className="text-[11px] text-ink-mute">{d.previousPriceCents === null ? 'Premier relevé · baisse non vérifiée' : d.priceCents === d.previousPriceCents ? 'Prix stable' : 'Prix en hausse'}{d.observedAt && ` · ${new Date(d.observedAt).toLocaleDateString('fr-FR', {day:'numeric', month:'short'})}`}</p>}
        {f.dropped && d.observedAt && <p className="text-[11px] text-ink-mute">Relevé le {new Date(d.observedAt).toLocaleDateString('fr-FR', {day:'numeric', month:'short'})}</p>}

        {d.matches && d.matches.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {d.matches.slice(0, 1).map((m) => (
            <span key={m.id} className="max-w-full truncate rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700" title={m.name}>
                {m.name}
              </span>
            ))}
            {d.matches.length > 1 && <span className="text-[11px] text-ink-mute">+{d.matches.length - 1}</span>}
          </div>
        )}

        {compareForm && (
          <label className="inline-flex items-center gap-1.5 text-xs text-ink-mute">
            <input type="checkbox" name="ids" value={d.offerId} form={compareForm} className="h-3.5 w-3.5 rounded border-paper-line accent-ink" /> Comparer
          </label>
        )}
        <div className="flex items-center gap-2">
          <RetailerLink url={d.url} className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white hover:bg-brand-700" />
          <ShareButton url={d.url} title={d.title} label="" className="shrink-0 rounded-xl px-2.5 py-2" />
        </div>
      </div>
    </article>
  );
}

export const dealGrid = "deal-grid grid grid-cols-1 gap-3 min-[390px]:grid-cols-2 sm:gap-4 md:grid-cols-3 xl:grid-cols-4";
