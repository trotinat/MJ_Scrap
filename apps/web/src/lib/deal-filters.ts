import { z } from "zod";
import type { DealFilters } from "./queries";

const optNum = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === "" ? undefined : Number(v.replace(",", "."))))
  .refine((v) => v === undefined || Number.isFinite(v), "nombre invalide");

const schema = z.object({
  shopId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(60).optional().catch(undefined),
  criterionId: z.string().uuid().optional().catch(undefined),
  category: z.string().max(200).regex(/^\/[a-z0-9\-/]*$/i).optional().catch(undefined),
  brand: z.string().max(80).optional().catch(undefined),
  minPrice: optNum.catch(undefined),
  maxPrice: optNum.catch(undefined),
  minScore: optNum.catch(undefined),
  stock: z.enum(["in_stock", "out_of_stock", "unknown"]).optional().catch(undefined),
  q: z.string().max(100).optional().catch(undefined),
  sort: z.enum(["price", "score", "drop", "recent"]).optional().catch(undefined),
  page: optNum.catch(undefined),
});

/** Parses URL search params into validated deal filters (invalid values are ignored). */
export function parseDealFilters(sp: Record<string, string | string[] | undefined>): DealFilters {
  const flat = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]).filter(([, v]) => v !== undefined && v !== ""));
  const r = schema.parse(flat);
  return { ...r, page: r.page ? Math.max(1, Math.floor(r.page)) : 1 };
}

export function filtersToQuery(f: DealFilters, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...f, ...extra })) {
    if (v !== undefined && v !== null && v !== "" && !(k === "page" && v === 1)) p.set(k, String(v));
  }
  return p.toString();
}
