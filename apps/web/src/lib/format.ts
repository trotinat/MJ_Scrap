import { formatMad, formatMoroccoTime } from "@mdw/shared";

export { formatMad, formatMoroccoTime };

export function formatPct(v: number | null | undefined, signed = true): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const r = Math.round(v * 10) / 10;
  return `${signed && r > 0 ? "+" : ""}${r.toLocaleString("fr-FR")} %`;
}

export function relativeTime(d: Date | string | null | undefined, now = new Date()): string {
  if (!d) return "jamais";
  const date = typeof d === "string" ? new Date(d) : d;
  const diff = Math.round((now.getTime() - date.getTime()) / 1000);
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
  if (abs < 60) return rtf.format(-diff, "second");
  if (abs < 3600) return rtf.format(-Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(-Math.round(diff / 3600), "hour");
  return rtf.format(-Math.round(diff / 86400), "day");
}

export function isStale(d: Date | string | null | undefined, hours: number, now = new Date()): boolean {
  if (!d) return true;
  const date = typeof d === "string" ? new Date(d) : d;
  return now.getTime() - date.getTime() > hours * 3600_000;
}

export function durationLabel(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms} ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min ${s % 60} s`;
}

export const STOCK_LABELS: Record<string, string> = {
  in_stock: "En stock",
  out_of_stock: "Rupture",
  unknown: "Non indiqué",
};

export const RUN_STATUS_LABELS: Record<string, string> = {
  running: "En cours",
  success: "Réussie",
  partial: "Partielle",
  failed: "Échec",
  skipped: "Ignorée",
  interrupted: "Interrompue",
};

export const RUN_TRIGGER_LABELS: Record<string, string> = {
  schedule: "Planifiée",
  manual: "Manuelle",
  catchup: "Rattrapage",
};

export const NOTIF_STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  sending: "Envoi en cours",
  sent: "Envoyée",
  failed: "Nouvel essai prévu",
  dead: "Abandonnée",
};
