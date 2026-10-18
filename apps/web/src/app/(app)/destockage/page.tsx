import Link from "next/link";
import { PromotionScope } from "@/components/promotion-scope";
import { Sparkles, Tag } from "lucide-react";
import { getDb, getUserSettings } from "@mdw/database";
import { requireUser } from "@/lib/session";
import { DESTOCKAGE_PATHS, profileHighlights, profileIsEmpty, suitsProfile, type ShopperProfile } from "@mdw/shared";
import { CheckNowButton } from "@/components/check-now-button";
import { DealCard, dealGrid, type DealCardData } from "@/components/deal-card";
import { DealResultsGrid } from "@/components/deal-results-grid";
import { btn, cx, EmptyState, input, PageHeader } from "@/components/ui";
import { flashOffers, flashPages, weeklyOffers, type FlashRow, type FlashSort } from "@/lib/queries";
import { relativeTime } from "@/lib/format";

export const metadata = { title: "Déstockage" };

const ALL = "tout";
const labelOf = (p: string) => DESTOCKAGE_PATHS.find((d) => d.path === p)?.label ?? p;
const SORTS: { value: FlashSort; label: string }[] = [
  { value: "discount", label: "Plus forte remise annoncée" },
  { value: "price", label: "Prix le plus bas" },
  { value: "drop", label: "Plus forte baisse observée" },
  { value: "new", label: "Nouveautés sur la page" },
];

function toCard(r: FlashRow, profile: ShopperProfile): DealCardData {
  return {
    offerId: r.offer_id,
    title: r.title,
    url: r.url,
    imageUrl: r.image_url,
    imageUrls: r.image_urls,
    brand: r.brand,
    priceCents: r.current_price_cents,
    originalPriceCents: r.original_price_cents,
    discountPct: r.advertised_discount_pct,
    previousPriceCents: r.previous_price_cents,
    minPriceCents: r.min_price_cents,
    firstSeenAt: r.first_seen_at,
    observedAt:r.last_seen_at,
    matches: r.matches,
    highlights: profileHighlights(
      { rawSpecs: r.raw_specs, categoryPath: r.category_path, brand: r.brand, title: r.title, seller: r.seller, priceCents: r.current_price_cents, discountPct: r.advertised_discount_pct },
      profile,
    ),
  };
}

export default async function DestockagePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [settings, crawled] = await Promise.all([getUserSettings(getDb(), user.id), flashPages()]);
  const profile = settings.shopperProfile;
  const hasProfile = !profileIsEmpty(profile);

  const crawledDestockage = DESTOCKAGE_PATHS.filter((d) => crawled.some((c) => c.path === d.path));
  const current = sp.rayon && crawledDestockage.some((d) => d.path === sp.rayon) ? sp.rayon : ALL;
  const paths = current === ALL ? crawledDestockage.map((d) => d.path) : [current];
  const sort = (SORTS.some((s) => s.value === sp.sort) ? sp.sort : "discount") as FlashSort;
  const scope = sp.scope === "all" ? "all" : "profile";
  const q = sp.q?.trim() || undefined;

  // "Tout le déstockage" aggregates (and de-duplicates) the clearance rayons
  // without the promo-only gate; a single rayon shows exactly that page.
  const rows =
    current === ALL ? await weeklyOffers(paths, { sort, q, scope, requireDeal: false, limit: 300 }) : await flashOffers(current, { sort, q, scope });
  const cards = rows.map((r) => toCard(r, profile));
  const forYou = hasProfile && scope === "profile" ? rows.filter(r => suitsProfile({title:r.title,brand:r.brand,rawSpecs:r.raw_specs,categoryPath:r.category_path,seller:r.seller,priceCents:r.current_price_cents,discountPct:r.advertised_discount_pct},profile)).map(r => toCard(r,profile)) : [];
  const lastCrawl = crawled.filter((c) => paths.includes(c.path)).sort((a, b) => +b.last_success_at - +a.last_success_at)[0];

  const qs = (extra: Record<string, string>) => {
    const u = new URLSearchParams();
    if (current !== ALL) u.set("rayon", current);
    if (sort !== "discount") u.set("sort", sort);
    if (q) u.set("q", q);
    if (scope === "all") u.set("scope", "all");
    for (const [k, v] of Object.entries(extra)) v ? u.set(k, v) : u.delete(k);
    const s = u.toString();
    return `/destockage${s ? `?${s}` : ""}`;
  };

  const chip = (path: string, text: string) => (
    <Link
      key={path}
      href={path === ALL ? qs({ rayon: "" }) : qs({ rayon: path })}
      aria-current={current === path ? "page" : undefined}
      className={cx(
        "rounded-full border px-3.5 py-1.5 text-sm font-medium",
        current === path ? "border-ink bg-ink text-white" : "border-paper-line bg-paper-card text-ink-soft hover:border-ink-mute",
      )}
    >
      {text}
    </Link>
  );

  return (
    <>
      <PageHeader
        title="Déstockage & prix cassés"
        description="Les prix cassés de Marjane Mall, lus directement sur leurs pages déstockage — en dehors de vos recherches. Ce qui correspond à votre profil est mis en avant."
        actions={
          <CheckNowButton />
        }
      />

      <PromotionScope all={scope === "all"} profileHref={qs({scope:""})} allHref={qs({scope:"all"})} />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {chip(ALL, "Tout le déstockage")}
        {crawledDestockage.filter((d) => d.path !== "/destockage").map((d) => chip(d.path, d.label))}
        {lastCrawl && <span className="ml-auto text-xs text-ink-mute">{rows.length} offres · vérifiées {relativeTime(lastCrawl.last_success_at)}</span>}
      </div>

      {crawledDestockage.length > 0 && (
        <form method="get" className="mb-5 flex flex-wrap items-center gap-2">
          {scope === "all" && <input type="hidden" name="scope" value="all" />}
          {current !== ALL && <input type="hidden" name="rayon" value={current} />}
          <input name="q" type="search" defaultValue={q} placeholder="Rechercher dans le déstockage…" className={cx(input, "!w-auto min-w-0 flex-1 basis-40 sm:max-w-xs")} aria-label="Recherche" />
          <select name="sort" defaultValue={sort} className={cx(input, "!w-auto min-w-0 flex-1 basis-40 sm:flex-none")} aria-label="Tri">
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <button type="submit" className={btn.primary}>
            Filtrer
          </button>
        </form>
      )}

      {crawledDestockage.length === 0 ? (
        <EmptyState icon={Tag} title="Déstockage pas encore lu">
          Lancez une vérification : les pages déstockage de Marjane Mall sont lues même sans recherche enregistrée.
        </EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState icon={Tag} title="Aucune offre pour ce rayon" />
      ) : (
        <>
          {forYou.length > 0 && (
            <section className="mb-10">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-tag-deep" aria-hidden />
                <h2 className="font-display text-2xl font-bold tracking-tight">Pour vous</h2>
                <span className="rounded-full bg-tag-soft px-2 py-0.5 text-xs font-semibold text-ink ring-1 ring-tag-deep/30">{forYou.length}</span>
              </div>
              <p className="mb-3 text-sm text-ink-mute">Offres du déstockage qui correspondent à votre profil (marque, vendeur ou genre), après vérification de compatibilité.</p>
              <DealResultsGrid className={dealGrid}>
                {forYou.slice(0, 8).map((c) => (
                  <DealCard key={c.offerId} d={c} />
                ))}
              </DealResultsGrid>
            </section>
          )}

          <section>
            <h2 className="mb-3 font-display text-2xl font-bold tracking-tight">
              {current === ALL ? "Les plus fortes remises" : labelOf(current)}
            </h2>
            {!hasProfile && (
              <Link href="/profil" className="mb-3 inline-flex items-center gap-2 rounded-xl border border-tag-deep/30 bg-tag-soft px-3 py-2 text-sm text-ink-soft hover:border-ink-mute">
                <Sparkles className="h-4 w-4 text-tag-deep" /> Renseignez votre profil pour faire remonter ce qui est à votre taille et dans votre budget.
              </Link>
            )}
            <DealResultsGrid className={dealGrid}>
              {cards.map((c) => (
                <DealCard key={c.offerId} d={c} />
              ))}
            </DealResultsGrid>
          </section>
        </>
      )}
    </>
  );
}
