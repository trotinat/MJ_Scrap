import { criterionFiltersSchema } from "@mdw/shared";
import { CriterionForm } from "@/components/criterion-form";
import { PageHeader } from "@/components/ui";
import { createCriterionAction } from "../actions";

export const metadata = { title: "Nouveau critère" };

export default function NewCriterionPage() {
  // Defaults straight from the schema (empty optional fields).
  const filters = criterionFiltersSchema.innerType().parse({});
  return (
    <>
      <PageHeader title="Nouveau critère de recherche" description="Les champs facultatifs peuvent rester vides." />
      <CriterionForm
        submitLabel="Créer le critère"
        action={createCriterionAction}
        initial={{ name: "", description: "", enabled: true, notifyMode: "all", notifyMinScore: 50, minPriceDropPct: 5, filters }}
      />
    </>
  );
}
