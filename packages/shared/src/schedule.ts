import { Cron } from "croner";

export const SCHEDULE_TIMEZONE = "Africa/Casablanca";

/**
 * Parses "09:00,18:00" into a croner pattern "0 9,18 * * *" (minutes must match
 * across times; otherwise one pattern per time is returned).
 */
export function scheduleTimesToPatterns(times: string): string[] {
  const parsed = times
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const m = /^(\d{1,2}):(\d{2})$/.exec(t);
      if (!m) throw new Error(`Heure invalide dans SCRAPE_TIMES: "${t}"`);
      const h = Number(m[1]);
      const min = Number(m[2]);
      if (h > 23 || min > 59) throw new Error(`Heure invalide dans SCRAPE_TIMES: "${t}"`);
      return { h, min };
    });
  if (parsed.length === 0) throw new Error("SCRAPE_TIMES est vide");
  const byMinute = new Map<number, number[]>();
  for (const { h, min } of parsed) byMinute.set(min, [...(byMinute.get(min) ?? []), h]);
  return [...byMinute.entries()].map(([min, hours]) => `${min} ${[...new Set(hours)].sort((a, b) => a - b).join(",")} * * *`);
}

export const DEFAULT_SCRAPE_TIMES = "09:00,18:00";

/** Next `count` run instants (UTC Date objects) after `from`, honouring Africa/Casablanca rules. */
export function nextScheduledRuns(times = DEFAULT_SCRAPE_TIMES, count = 2, from: Date = new Date()): Date[] {
  const patterns = scheduleTimesToPatterns(times);
  const all: Date[] = [];
  for (const p of patterns) {
    const job = new Cron(p, { timezone: SCHEDULE_TIMEZONE, paused: true });
    all.push(...job.nextRuns(count, from));
    job.stop();
  }
  return all.sort((a, b) => a.getTime() - b.getTime()).slice(0, count);
}

/** Most recent scheduled instant at or before `at`. Used for catch-up after downtime. */
export function previousScheduledRun(times = DEFAULT_SCRAPE_TIMES, at: Date = new Date()): Date | null {
  // Look back up to 2 days and keep the latest instant <= at.
  const from = new Date(at.getTime() - 2 * 24 * 3600_000);
  const candidates = nextScheduledRuns(times, 8, from).filter((d) => d.getTime() <= at.getTime());
  return candidates.length ? candidates[candidates.length - 1]! : null;
}

const fmt = new Intl.DateTimeFormat("fr-FR", {
  timeZone: SCHEDULE_TIMEZONE,
  dateStyle: "medium",
  timeStyle: "short",
});

/** Formats a date in Morocco local time, e.g. "9 oct. 2026, 18:00". */
export function formatMoroccoTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return fmt.format(date).replace(/[  ]/g, " ");
}
