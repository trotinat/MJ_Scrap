"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { eq } from "drizzle-orm";
import {
  seedRecommendedCriteria,
  createCriterion,
  deleteCriterion,
  duplicateCriterion,
  getUserProfile,
  getDb,
  runRequests,
  setCriterionEnabled,
  updateCriterion,
  requireUserShop,
} from "@mdw/database";
import { buildProfilePaths, criterionInputSchema, EXAMPLE_CRITERIA, profileToFilterPatch, sitePathSchema } from "@mdw/shared";
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
  const user = await requireUser();
  const p = parsePayload(formData);
  if (!p.ok) return p.state;
  const db = getDb();
  try { await requireUserShop(db, user.id, p.data.shopId); }
  catch { return { message: "Boutique indisponible pour votre compte." }; }
  const c = await createCriterion(db, p.data, user.id);
  if (p.data.enabled) {
    const pending = await db.select({ id: runRequests.id }).from(runRequests).where(eq(runRequests.status, "pending")).limit(1);
    if (!pending.length) await db.insert(runRequests).values({ requestedBy: user.email });
  }
  revalidatePath("/criteres");
  revalidatePath("/collectes");
  redirect(`/criteres/${c.id}?ajout=1`);
}

export async function updateCriterionAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!uuid.safeParse(id).success) return { message: "Identifiant invalide." };
  const p = parsePayload(formData);
  if (!p.ok) return p.state;
  try { await requireUserShop(getDb(), user.id, p.data.shopId); }
  catch { return { message: "Boutique indisponible pour votre compte." }; }
  const c = await updateCriterion(getDb(), id, p.data, user.id);
  if (!c) return { message: "Critère introuvable." };
  revalidatePath("/criteres");
  redirect(`/criteres/${id}`);
}

export async function toggleCriterionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = uuid.parse(formData.get("id"));
  await setCriterionEnabled(getDb(), id, formData.get("enabled") === "true", user.id);
  revalidatePath("/criteres");
  revalidatePath(`/criteres/${id}`);
}

export async function duplicateCriterionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = uuid.parse(formData.get("id"));
  const copy = await duplicateCriterion(getDb(), id, user.id);
  revalidatePath("/criteres");
  if (copy) redirect(`/criteres/${copy.id}/modifier`);
}

export async function deleteCriterionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = uuid.parse(formData.get("id"));
  await deleteCriterion(getDb(), id, user.id);
  revalidatePath("/", "layout");
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
  try { await requireUserShop(getDb(), user.id, "marjane-mall"); }
  catch { return { error: "Marjane Mall est indisponible pour votre compte." }; }
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
  }, user.id);
  const pending = await db.select({ id: runRequests.id }).from(runRequests).where(eq(runRequests.status, "pending")).limit(1);
  if (pending.length === 0) await db.insert(runRequests).values({ requestedBy: user.email });
  revalidatePath("/criteres");
  revalidatePath("/collectes");
  redirect(`/criteres/${c.id}?ajout=1`);
}

const quickCategoriesSchema = z.object({
  name: z.string().trim().max(120).optional(),
  keywords: z.string().trim().max(200).optional(),
  paths: z.array(sitePathSchema).min(1),
  useProfile: z.boolean().optional(),
});

/**
 * "Parcourir les rayons" : creates a criterion from categories picked in the
 * visual browser (no URL to paste), then asks the worker to collect right away.
 */
export async function quickAddFromCategoriesAction(_prev: QuickAddState, formData: FormData): Promise<QuickAddState> {
  const user = await requireUser();
  try { await requireUserShop(getDb(), user.id, "marjane-mall"); }
  catch { return { error: "Marjane Mall est indisponible pour votre compte." }; }
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("payload") ?? "{}"));
  } catch {
    return { error: "Formulaire invalide." };
  }
  const parsed = quickCategoriesSchema.safeParse(raw);
  if (!parsed.success) return { error: "Choisissez au moins un rayon à surveiller." };
  const keywords = (parsed.data.keywords ?? "").split(",").map((k) => k.trim()).filter(Boolean);
  const lastSeg = parsed.data.paths[0]!.split("?")[0]!.split("/").filter(Boolean).pop() ?? "Marjane Mall";
  const name = parsed.data.name?.trim() || keywords[0] || titleCase(lastSeg);

  const db = getDb();
  // Apply the shopper profile: fashion facets into the listing URL, brands /
  // sellers / budget into the criterion's own filters.
  let paths = parsed.data.paths;
  let profilePatch = {};
  if (parsed.data.useProfile) {
    const shopperProfile = await getUserProfile(db, user.id);
    paths = [...new Set(paths.flatMap((p) => buildProfilePaths(p, shopperProfile)))].slice(0, 10);
    profilePatch = profileToFilterPatch(shopperProfile);
  }
  const c = await createCriterion(db, {
    name,
    description: keywords.length ? `Recherche « ${keywords.join(", ")} »` : "",
    enabled: true,
    notifyMode: "all",
    notifyMinScore: 50,
    filters: { categoryPaths: paths, keywords, ...profilePatch },
  }, user.id);
  const pending = await db.select({ id: runRequests.id }).from(runRequests).where(eq(runRequests.status, "pending")).limit(1);
  if (pending.length === 0) await db.insert(runRequests).values({ requestedBy: user.email });
  revalidatePath("/criteres");
  revalidatePath("/collectes");
  redirect(`/criteres/${c.id}?ajout=1`);
}

export async function seedExamplesAction(): Promise<void> {
  const user = await requireUser();
  for (const c of EXAMPLE_CRITERIA) await createCriterion(getDb(), c, user.id);
  revalidatePath("/criteres");
}

/** Adds the recommended criteria (enabled) that are not in the list yet, then requests a collection. */
export async function seedRecommendedAction(): Promise<void> {
  const user = await requireUser();
  const db = getDb();
  const added = await seedRecommendedCriteria(db, { userId: user.id });
  if (added > 0) {
    const pending = await db.select({ id: runRequests.id }).from(runRequests).where(eq(runRequests.status, "pending")).limit(1);
    if (pending.length === 0) await db.insert(runRequests).values({ requestedBy: user.email });
  }
  revalidatePath("/criteres");
  revalidatePath("/collectes");
}
