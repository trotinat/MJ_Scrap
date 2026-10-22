"use server";

import { revalidatePath } from "next/cache";
import { getDb, updateHiddenStyles } from "@mdw/database";
import { hiddenStyleSchema, URBAN_JUNGLE_SHOP_ID, type HiddenStyle } from "@mdw/shared";
import { requireUser } from "@/lib/session";

const same = (a: HiddenStyle, b: HiddenStyle) => a.shopId === b.shopId && a.kind === b.kind && a.value === b.value;

async function change(input: HiddenStyle, hide: boolean): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const parsed = hiddenStyleSchema.safeParse(input);
  if (!parsed.success || parsed.data.shopId !== URBAN_JUNGLE_SHOP_ID) return { ok: false };
  const style = parsed.data;
  await updateHiddenStyles(getDb(), user.id, (styles) => [...styles.filter((s) => !same(s, style)), ...(hide ? [style] : [])]);
  revalidatePath("/", "layout");
  return { ok: true };
}

/** "Pas mon style": stop showing this product, kind, collection or brand from Urban Jungle. */
export async function hideStyleAction(style: HiddenStyle) {
  return change(style, true);
}

export async function showStyleAction(style: HiddenStyle) {
  return change(style, false);
}

/** Rollback of every "Pas mon style" choice made for Urban Jungle. */
export async function showAllStylesAction(): Promise<{ ok: boolean }> {
  const user = await requireUser();
  await updateHiddenStyles(getDb(), user.id, (styles) => styles.filter((s) => s.shopId !== URBAN_JUNGLE_SHOP_ID));
  revalidatePath("/", "layout");
  return { ok: true };
}
