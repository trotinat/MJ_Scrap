import Link from "next/link";
import { z } from "zod";
import { GitCompare } from "lucide-react";
import { specAttribute, type NormalizedSpecs } from "@mdw/shared";
import { btn, EmptyState, PageHeader, ProductImage, StockBadge } from "@/components/ui";
import { offersForCompare } from "@/lib/queries";
import { formatMad, formatMoroccoTime } from "@/lib/format";

export const metadata = { title: "Comparaison" };

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ ids?: string | string[] }> }) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.ids) ? sp.ids : sp.ids ? [sp.ids] : [];
  const ids = raw.filter((id) => z.string().uuid().safeParse(id).success).slice(0, 4);
  const items = await offersForCompare(ids);

  if (items.length < 2) {
    return (
      <>
        <PageHeader title="Comparaison" />
        <EmptyState icon={GitCompare} title="Sélectionnez au moins deux offres">
          <Link href="/promotions" className={`${btn.secondary} mt-3`}>
            Retour aux promotions
          </Link>
        </EmptyState>
      </>
    );
  }

  const specKeys = [...new Set(items.flatMap((i) => Object.keys(i.product.specs ?? {})))];
  const rawKeys = [...new Set(items.flatMap((i) => Object.keys(i.product.rawSpecs ?? {})))].slice(0, 25);
  const cheapest = Math.min(...items.map((i) => i.offer.currentPriceCents ?? Infinity));

  const row = (label: string, render: (i: (typeof items)[number]) => React.ReactNode) => (
    <tr key={label}>
      <th className="sticky left-0 bg-white text-left">{label}</th>
      {items.map((i) => (
        <td key={i.offer.id}>{render(i)}</td>
      ))}
    </tr>
  );

  return (
    <>
      <PageHeader title="Comparaison" description="Comparaison côte à côte des offres sélectionnées." />
      <div className="overflow-x-auto rounded-2xl border border-paper-line bg-paper-card">
        <table className="data">
          <thead>
            <tr>
              <th className="sticky left-0 bg-white" />
              {items.map((i) => (
                <th key={i.offer.id} className="min-w-[14rem] normal-case">
                  <ProductImage src={i.product.imageUrl} alt={i.offer.title} className="mb-2 h-28 w-full rounded-lg" />
                  <Link href={`/produits/${i.offer.id}`} className="line-clamp-3 text-sm font-semibold tracking-normal text-ink hover:text-ink">
                    {i.offer.title}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {row("Prix", (i) => (
              <span className={i.offer.currentPriceCents === cheapest ? "font-bold text-ink" : "font-semibold"}>{formatMad(i.offer.currentPriceCents)}</span>
            ))}
            {row("Prix barré annoncé", (i) => formatMad(i.offer.originalPriceCents))}
            {row("Remise annoncée", (i) => (i.offer.advertisedDiscountPct !== null ? `-${i.offer.advertisedDiscountPct} %` : "—"))}
            {row("Plus bas observé", (i) => formatMad(i.offer.minPriceCents))}
            {row("Marque", (i) => i.product.brand ?? "—")}
            {row("Référence", (i) => i.product.modelRef ?? "—")}
            {row("Vendeur", (i) => i.offer.seller ?? "—")}
            {row("Disponibilité", (i) => <StockBadge stock={i.offer.stockStatus} />)}
            {row("Dernier relevé", (i) => formatMoroccoTime(i.offer.lastSuccessAt))}
            {specKeys.map((k) =>
              row(specAttribute(k)?.label ?? k, (i) => {
                const v = (i.product.specs as NormalizedSpecs)[k as keyof NormalizedSpecs];
                return v === undefined ? "—" : String(v === true ? "Oui" : v);
              }),
            )}
            {rawKeys.map((k) => row(k, (i) => i.product.rawSpecs?.[k] ?? "—"))}
          </tbody>
        </table>
      </div>
    </>
  );
}
