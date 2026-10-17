import Link from "next/link";
import { ArrowDownWideNarrow, ArrowRight, Search, Store } from "lucide-react";
import { DealCard, dealGrid } from "@/components/deal-card";
import { EmptyState, PageHeader, btn, input } from "@/components/ui";
import { shopDiscovery } from "@/lib/queries";
import { relativeTime } from "@/lib/format";

export const metadata = { title: "Toutes les boutiques · Hawta" };

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => Array.isArray(v) ? v[0] : v;

export default async function ShopsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const shopId = one(params.shop);
  const q = one(params.q)?.trim() ?? "";
  const sortValue = one(params.sort);
  const sort = sortValue === "recent" || sortValue === "price" ? sortValue : "best";
  const pageValue = Number(one(params.page) ?? 1);
  const data = await shopDiscovery({ shopId, q, sort, page: Number.isFinite(pageValue) ? pageValue : 1 });
  const selectedShop = data.shops.find((s) => s.shop_id === shopId);
  const totalFresh = data.shops.reduce((n, s) => n + Number(s.fresh), 0);
  const paramsFor = (nextShop?: string) => {
    const p = new URLSearchParams();
    if (nextShop) p.set("shop", nextShop);
    if (q) p.set("q", q);
    if (sort !== "best") p.set("sort", sort);
    return `/boutiques${p.size ? `?${p}` : ""}`;
  };

  return <>
    <section className="mb-6 overflow-hidden rounded-[1.7rem] bg-ink p-5 text-white sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-xl">
          <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-tag"><Store className="h-4 w-4" /> Le marché Hawta</p>
          <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Toutes vos boutiques,<br className="hidden sm:block" /> un seul bon choix.</h1>
          <p className="mt-3 text-sm leading-6 text-white/75">Parcourez les produits collectés dans vos boutiques. Les baisses mesurées restent séparées des remises annoncées.</p>
        </div>
        <div className="grid min-w-[190px] grid-cols-2 gap-2">
          <div className="rounded-2xl bg-white/10 p-3"><p className="text-xs text-white/65">Boutiques</p><p className="mt-1 text-2xl font-extrabold">{data.shops.length}</p></div>
          <div className="rounded-2xl bg-white/10 p-3"><p className="text-xs text-white/65">Offres fraîches</p><p className="mt-1 text-2xl font-extrabold">{totalFresh.toLocaleString("fr-FR")}</p></div>
        </div>
      </div>
    </section>

    {data.shops.length > 0 && <section aria-label="Boutiques disponibles" className="mb-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold">Vos boutiques</h2>
        {shopId && <Link href={paramsFor()} className="text-sm font-semibold text-brand-700">Tout voir</Link>}
      </div>
      <div className="flex snap-x gap-3 overflow-x-auto pb-2">
        <Link href={paramsFor()} aria-current={!shopId ? "page" : undefined} className={`min-w-[190px] snap-start rounded-2xl border p-4 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-tag ${!shopId ? "border-brand-600 bg-brand-50" : "border-paper-line bg-paper-card hover:border-brand-300"}`}>
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink text-tag"><Store className="h-5 w-5" /></span>
          <span className="mt-3 block font-bold">Toutes les boutiques</span>
          <span className="mt-1 block text-xs text-ink-mute">{data.shops.reduce((n, s) => n + Number(s.offers), 0).toLocaleString("fr-FR")} offres suivies</span>
        </Link>
        {data.shops.map((shop) => <Link key={shop.shop_id} href={paramsFor(shop.shop_id)} aria-current={shopId === shop.shop_id ? "page" : undefined} className={`min-w-[190px] snap-start rounded-2xl border p-4 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-tag ${shopId === shop.shop_id ? "border-brand-600 bg-brand-50" : "border-paper-line bg-paper-card hover:border-brand-300"}`}>
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-paper text-brand-700"><Store className="h-5 w-5" /></span>
          <span className="mt-3 block truncate font-bold">{shop.name}</span>
          <span className="mt-1 block text-xs text-ink-mute">{Number(shop.offers).toLocaleString("fr-FR")} offres · {Number(shop.fresh).toLocaleString("fr-FR")} récentes</span>
          <span className="mt-2 block text-[11px] text-ink-mute">Vu {relativeTime(shop.last_seen)}</span>
        </Link>)}
      </div>
    </section>}

    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div><p className="section-eyebrow">CATALOGUE COLLECTÉ</p><h2 className="mt-1 font-display text-2xl font-extrabold">{selectedShop?.name ?? "Les offres du moment"}</h2><p className="mt-1 text-sm text-ink-mute">{data.total.toLocaleString("fr-FR")} offres · chaque carte indique sa boutique source.</p></div>
        <Link href="/criteres/nouveau" className={btn.secondary}>Créer une recherche <ArrowRight className="h-4 w-4" /></Link>
      </div>
      <form method="get" className="mb-5 grid gap-2 rounded-2xl border border-paper-line bg-paper-card p-3 sm:grid-cols-[minmax(0,1fr)_190px_auto]">
        {shopId && <input type="hidden" name="shop" value={shopId} />}
        <label className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" aria-hidden /><input className={`${input} pl-10`} type="search" name="q" defaultValue={q} placeholder="Chercher un produit ou une marque" aria-label="Chercher dans les boutiques" /></label>
        <label className="relative block"><ArrowDownWideNarrow className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" aria-hidden /><select className={`${input} pl-10`} name="sort" defaultValue={sort} aria-label="Trier les offres"><option value="best">Meilleures baisses</option><option value="recent">Plus récentes</option><option value="price">Prix le plus bas</option></select></label>
        <button className={btn.primary} type="submit">Afficher</button>
      </form>

      {data.invalidShop ? <EmptyState icon={Store} title="Cette boutique n’est pas disponible sur votre profil" />
        : data.rows.length ? <>
          <div className={dealGrid}>{data.rows.map((r) => <DealCard key={r.offerId} d={{
            offerId: r.offerId, shopName: r.shopName, title: r.title, url: r.url, imageUrl: r.imageUrl,
            brand: r.brand, priceCents: r.priceCents!, originalPriceCents: r.originalPriceCents,
            discountPct: r.discountPct, previousPriceCents: r.previousPriceCents, minPriceCents: r.minPriceCents,
            firstSeenAt: r.firstSeenAt, observedAt: r.observedAt, status: "active", stockStatus: r.stock,
          }} />)}</div>
          {data.pages > 1 && <nav className="mt-6 flex items-center justify-center gap-3" aria-label="Pagination des offres">
            {data.page > 1 && <Link className={btn.secondary} href={`/boutiques?${new URLSearchParams({ ...(shopId ? { shop: shopId } : {}), ...(q ? { q } : {}), sort, page: String(data.page - 1) })}`}>Précédent</Link>}
            <span className="text-sm text-ink-mute">Page {data.page} / {data.pages}</span>
            {data.page < data.pages && <Link className={btn.secondary} href={`/boutiques?${new URLSearchParams({ ...(shopId ? { shop: shopId } : {}), ...(q ? { q } : {}), sort, page: String(data.page + 1) })}`}>Suivant</Link>}
          </nav>}
        </> : <EmptyState icon={Store} title={data.shops.length ? "Aucune offre pour ces filtres" : "Aucune boutique n’est encore disponible"}>{data.shops.length ? "Essayez un autre nom ou choisissez toutes vos boutiques." : "Les boutiques disponibles apparaîtront ici dès qu’elles seront activées pour votre profil."}</EmptyState>}
    </section>
  </>;
}
