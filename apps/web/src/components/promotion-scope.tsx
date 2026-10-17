import Link from "next/link";
import { cx } from "@/components/ui";

export function PromotionScope({ all, profileHref, allHref }: { all: boolean; profileHref: string; allHref: string }) {
  return <div className="mb-5 rounded-2xl border border-paper-line bg-paper-card p-4">
    <div className="flex flex-wrap gap-2" aria-label="Personnalisation des offres">
      {[[false, profileHref, "Pour mon profil"], [true, allHref, "Toutes les offres / cadeaux"]].map(([active, href, label]) =>
        <Link key={String(active)} href={String(href)} aria-current={all === active ? "page" : undefined} className={cx("rounded-full border px-4 py-2 text-sm font-semibold", all === active ? "border-ink bg-ink text-white" : "border-paper-line text-ink-soft hover:border-ink-mute")}>{label}</Link>)}
      <Link href="/profil" className="ml-auto self-center text-sm text-tag-deep underline underline-offset-4">Modifier mon profil</Link>
    </div>
    <p className="mt-3 text-sm text-ink-mute">{all ? "Catalogue général : les offres peuvent concerner d’autres genres et tailles, pour vos cadeaux aussi." : "Votre genre et vos tailles renseignées filtrent la mode. Les articles incompatibles ou sans les informations nécessaires sont masqués. Vos exclusions de produits sont aussi appliquées. Les produits du quotidien restent visibles."}</p>
  </div>;
}
