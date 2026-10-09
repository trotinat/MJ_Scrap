import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { count, eq } from "drizzle-orm";
import { getDb, searchCriteria } from "@mdw/database";

/** Shown when no criterion is active: collections then have nothing to fetch. */
export async function NoCriteriaBanner() {
  const [row] = await getDb().select({ n: count() }).from(searchCriteria).where(eq(searchCriteria.enabled, true));
  if (Number(row?.n ?? 0) > 0) return null;
  return (
    <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p>
        <strong>Aucun critère de recherche actif</strong> : les collectes n&apos;ont rien à chercher sur Marjane Mall.{" "}
        <Link href="/criteres" className="font-medium underline">
          Ajoutez une page à surveiller ou un critère
        </Link>
        , puis lancez une collecte.
      </p>
    </div>
  );
}
