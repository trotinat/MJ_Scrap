import { normalizeText } from "./text";

/**
 * Normalized technical facets extracted from a product title and its
 * "Description produit" label/value list. Only facets that can be extracted
 * with reasonable confidence are set; everything else stays undefined so that
 * missing data is never mistaken for a match.
 */
export interface NormalizedSpecs {
  screen_size_in?: number;
  resolution?: Resolution;
  panel?: string;
  ram_gb?: number;
  storage_gb?: number;
  storage_type?: "SSD" | "HDD" | "EMMC";
  refresh_hz?: number;
  hdmi_ports?: number;
  smart_tv?: boolean;
  power_w?: number;
  capacity_l?: number;
  battery_mah?: number;
}

export type Resolution = "HD" | "FHD" | "QHD" | "4K" | "8K";
export const RESOLUTION_RANK: Record<Resolution, number> = { HD: 1, FHD: 2, QHD: 3, "4K": 4, "8K": 5 };

export type SpecAttributeKind = "number" | "resolution" | "text" | "boolean";

export interface SpecAttributeDef {
  key: string;
  label: string;
  kind: SpecAttributeKind;
  unit?: string;
}

/** Attributes the UI offers for mandatory requirements / preferred specs. */
export const SPEC_ATTRIBUTES: readonly SpecAttributeDef[] = [
  { key: "screen_size_in", label: "Taille d'écran", kind: "number", unit: "pouces" },
  { key: "resolution", label: "Résolution (HD, FHD, QHD, 4K, 8K)", kind: "resolution" },
  { key: "panel", label: "Technologie d'écran (QLED, OLED, Mini LED…)", kind: "text" },
  { key: "smart_tv", label: "Smart TV", kind: "boolean" },
  { key: "refresh_hz", label: "Fréquence de rafraîchissement", kind: "number", unit: "Hz" },
  { key: "hdmi_ports", label: "Ports HDMI", kind: "number" },
  { key: "ram_gb", label: "Mémoire vive (RAM)", kind: "number", unit: "Go" },
  { key: "storage_gb", label: "Stockage", kind: "number", unit: "Go" },
  { key: "storage_type", label: "Type de stockage (SSD, HDD, eMMC)", kind: "text" },
  { key: "power_w", label: "Puissance", kind: "number", unit: "W" },
  { key: "capacity_l", label: "Capacité", kind: "number", unit: "L" },
  { key: "battery_mah", label: "Batterie", kind: "number", unit: "mAh" },
  { key: "text", label: "Texte libre (titre + fiche technique)", kind: "text" },
] as const;

export const SPEC_ATTRIBUTE_KEYS = SPEC_ATTRIBUTES.map((a) => a.key) as [string, ...string[]];

export function specAttribute(key: string): SpecAttributeDef | undefined {
  return SPEC_ATTRIBUTES.find((a) => a.key === key);
}

function num(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

function specValue(specs: Record<string, string>, labelPatterns: RegExp[]): string | undefined {
  for (const [label, value] of Object.entries(specs)) {
    const nl = normalizeText(label);
    if (labelPatterns.some((p) => p.test(nl))) return value;
  }
  return undefined;
}

function detectResolution(text: string): Resolution | undefined {
  if (/\b8k\b/i.test(text) || /7680\s*x\s*4320/i.test(text)) return "8K";
  if (/\b(4k|uhd|ultra\s*hd)\b/i.test(text) || /3840\s*x\s*2160/i.test(text)) return "4K";
  if (/\b(qhd|wqhd|2k)\b/i.test(text) || /2560\s*x\s*1440/i.test(text)) return "QHD";
  if (/\b(fhd|full\s*hd|1080p)\b/i.test(text) || /1920\s*x\s*1080/i.test(text)) return "FHD";
  if (/\bhd\b(?!\s*r)|\b720p\b/i.test(text) || /1366\s*x\s*768/i.test(text)) return "HD";
  return undefined;
}

function detectPanel(text: string): string | undefined {
  if (/neo\s*qled/i.test(text)) return "NEO QLED";
  if (/\bqled\b/i.test(text)) return "QLED";
  if (/\boled\b/i.test(text)) return "OLED";
  if (/mini[\s-]*led/i.test(text)) return "MINI LED";
  if (/nanocell/i.test(text)) return "NANOCELL";
  if (/\bled\b/i.test(text)) return "LED";
  return undefined;
}

function toGb(value: number, unit: string): number {
  return /^(to|tb)$/i.test(unit) ? value * 1024 : value;
}

/**
 * Extracts normalized facets. `title` is the product name, `specs` the raw
 * label/value pairs from the product page (may be empty for listing cards).
 */
export function extractSpecs(title: string, specs: Record<string, string> = {}): NormalizedSpecs {
  const specText = Object.entries(specs)
    .map(([k, v]) => `${k}: ${v}`)
    .join(" | ");
  const all = `${title.replace(/&quot;/g, '"')} | ${specText}`;
  const out: NormalizedSpecs = {};

  // Screen size — prefer the spec table, fall back to the title.
  const sizeSpec = specValue(specs, [/diagonale/, /taille (de l )?ecran/, /taille ecran/, /ecran/]);
  const sizeRe = /(\d{2,3}(?:[.,]\d)?)\s*(?:"|''|”|pouces?\b|inch(?:es)?\b|po\b)/i;
  const sizeMatch = (sizeSpec && sizeRe.exec(sizeSpec + '"')) || sizeRe.exec(all);
  const size = num(sizeMatch?.[1]);
  if (size !== undefined && size >= 5 && size <= 120) out.screen_size_in = size;

  const resSpec = specValue(specs, [/resolution/]);
  out.resolution = (resSpec && detectResolution(resSpec)) || detectResolution(all);
  if (!out.resolution) delete out.resolution;

  const panel = detectPanel(all);
  if (panel) out.panel = panel;

  const ramSpec = specValue(specs, [/^ram$/, /memoire vive/, /\bram\b/]);
  const ramMatch =
    (ramSpec && /(\d{1,3})\s*(go|gb)/i.exec(ramSpec)) ||
    /(\d{1,3})\s*(?:go|gb)\s*(?:de\s*)?(?:ram|ddr\d?x?|lpddr\d?x?)\b/i.exec(all) ||
    /\bram\s*:?\s*(\d{1,3})\s*(?:go|gb)/i.exec(all);
  const ram = num(ramMatch?.[1]);
  if (ram !== undefined && ram > 0 && ram <= 256) out.ram_gb = ram;

  const storageSpec = specValue(specs, [/stockage/, /disque/, /capacite (de )?stockage/, /memoire interne/, /\bssd\b/]);
  const storageMatch =
    (storageSpec && /(\d{1,4})\s*(go|gb|to|tb)/i.exec(storageSpec)) ||
    /(\d{1,4})\s*(go|gb|to|tb)\s*(?:de\s*)?(?:ssd|hdd|emmc|nvme|stockage|m\.2)/i.exec(all) ||
    /(?:ssd|hdd|emmc|nvme)\s*(?:de\s*)?:?\s*(\d{1,4})\s*(go|gb|to|tb)/i.exec(all);
  if (storageMatch) {
    const v = num(storageMatch[1]);
    if (v !== undefined && storageMatch[2]) out.storage_gb = toGb(v, storageMatch[2]);
  }
  if (/\b(ssd|nvme)\b/i.test(all)) out.storage_type = "SSD";
  else if (/\bhdd\b|disque dur/i.test(all)) out.storage_type = "HDD";
  else if (/\bemmc\b/i.test(all)) out.storage_type = "EMMC";

  const hz = num(/(\d{2,3})\s*hz\b/i.exec(all)?.[1]);
  if (hz !== undefined && hz >= 24 && hz <= 540) out.refresh_hz = hz;

  const hdmiSpec = specValue(specs, [/ports? hdmi/, /\bhdmi\b/]);
  const hdmi = num(hdmiSpec && /(\d{1,2})/.exec(hdmiSpec)?.[1]);
  if (hdmi !== undefined) out.hdmi_ports = hdmi;

  const tvType = specValue(specs, [/type de televiseur/]);
  if ((tvType && /smart/i.test(tvType)) || /smart\s*tv|android\s*tv|google\s*tv|tizen|webos/i.test(all)) {
    out.smart_tv = true;
  }

  const power = num(/(\d{2,5})\s*w\b/i.exec(all)?.[1]);
  if (power !== undefined) out.power_w = power;

  const capacity = num(/(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:l|litres?)\b/i.exec(all)?.[1]);
  if (capacity !== undefined && capacity > 0 && capacity < 1000) out.capacity_l = capacity;

  const battery = num(/(\d{3,6})\s*mah\b/i.exec(all)?.[1]);
  if (battery !== undefined) out.battery_mah = battery;

  return out;
}

/** Human readable French rendering of a facet for explanations. */
export function describeSpec(key: string, value: unknown): string {
  switch (key) {
    case "screen_size_in":
      return `écran ${value} pouces`;
    case "resolution":
      return `résolution ${value}`;
    case "panel":
      return `dalle ${value}`;
    case "ram_gb":
      return `${value} Go de RAM`;
    case "storage_gb":
      return Number(value) >= 1024 && Number(value) % 1024 === 0 ? `${Number(value) / 1024} To de stockage` : `${value} Go de stockage`;
    case "storage_type":
      return `stockage ${value}`;
    case "refresh_hz":
      return `${value} Hz`;
    case "hdmi_ports":
      return `${value} ports HDMI`;
    case "smart_tv":
      return value ? "Smart TV" : "non Smart TV";
    case "power_w":
      return `${value} W`;
    case "capacity_l":
      return `${value} L`;
    case "battery_mah":
      return `batterie ${value} mAh`;
    default:
      return `${key} ${String(value)}`;
  }
}
