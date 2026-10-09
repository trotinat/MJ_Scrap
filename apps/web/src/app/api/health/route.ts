import { sql } from "drizzle-orm";
import { getDb } from "@mdw/database";

export const dynamic = "force-dynamic";

/** Public liveness probe: reveals nothing but "ok" / "degraded". */
export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ status: "ok" }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ status: "degraded" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
