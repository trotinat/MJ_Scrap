import { criterionFiltersSchema } from "@mdw/shared";
import { getDb, listUserShops } from "@mdw/database";
import { requireUser } from "@/lib/session";
import { CriterionForm } from "@/components/criterion-form";
import { PageHeader } from "@/components/ui";
import { createCriterionAction } from "../actions";

export const metadata = { title: "Nouveau critère" };

export default async function NewCriterionPage({ searchParams }: { searchParams: Promise<{ shop?: string | string[] }> }) {
  const [shops, params] = await Promise.all([listUserShops(getDb(), (await requireUser()).id), searchParams]);
  const requestedShop = Array.isArray(params.shop) ? params.shop[0] : params.shop;
  const initialShopId = shops.some((shop) => shop.id === requestedShop) ? requestedShop! : shops[0]?.id ?? "marjane-mall";
  // Defaults straight from the schema (empty optional fields).
  const filters = criterionFiltersSchema.innerType().parse({});
  return (
    <>
      <PageHeader title="Nouvelle recherche" description="Dites ce que vous cherchez, vérifiez quelques produits, puis activez la surveillance." />
      <CriterionForm
        shops={shops}
        submitLabel="Créer le critère"
        previewBeforeSave
        action={createCriterionAction}
        initial={{ shopId: initialShopId, name: "", description: "", enabled: true, notifyMode: "all", notifyMinScore: 50, minPriceDropPct: 5, filters }}
      />
    </>
  );
}
