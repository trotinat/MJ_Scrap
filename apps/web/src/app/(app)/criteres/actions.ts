"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { eq } from "drizzle-orm";
import {
  createCriterion,
  deleteCriterion,
  duplicateCriterion,
  getDb,
  runRequests,
  setCriterionEnabled,
  updateCriterion,
} from "@mdw/database";
import { criterionInputSchema, EXAMPLE_CRITERIA, sitePathSchema } from "@mdw/shared";
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

export interface QuickAddState {
  error?: string;
}

function titleCase(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * "Surveiller une URL" : creates a criterion from a pasted Marjane Mall link
 * (filters included), then asks the worker to collect right away.
 */
export async function quickAddFromUrlAction(_prev: QuickAddState, formData: FormData): Promise<QuickAddState> {
  const user = await requireUser();
  const parsed = sitePathSchema.safeParse(String(formData.get("url") ?? ""));
  if (!parsed.success) return { error: "Collez une adresse de page Marjane Mall (https://www.marjanemall.ma/…)." };
  const path = parsed.data;
  const pathname = path.split("?")[0]!;
  const segments = pathname.split("/").filter(Boolean);
  const brandMatch = /^\/boutique-officielle\/([a-z0-9-]+)/i.exec(pathname);
  const brand = brandMatch ? titleCase(brandMatch[1]!) : null;
  const typedName = String(formData.get("name") ?? "").trim().slice(0, 120);
  const name = typedName || `${brand ?? titleCase(segments[segments.length - 1] ?? "Marjane Mall")}${path.includes("?") ? " (filtres)" : ""}`;

  const db = getDb();
  const c = await createCriterion(db, {
    name,
    description: `Créé depuis l'URL : https://www.marjanemall.ma${path}`,
    enabled: true,
    notifyMode: "all",
    notifyMinScore: 50,
    filters: { categoryPaths: [path], includedBrands: brand ? [brand] : [] },
  });
  const pending = await db.select({ id: runRequests.id }).from(runRequests).where(eq(runRequests.status, "pending")).limit(1);
  if (pending.length === 0) await db.insert(runRequests).values({ requestedBy: user.email });
  revalidatePath("/criteres");
  revalidatePath("/collectes");
  redirect(`/criteres/${c.id}?ajout=1`);
}

export async function seedExamplesAction(): Promise<void> {
  await requireUser();
  for (const c of EXAMPLE_CRITERIA) await createCriterion(getDb(), c);
  revalidatePath("/criteres");
}
