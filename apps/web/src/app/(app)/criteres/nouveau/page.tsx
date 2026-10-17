import { criterionFiltersSchema } from "@mdw/shared";
import { getDb, listUserShops } from "@mdw/database";
import { requireUser } from "@/lib/session";
import { CriterionForm } from "@/components/criterion-form";
import { PageHeader } from "@/components/ui";
import { createCriterionAction } from "../actions";

export const metadata = { title: "Nouveau critère" };

export default async function NewCriterionPage() {
  const shops = await listUserShops(getDb(), (await requireUser()).id);
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
        initial={{ shopId: shops[0]?.id ?? "marjane-mall", name: "", description: "", enabled: true, notifyMode: "all", notifyMinScore: 50, minPriceDropPct: 5, filters }}
      />
    </>
  );
}
