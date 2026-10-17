import { notFound } from "next/navigation";
import { z } from "zod";
import { getCriterion, getDb, listUserShops } from "@mdw/database";
import { CriterionForm } from "@/components/criterion-form";
import { PageHeader } from "@/components/ui";
import { updateCriterionAction } from "../../actions";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Modifier le critère" };

export default async function EditCriterionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const user = await requireUser();
  const c = await getCriterion(getDb(), id, user.id);
  if (!c) notFound();
  const shops = await listUserShops(getDb(), user.id);
  const { id: _id, ...initial } = c;
  return (
    <>
      <PageHeader title={`Modifier « ${c.name} »`} />
      <CriterionForm shops={shops} submitLabel="Enregistrer" action={updateCriterionAction.bind(null, c.id)} initial={initial} />
    </>
  );
}
