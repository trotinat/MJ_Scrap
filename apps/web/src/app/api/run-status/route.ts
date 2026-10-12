import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb, runRequests, scrapingRuns, workerStatus } from "@mdw/database";

export const dynamic = "force-dynamic";

/**
 * Lightweight polling endpoint for the collection watcher: is a run in progress,
 * and what was the last finished run. Same-origin fetch carries the session
 * cookie, so it stays behind auth like every other page.
 */
export async function GET() {
  const db = getDb();
  const [pending, lastRunRows, workerRows] = await Promise.all([
    db.select({ id: runRequests.id }).from(runRequests).where(eq(runRequests.status, "pending")).limit(1),
    db.select().from(scrapingRuns).orderBy(desc(scrapingRuns.startedAt)).limit(1),
    db.select().from(workerStatus).orderBy(desc(workerStatus.heartbeatAt)).limit(1),
  ]);
  const lastRun = lastRunRows[0] ?? null;
  const worker = workerRows[0] ?? null;
  const running = worker?.currentRunId != null || lastRun?.status === "running" || pending.length > 0;

  return NextResponse.json(
    {
      running,
      pending: pending.length > 0,
      lastRunId: lastRun?.id ?? null,
      lastStatus: lastRun?.status ?? null,
      finishedAt: lastRun?.finishedAt ?? null,
      stats: lastRun?.stats ?? null,
      workerAlive: worker ? Date.now() - new Date(worker.heartbeatAt).getTime() < 2 * 60_000 : false,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
