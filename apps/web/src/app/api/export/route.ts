import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { listDeals } from "@/lib/queries";
import { parseDealFilters } from "@/lib/deal-filters";
import { toCsv, toXlsx } from "@/lib/export";
import { EXPORT_COLUMNS } from "@/lib/export-columns";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await getCurrentUser())) return Response.json({ error: "Non authentifié" }, { status: 401 });
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const format = sp.format === "xlsx" ? "xlsx" : "csv";
  const filters = parseDealFilters(sp);
  const { rows } = await listDeals({ ...filters, page: 1, pageSize: 5000 });
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "csv") {
    return new Response(toCsv(rows, EXPORT_COLUMNS), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="hawta-promotions-${stamp}.csv"`,
        "cache-control": "no-store",
      },
    });
  }
  const buf = await toXlsx(rows, EXPORT_COLUMNS);
  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="hawta-promotions-${stamp}.xlsx"`,
      "cache-control": "no-store",
    },
  });
}
