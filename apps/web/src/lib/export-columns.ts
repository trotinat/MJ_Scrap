import { DEAL_CLASS_LABELS, formatMoroccoTime, type DealClass } from "@mdw/shared";
import type { ExportColumn } from "./export";
import type { DealRow } from "./queries";

const mad = (c: number | null) => (c === null ? null : c / 100);

export const EXPORT_COLUMNS: ExportColumn<DealRow>[] = [
  { header: "Produit", value: (r) => r.title, width: 60 },
  { header: "Marque", value: (r) => r.brand },
  { header: "Vendeur", value: (r) => r.seller },
  { header: "Prix (MAD)", value: (r) => mad(r.current_price_cents), width: 12 },
  { header: "Prix barré annoncé (MAD)", value: (r) => mad(r.original_price_cents), width: 14 },
  { header: "Remise annoncée (%)", value: (r) => r.advertised_discount_pct, width: 12 },
  { header: "Prix précédent observé (MAD)", value: (r) => mad(r.prev_price_cents), width: 14 },
  { header: "Évolution observée (%)", value: (r) => r.drop_pct, width: 12 },
  { header: "Plus bas observé (MAD)", value: (r) => mad(r.min_price_cents), width: 14 },
  { header: "Score", value: (r) => r.score, width: 8 },
  { header: "Classement", value: (r) => DEAL_CLASS_LABELS[(r.matches[0]?.dealClass ?? "ordinary") as DealClass] },
  { header: "Critères", value: (r) => r.matches.map((m) => m.name).join(", "), width: 30 },
  { header: "Disponibilité", value: (r) => r.stock_status },
  { header: "Dernier relevé (heure du Maroc)", value: (r) => formatMoroccoTime(r.last_success_at), width: 20 },
  { header: "Catégorie", value: (r) => r.category_path, width: 30 },
  { header: "URL", value: (r) => r.url, width: 60 },
  { header: "Explication", value: (r) => r.matches[0]?.explanation, width: 80 },
];

