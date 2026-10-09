import Link from "next/link";
import { notFound } from "next/navigation";
import { Copy, Pencil, Search, Trash2 } from "lucide-react";
import { z } from "zod";
import { getAppSettings, getCriterion, getDb } from "@mdw/database";
import { madToCents, NOTIFY_MODE_LABELS, specAttribute, SPEC_OPERATOR_LABELS, type SpecRule } from "@mdw/shared";
import { Badge, btn, Card, EmptyState, FreshnessBadge, PageHeader, ProductImage, ScoreBadge, StockBadge } from "@/components/ui";
import { ConfirmSubmit, SubmitButton } from "@/components/buttons";
import { criterionMatches, listNotifications } from "@/lib/queries";
import { formatMad, formatMoroccoTime, NOTIF_STATUS_LABELS } from "@/lib/format";
import { deleteCriterionAction, duplicateCriterionAction, toggleCriterionAction } from "../actions";

export const metadata = { title: "Détail du critère" };

function Rules({ rules }: { rules: SpecRule[] }) {
  if (rules.length === 0) return <span className="text-slate-400">—</span>;
  return (
    <ul className="space-y-1">
      {rules.map((r, i) => (
        <li key={i}>
          {specAttribute(r.attribute)?.label ?? r.attribute} <span className="text-slate-500">{SPEC_OPERATOR_LABELS[r.operator]}</span> <strong>{r.value}</strong>
        </li>
      ))}
    </ul>
  );
}

function List({ values }: { values: string[] }) {
  return values.length ? (
    <div className="flex flex-wrap gap-1">
      {values.map((v) => (
        <Badge key={v}>{v}</Badge>
      ))}
    </div>
  ) : (
    <span className="text-slate-400">—</span>
  );
}

export default async function CriterionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const c = await getCriterion(getDb(), id);
  if (!c) notFound();
  const [matches, notifs, settings] = await Promise.all([criterionMatches(id), listNotifications(undefined, id, 20), getAppSettings(getDb())]);
  const f = c.filters;
  const mad = (v: number | null) => (v === null ? "—" : formatMad(madToCents(v)));

  const rows: [string, React.ReactNode][] = [
    [
      "Catégories et listes filtrées",
      f.categoryPaths.length ? (
        <ul key="cat" className="space-y-1">
          {f.categoryPaths.map((p) => (
            <li key={p} className="break-all rounded-md bg-slate-50 px-2 py-1 font-mono text-xs text-slate-700">
              {p}
            </li>
          ))}
        </ul>
      ) : (
        <span key="cat" className="text-slate-400">—</span>
      ),
    ],
    ["Mots-clés", <List key="kw" values={f.keywords} />],
    ["Synonymes", <List key="alt" values={f.altKeywords} />],
    ["Référence", f.modelRef ?? "—"],
    ["Marques préférées", <List key="pb" values={f.preferredBrands} />],
    ["Marques imposées", <List key="ib" values={f.includedBrands} />],
    ["Marques exclues", <List key="eb" values={f.excludedBrands} />],
    ["Prix", `${mad(f.minPrice)} → ${mad(f.maxPrice)}`],
    ["Prix cible", mad(f.targetPrice)],
    ["Remise annoncée min.", f.minDiscountPct !== null ? `${f.minDiscountPct} %` : "—"],
    ["Exigences obligatoires", <Rules key="ms" rules={f.mandatorySpecs} />],
    ["Spécifications préférées", <Rules key="ps" rules={f.preferredSpecs} />],
    ["Caractéristiques préférées", <List key="pc" values={f.preferredCharacteristics} />],
    ["Caractéristiques exclues", <List key="ec" values={f.excludedCharacteristics} />],
    ["Vendeurs préférés / exclus", <span key="s">{[...f.preferredSellers].join(", ") || "—"} / {f.excludedSellers.join(", ") || "—"}</span>],
    ["Note / avis minimum", `${f.minRating ?? "—"} / ${f.minReviewCount ?? "—"}`],
    ["État", f.condition === "new_only" ? "Neuf uniquement" : "Indifférent"],
    ["Notifications", `${NOTIFY_MODE_LABELS[c.notifyMode]} · score ≥ ${c.notifyMinScore} · baisse ≥ ${c.minPriceDropPct} %`],
  ];

  return (
    <>
      <PageHeader
        title={c.name}
        description={c.description || undefined}
        actions={
          <>
            {c.enabled ? <Badge tone="green">Actif</Badge> : <Badge>Désactivé</Badge>}
            <Link href={`/criteres/${c.id}/modifier`} className={btn.secondary}>
              <Pencil className="h-4 w-4" /> Modifier
            </Link>
            <form action={toggleCriterionAction}>
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="enabled" value={String(!c.enabled)} />
              <SubmitButton variant="secondary">{c.enabled ? "Désactiver" : "Activer"}</SubmitButton>
            </form>
            <form action={duplicateCriterionAction}>
              <input type="hidden" name="id" value={c.id} />
              <SubmitButton variant="secondary">
                <Copy className="h-4 w-4" /> Dupliquer
              </SubmitButton>
            </form>
            <form action={deleteCriterionAction}>
              <input type="hidden" name="id" value={c.id} />
              <ConfirmSubmit message="Supprimer définitivement ce critère et ses correspondances ? L'historique des prix est conservé.">
                <Trash2 className="h-4 w-4" /> Supprimer
              </ConfirmSubmit>
            </form>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Filtres" className="lg:col-span-1">
          <dl className="space-y-3 text-sm">
            {rows.map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{k}</dt>
                <dd className="mt-0.5 text-slate-800">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Card title={`Dernières correspondances (${matches.length})`}>
            {matches.length === 0 ? (
              <EmptyState icon={Search} title="Aucune correspondance pour l'instant">
                Les produits apparaissent ici après une collecte s&apos;ils respectent toutes les exigences obligatoires.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-slate-100">
                {matches.map(({ match, offer, product }) => (
                  <li key={match.id} className="flex gap-3 py-3">
                    <ProductImage src={product.imageUrl} alt={offer.title} className="h-16 w-16 shrink-0 rounded-lg" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/produits/${offer.id}`} className="line-clamp-2 text-sm font-medium text-slate-900 hover:text-brand-700">
                        {offer.title}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-semibold text-brand-700">{formatMad(offer.currentPriceCents)}</span>
                        <ScoreBadge score={match.score} dealClass={match.dealClass} />
                        <StockBadge stock={offer.stockStatus} />
                        <FreshnessBadge at={offer.lastSuccessAt} staleAfterHours={settings.staleAfterHours} />
                      </div>
                      <p className="mt-1 text-xs text-slate-600">{match.explanation}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Historique des notifications">
            {notifs.length === 0 ? (
              <p className="text-sm text-slate-500">Aucune notification envoyée pour ce critère.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Produit</th>
                      <th>Prix</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notifs.map(({ n, offerTitle, offerId }) => (
                      <tr key={n.id}>
                        <td className="whitespace-nowrap">{formatMoroccoTime(n.createdAt)}</td>
                        <td>{offerId ? <Link href={`/produits/${offerId}`} className="hover:text-brand-700">{offerTitle}</Link> : "—"}</td>
                        <td className="whitespace-nowrap">{formatMad(n.priceCents)}</td>
                        <td>
                          <Badge tone={n.status === "sent" ? "green" : n.status === "dead" ? "red" : "amber"}>{NOTIF_STATUS_LABELS[n.status]}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
