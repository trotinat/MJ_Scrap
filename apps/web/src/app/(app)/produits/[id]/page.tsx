import Link from "next/link";
import { DeliveredPrice } from "@/components/delivered-price";
import { notFound } from "next/navigation";
import { RetailerLink } from "@/components/retailer-link";
import { z } from "zod";
import { getDb, getUserSettings } from "@mdw/database";
import { requireUser } from "@/lib/session";
import { priceStats, historyFacts } from "@mdw/scoring";
import { describeSpec, type NormalizedSpecs } from "@mdw/shared";
import { Badge, btn, Card, FreshnessBadge, PageHeader, ProductImage, ScoreBadge, StockBadge } from "@/components/ui";
import { PriceChart } from "@/components/price-chart";
import { ShareButton } from "@/components/share-button";
import { offerDetail, similarModelOffers } from "@/lib/queries";
import { formatMad, formatMoroccoTime, formatPct, STOCK_LABELS } from "@/lib/format";

export const metadata = { title: "Détail du produit" };

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const [data, settings] = await Promise.all([offerDetail(id), getUserSettings(getDb(), user.id)]);
  if (!data) notFound();
  const { offer, product, history, matches, siblings } = data;
  const shopName = offer.shopId === "marjane-mall" ? "Marjane Mall" : new URL(offer.url).hostname.replace(/^www\./, "");
  const stats = priceStats(history.map((h) => ({ priceCents: h.priceCents, observedAt: h.observedAt })));
  const baseline = historyFacts(history.map(h=>({priceCents:h.priceCents,observedAt:h.observedAt})));
  const points = history.map((h) => ({ t: h.observedAt.getTime(), price: h.priceCents / 100, original: h.originalPriceCents ? h.originalPriceCents / 100 : null }));
  const candidates = await similarModelOffers(id,product.modelRef,product.brand);
  const specs = Object.entries(product.specs as NormalizedSpecs);
  const raw = Object.entries(product.rawSpecs ?? {}).filter(([k])=>k !== 'Variantes observées (stock à confirmer)');
  const variantsSchema=z.array(z.object({attributes:z.record(z.string()),priceCents:z.number().int().positive(),stock:z.literal('unknown')})).max(120);
  let variants:z.infer<typeof variantsSchema>=[];
  try {variants=variantsSchema.parse(JSON.parse(product.rawSpecs?.['Variantes observées (stock à confirmer)']??'[]'));} catch {}

  return (
    <>
      <PageHeader
        title={offer.title}
        description={`${product.brand ?? "Marque inconnue"}${product.modelRef ? ` · Réf. ${product.modelRef}` : ""}${offer.seller ? ` · Vendu par ${offer.seller}` : ""}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <RetailerLink url={offer.url} className={btn.primary} label={`Voir sur ${shopName}`} />
            <ShareButton url={offer.url} title={offer.title} />
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <ProductImage src={product.imageUrl} alt={offer.title} className="h-56 w-full rounded-lg" />
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-ink">{formatMad(offer.currentPriceCents)}</span>
              {offer.originalPriceCents && <span className="text-ink-mute line-through">{formatMad(offer.originalPriceCents)}</span>}
            </div>
            <div className="flex flex-wrap gap-1">
              {offer.advertisedDiscountPct !== null && <Badge tone="red">Remise annoncée -{offer.advertisedDiscountPct} %</Badge>}
              <StockBadge stock={offer.stockStatus} />
              <FreshnessBadge at={offer.lastSuccessAt} staleAfterHours={settings.staleAfterHours} />
              {offer.status !== "active" && <Badge tone="red">{offer.status === "missing" ? "Plus listé sur le site" : "Page indisponible"}</Badge>}
            </div>
            {offer.shopId === "marjane-mall" && <DeliveredPrice priceCents={offer.currentPriceCents ?? 0} observedShipping={product.rawSpecs?.['Livraison affichée (adresse à confirmer)']} />}
            {product.rawSpecs?.['Attention données source'] && <p className="rounded-lg bg-tag-soft p-3 text-xs">{product.rawSpecs['Attention données source']}</p>}
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div>
                <dt className="text-ink-mute">Premier relevé</dt>
                <dd className="font-medium">{formatMoroccoTime(offer.firstSeenAt)}</dd>
              </div>
              <div>
                <dt className="text-ink-mute">Dernier relevé réussi</dt>
                <dd className="font-medium">{formatMoroccoTime(offer.lastSuccessAt)}</dd>
              </div>
              <div>
                <dt className="text-ink-mute">Fiche taille / stock vérifiée</dt>
                <dd className="font-medium">{offer.lastDetailAt ? formatMoroccoTime(offer.lastDetailAt) : 'Pas encore vérifiée'}</dd>
              </div>
              <div>
                <dt className="text-ink-mute">Source des données</dt>
                <dd className="font-medium">{offer.extraction === "listing-card" ? "Fiche liste" : offer.extraction === "json-ld" ? "Page produit (JSON-LD)" : "Page produit"}</dd>
              </div>
              <div>
                <dt className="text-ink-mute">Catégorie</dt>
                <dd className="font-medium">{product.categoryPath ?? "—"}</dd>
              </div>
            </dl>
          </div>
        </Card>

        <Card title="Historique des prix observés" className="lg:col-span-2">
          <PriceChart points={points} />
          {stats && (
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div className="rounded-lg bg-paper p-3">
                <dt className="text-xs text-ink-mute">Plus bas observé</dt>
                <dd className="font-semibold">{formatMad(stats.minCents)}</dd>
              </div>
              <div className="rounded-lg bg-paper p-3">
                <dt className="text-xs text-ink-mute">Plus haut observé</dt>
                <dd className="font-semibold">{formatMad(stats.maxCents)}</dd>
              </div>
              <div className="rounded-lg bg-paper p-3">
                <dt className="text-xs text-ink-mute">Moyenne</dt>
                <dd className="font-semibold">{formatMad(stats.avgCents)}</dd>
              </div>
              <div className="rounded-lg bg-paper p-3">
                <dt className="text-xs text-ink-mute">Depuis le début du suivi</dt>
                <dd className="font-semibold">{formatPct(stats.changeSinceFirstPct)}</dd>
              </div>
            </dl>
          )}
          <p className="mt-3 rounded-xl bg-paper p-3 text-sm">{baseline.typical30DayCents ? `Prix habituel observé sur 30 jours : ${formatMad(baseline.typical30DayCents)} (${baseline.observedDays30} jours de données).` : `Prix habituel : historique insuffisant (${baseline.observedDays30??0}/5 jours minimum).`}</p>
          <p className="mt-3 text-xs text-ink-mute">
            Ces chiffres proviennent uniquement de nos {history.length} relevé(s) depuis le {formatMoroccoTime(offer.firstSeenAt)} ; aucun prix antérieur au début du suivi n&apos;est connu.
          </p>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Critères correspondants">
          {matches.length === 0 ? (
            <p className="text-sm text-ink-mute">Aucun critère évalué pour ce produit.</p>
          ) : (
            <ul className="space-y-4">
              {matches.map(({ match, criterion }) => (
                <li key={match.id} className="rounded-lg border border-paper-line p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/criteres/${criterion.id}`} className="text-sm font-semibold hover:text-ink">
                      {criterion.name}
                    </Link>
                    {match.isMatch ? <ScoreBadge score={match.score} dealClass={match.dealClass} /> : <Badge tone="red">Ne correspond plus</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-ink-soft">{match.explanation}</p>
                  {match.breakdown.length > 0 && (
                    <details className="mt-2 text-xs">
                      <summary className="cursor-pointer text-ink-mute">Détail du score</summary>
                      <table className="data mt-2">
                        <thead>
                          <tr>
                            <th>Composante</th>
                            <th>Poids</th>
                            <th>Valeur</th>
                            <th>Note</th>
                          </tr>
                        </thead>
                        <tbody>
                          {match.breakdown.map((b) => (
                            <tr key={b.key} className={b.applicable ? "" : "opacity-50"}>
                              <td>{b.label}</td>
                              <td>{b.applicable ? b.weight : "n/a"}</td>
                              <td>{b.applicable ? `${Math.round(b.value * 100)} %` : "—"}</td>
                              <td>{b.note ?? ""}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Fiche technique">
          {specs.length === 0 && raw.length === 0 ? (
            <p className="text-sm text-ink-mute">Aucune caractéristique extraite (la page produit n&apos;a peut-être pas encore été analysée).</p>
          ) : (
            <>
              {specs.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-1">
                  {specs.map(([k, v]) => (
                    <Badge key={k} tone="blue">
                      {describeSpec(k, v)}
                    </Badge>
                  ))}
                </div>
              )}
              <table className="data">
                <tbody>
                  {raw.map(([k, v]) => (
                    <tr key={k}>
                      <th className="w-1/3 normal-case tracking-normal text-ink-soft">{k}</th>
                      <td>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Card>
      </div>

      {variants.length>0 && <Card title="Tailles, couleurs et prix observés" className="mt-6"><p className="mb-3 text-sm text-ink-mute">Chaque ligne représente une combinaison fournie par le site. Son stock reste à confirmer : une option existante n’est pas forcément achetable.</p><div className="overflow-x-auto"><table className="data"><thead><tr><th>Variante</th><th>Prix hors livraison</th><th>Disponibilité</th></tr></thead><tbody>{variants.map((v,i)=><tr key={i}><td>{Object.entries(v.attributes).map(([k,value])=>`${k} : ${value}`).join(' · ')}</td><td>{formatMad(v.priceCents)}</td><td>À confirmer</td></tr>)}</tbody></table></div></Card>}
      {candidates.length > 0 && <Card title="Comparer les annonces de ce modèle" className="mt-6"><p className="mb-4 text-sm text-ink-mute">Modèle et marque rapprochés. Vérifiez référence, couleur, taille et contenu du pack : ces annonces ne sont pas certifiées identiques. Prix hors livraison.</p><ul className="space-y-3">{candidates.map(c=><li key={c.id} className="flex flex-wrap justify-between gap-2 rounded-xl border border-paper-line p-3"><Link href={`/produits/${c.id}`} className="max-w-lg text-sm hover:underline">{c.title}</Link><span className="text-sm font-semibold">{formatMad(c.price_cents)} · {c.seller??'Vendeur inconnu'}</span></li>)}</ul></Card>}
      {siblings.length > 0 && (
        <Card title="Autres offres du même produit" className="mt-6">
          <table className="data">
            <thead>
              <tr>
                <th>Offre</th>
                <th>Vendeur</th>
                <th>Prix</th>
                <th>Stock</th>
              </tr>
            </thead>
            <tbody>
              {siblings.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link href={`/produits/${s.id}`} className="hover:text-ink">
                      {s.title}
                    </Link>
                  </td>
                  <td>{s.seller ?? "—"}</td>
                  <td className="whitespace-nowrap">{formatMad(s.currentPriceCents)}</td>
                  <td>{STOCK_LABELS[s.stockStatus]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card title={`Relevés enregistrés (${history.length})`} className="mt-6">
        <div className="max-h-96 overflow-auto">
          <table className="data">
            <thead>
              <tr>
                <th>Date (heure du Maroc)</th>
                <th>Prix observé</th>
                <th>Prix barré annoncé</th>
                <th>Remise annoncée</th>
                <th>Stock</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {[...history].reverse().map((h) => (
                <tr key={h.id}>
                  <td className="whitespace-nowrap">{formatMoroccoTime(h.observedAt)}</td>
                  <td className="whitespace-nowrap font-medium">{formatMad(h.priceCents)}</td>
                  <td className="whitespace-nowrap">{formatMad(h.originalPriceCents)}</td>
                  <td>{h.advertisedDiscountPct !== null ? `-${h.advertisedDiscountPct} %` : "—"}</td>
                  <td>{STOCK_LABELS[h.stockStatus]}</td>
                  <td>{h.source === "detail" ? "Page produit" : "Liste"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
