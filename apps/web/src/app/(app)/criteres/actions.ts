"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  createCriterion,
  deleteCriterion,
  duplicateCriterion,
  getDb,
  setCriterionEnabled,
  updateCriterion,
} from "@mdw/database";
import { criterionInputSchema, EXAMPLE_CRITERIA } from "@mdw/shared";
import type { FormState } from "@/components/criterion-form";
import { requireUser } from "@/lib/session";

const uuid = z.string().uuid();

function parsePayload(formData: FormData): { ok: true; data: z.infer<typeof criterionInputSchema> } | { ok: false; state: FormState } {
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("payload") ?? "{}"));
  } catch {
    return { ok: false, state: { message: "Formulaire invalide." } };
  }
  const parsed = criterionInputSchema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };
  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.filter((p) => typeof p === "string").join(".");
    if (!errors[key]) errors[key] = issue.message;
  }
  return { ok: false, state: { errors, message: "Certains champs sont invalides." } };
}

export async function createCriterionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const p = parsePayload(formData);
  if (!p.ok) return p.state;
  const c = await createCriterion(getDb(), p.data);
  revalidatePath("/criteres");
  redirect(`/criteres/${c.id}`);
}

export async function updateCriterionAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  if (!uuid.safeParse(id).success) return { message: "Identifiant invalide." };
  const p = parsePayload(formData);
  if (!p.ok) return p.state;
  const c = await updateCriterion(getDb(), id, p.data);
  if (!c) return { message: "Critère introuvable." };
  revalidatePath("/criteres");
  redirect(`/criteres/${id}`);
}

export async function toggleCriterionAction(formData: FormData): Promise<void> {
  await requireUser();
  const id = uuid.parse(formData.get("id"));
  await setCriterionEnabled(getDb(), id, formData.get("enabled") === "true");
  revalidatePath("/criteres");
  revalidatePath(`/criteres/${id}`);
}

export async function duplicateCriterionAction(formData: FormData): Promise<void> {
  await requireUser();
  const id = uuid.parse(formData.get("id"));
  const copy = await duplicateCriterion(getDb(), id);
  revalidatePath("/criteres");
  if (copy) redirect(`/criteres/${copy.id}/modifier`);
}

export async function deleteCriterionAction(formData: FormData): Promise<void> {
  await requireUser();
  const id = uuid.parse(formData.get("id"));
  await deleteCriterion(getDb(), id);
  revalidatePath("/criteres");
  redirect("/criteres");
}

export async function seedExamplesAction(): Promise<void> {
  await requireUser();
  for (const c of EXAMPLE_CRITERIA) await createCriterion(getDb(), c);
  revalidatePath("/criteres");
}
