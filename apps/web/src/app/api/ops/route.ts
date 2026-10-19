import { NextResponse } from "next/server";
import { desc, sql } from "drizzle-orm";
import { getDb, priceHistory, productOffers, products, scrapingErrors, scrapingRuns, searchCriteria, workerStatus } from "@mdw/database";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

function metricValue(lines: string[], name: string) {
  const line = lines.find((item) => item.startsWith(`${name} `));
  return line ? Number(line.slice(name.length + 1).split(" ")[0]) : null;
}

function labeledValues(lines: string[], name: string, include: (labels: string) => boolean) {
  return lines.flatMap((line) => {
    if (!line.startsWith(`${name}{`)) return [];
    const end = line.lastIndexOf("} ");
    if (end < 0 || !include(line.slice(name.length + 1, end))) return [];
    const value = Number(line.slice(end + 2).split(" ")[0]);
    return Number.isFinite(value) ? [value] : [];
  });
}

async function hostMetrics() {
  try {
    const res = await fetch("http://node-exporter:9100/metrics", { cache: "no-store", signal: AbortSignal.timeout(2500) });
    if (!res.ok) return null;
    const lines = (await res.text()).split("\n");
    const total = labeledValues(lines, "node_cpu_seconds_total", () => true).reduce((a, b) => a + b, 0);
    const idle = labeledValues(lines, "node_cpu_seconds_total", (labels) => /mode="idle"/.test(labels)).reduce((a, b) => a + b, 0);
    const memoryTotal = metricValue(lines, "node_memory_MemTotal_bytes");
    const memoryAvailable = metricValue(lines, "node_memory_MemAvailable_bytes");
    const rootLabels = (labels: string) => /mountpoint="\/"/.test(labels) && !/fstype="(tmpfs|overlay|squashfs)"/.test(labels);
    const diskTotal = labeledValues(lines, "node_filesystem_size_bytes", rootLabels)[0] ?? null;
    const diskAvailable = labeledValues(lines, "node_filesystem_avail_bytes", rootLabels)[0] ?? null;
    const networkDevice = (labels: string) => {
      const device = labels.match(/device="([^"]+)"/)?.[1] ?? "";
      return Boolean(device) && !/^(lo|docker|veth|br-|tailscale|virbr)/.test(device);
    };
    return {
      cpu: { idle, total },
      memory: memoryTotal && memoryAvailable ? { used: memoryTotal - memoryAvailable, total: memoryTotal } : null,
      disk: diskTotal && diskAvailable ? { used: diskTotal - diskAvailable, total: diskTotal } : null,
      uptimeSeconds: metricValue(lines, "node_time_seconds") && metricValue(lines, "node_boot_time_seconds")
        ? Math.max(0, metricValue(lines, "node_time_seconds")! - metricValue(lines, "node_boot_time_seconds")!) : null,
      network: {
        received: labeledValues(lines, "node_network_receive_bytes_total", networkDevice).reduce((a, b) => a + b, 0),
        sent: labeledValues(lines, "node_network_transmit_bytes_total", networkDevice).reduce((a, b) => a + b, 0),
      },
    };
  } catch {
    return null;
  }
}

export async function GET() {
  await requireUser();
  const db = getDb();
  const [countsResult, latestWorkers, latestRuns, errorsResult, activityResult, host] = await Promise.all([
    db.execute<{ products: number; offers: number; observations: number; criteria: number; runs24h: number; errors24h: number }>(sql`
      select
        (select count(*)::int from ${products}) as products,
        (select count(*)::int from ${productOffers}) as offers,
        (select count(*)::int from ${priceHistory}) as observations,
        (select count(*)::int from ${searchCriteria}) as criteria,
        (select count(*)::int from ${scrapingRuns} where started_at > now() - interval '24 hours') as "runs24h",
        (select count(*)::int from ${scrapingErrors} where created_at > now() - interval '24 hours') as "errors24h"
    `),
    db.select().from(workerStatus).orderBy(desc(workerStatus.heartbeatAt)).limit(1),
    db.select().from(scrapingRuns).orderBy(desc(scrapingRuns.startedAt)).limit(8),
    db.execute<{ pending: number; sent: number }>(sql`
      select count(*) filter (where status in ('pending','sending'))::int as pending,
             count(*) filter (where status='sent' and created_at > now() - interval '24 hours')::int as sent
      from notifications
    `),
    db.execute<{ hour: string; runs: number }>(sql`
      select to_char(g.hour at time zone 'Africa/Casablanca', 'HH24:00') as hour,
             count(r.id)::int as runs
      from generate_series(date_trunc('hour', now()) - interval '23 hours', date_trunc('hour', now()), interval '1 hour') as g(hour)
      left join scraping_runs r on date_trunc('hour', r.started_at) = g.hour
      group by g.hour order by g.hour
    `),
    hostMetrics(),
  ]);
  const counts = countsResult.rows[0] ?? { products: 0, offers: 0, observations: 0, criteria: 0, runs24h: 0, errors24h: 0 };
  const worker = latestWorkers[0] ?? null;
  return NextResponse.json({
    sampledAt: new Date().toISOString(),
    host,
    app: {
      db: "online",
      worker: worker && Date.now() - worker.heartbeatAt.getTime() < 120_000 ? "online" : "offline",
      heartbeatAt: worker?.heartbeatAt ?? null,
      running: Boolean(worker?.currentRunId || latestRuns[0]?.status === "running"),
      counts,
      notifications: errorsResult.rows[0] ?? { pending: 0, sent: 0 },
      activity: activityResult.rows,
      recentRuns: latestRuns.map((run) => ({ id: run.id, shopId: run.shopId, status: run.status, trigger: run.trigger, startedAt: run.startedAt, finishedAt: run.finishedAt, durationMs: run.durationMs, stats: run.stats, error: run.errorSummary })),
    },
  }, { headers: { "cache-control": "no-store" } });
}
