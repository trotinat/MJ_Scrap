import http from "node:http";
import { desc } from "drizzle-orm";
import { scrapingRuns, type Db } from "@mdw/database";
import type { Scheduler } from "./scheduler";

/** GET /health -> 200 when the DB answers and the scheduler is armed, 503 otherwise. */
export function startHealthServer(port: number, db: Db, scheduler: Scheduler): http.Server {
  const server = http.createServer(async (req, res) => {
    if (req.method !== "GET" || (req.url !== "/health" && req.url !== "/healthz")) {
      res.writeHead(404).end();
      return;
    }
    let dbOk = false;
    let lastRun: { status: string; startedAt: Date } | null = null;
    try {
      const [row] = await db
        .select({ status: scrapingRuns.status, startedAt: scrapingRuns.startedAt })
        .from(scrapingRuns)
        .orderBy(desc(scrapingRuns.startedAt))
        .limit(1);
      lastRun = row ?? null;
      dbOk = true;
    } catch {
      dbOk = false;
    }
    const nextRunAt = scheduler.nextRunAt();
    const ok = dbOk && nextRunAt !== null;
    res.writeHead(ok ? 200 : 503, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(
      JSON.stringify({
        status: ok ? "ok" : "degraded",
        db: dbOk,
        scheduler: nextRunAt !== null,
        busy: scheduler.busy,
        nextRunAt: nextRunAt?.toISOString() ?? null,
        lastRun,
        uptimeSeconds: Math.round(process.uptime()),
      }),
    );
  });
  // A busy port must never stop the scheduler: only the health endpoint is lost.
  server.on("error", (err) => {
    console.error(JSON.stringify({ level: "warn", msg: `endpoint /health indisponible sur le port ${port}`, err: (err as Error).message }));
  });
  server.listen(port, "0.0.0.0");
  return server;
}
