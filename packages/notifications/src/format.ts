import { formatMad, formatMoroccoTime, frNumber, DEAL_CLASS_LABELS, type DealClass } from "@mdw/shared";
import type { NotificationEvent } from "@mdw/database";

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export const EVENT_LABELS: Record<NotificationEvent, string> = {
  new_match: "🆕 Nouvelle offre",
  target_reached: "🎯 Prix cible atteint",
  price_drop: "📉 Baisse de prix",
  back_in_stock: "📦 De retour en stock",
  exceptional: "🔥 Offre exceptionnelle",
  test: "✅ Notification de test",
};

export interface DealMessageInput {
  event: NotificationEvent;
  criterionName: string;
  title: string;
  url: string;
  priceCents: number;
  originalPriceCents: number | null;
  advertisedDiscountPct: number | null;
  previousPriceCents: number | null;
  changeVsPreviousPct: number | null;
  stock: "in_stock" | "out_of_stock" | "unknown";
  seller: string | null;
  score: number;
  dealClass: DealClass;
  explanation: string;
  observedAt: Date;
}

const STOCK_LABEL = { in_stock: "En stock", out_of_stock: "Rupture de stock", unknown: "Non indiquée" } as const;

/** French Telegram message (HTML parse mode). */
export function formatDealMessage(m: DealMessageInput, maxLength = 1024): string {
  const lines: string[] = [];
  lines.push(`<b>${EVENT_LABELS[m.event]}</b> · ${escapeHtml(DEAL_CLASS_LABELS[m.dealClass])} (${m.score}/100)`);
  lines.push(`<b>${escapeHtml(m.title)}</b>`);
  lines.push(
    `💰 Prix : <b>${formatMad(m.priceCents)}</b>${m.originalPriceCents ? ` <s>${formatMad(m.originalPriceCents)}</s>` : ""}`,
  );
  if (m.advertisedDiscountPct !== null) lines.push(`🏷️ Remise annoncée par le site : -${frNumber(m.advertisedDiscountPct)} %`);
  if (m.changeVsPreviousPct !== null && m.previousPriceCents !== null && m.changeVsPreviousPct !== 0) {
    const sign = m.changeVsPreviousPct > 0 ? "+" : "";
    lines.push(`📊 Évolution observée : ${sign}${frNumber(m.changeVsPreviousPct)} % (relevé précédent ${formatMad(m.previousPriceCents)})`);
  }
  lines.push(`📦 Disponibilité : ${STOCK_LABEL[m.stock]}${m.seller ? ` · Vendu par ${escapeHtml(m.seller)}` : ""}`);
  lines.push(`🔎 Critère : ${escapeHtml(m.criterionName)}`);
  const head = lines.join("\n");
  const footer = `🔗 <a href="${escapeHtml(m.url)}">Voir l'offre sur Marjane Mall</a>\n🕒 Relevé le ${formatMoroccoTime(m.observedAt)}`;
  // Keep within Telegram's caption limit by trimming the explanation.
  const room = maxLength - head.length - footer.length - 10;
  let explanation = m.explanation;
  if (room < 40) explanation = "";
  else if (explanation.length > room) explanation = `${explanation.slice(0, room - 1).replace(/\s+\S*$/, "")}…`;
  return [head, explanation ? `💡 ${escapeHtml(explanation)}` : "", footer].filter(Boolean).join("\n");
}

export function formatTestMessage(now = new Date()): string {
  return `<b>${EVENT_LABELS.test}</b>\nMarjane Deals Watcher est correctement connecté à Telegram.\n🕒 ${formatMoroccoTime(now)}`;
}
