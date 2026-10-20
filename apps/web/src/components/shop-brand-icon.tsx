import Image from "next/image";
import { Store } from "lucide-react";

const LOGOS = [
  { name: "marjane mall", host: "marjanemall.ma", src: "/brands/marjane-mark.png", alt: "Marjane Mall" },
  { name: "urban jungle maroc", host: "ma.urbanjunglestore.com", src: "/brands/urban-jungle-mark.svg", alt: "Urban Jungle Maroc" },
];

const SHOP_LABELS: Array<{ label: string; names: string[]; hosts: string[] }> = [
  { label: "Marjane Mall", names: ["marjane mall"], hosts: ["marjanemall.ma"] },
  { label: "Urban Jungle Maroc", names: ["urban jungle", "urban jungle maroc"], hosts: ["ma.urbanjunglestore.com"] },
  { label: "Kitea", names: ["kitea", "kitea maroc", "kitea ma"], hosts: ["kitea.com", "kitea.ma"] },
  { label: "City Fashion", names: ["city fashion", "cityfashion"], hosts: ["cityfashion.ma"] },
];

/** Consistent boutique name from a saved shop name, shop ID, or product URL. */
export function shopDisplayName(name?: string | null, url?: string | null, shopId?: string | null) {
  const normalized = name?.trim().toLowerCase() ?? "";
  const id = shopId?.trim().toLowerCase() ?? "";
  let host = "";
  try { host = url ? new URL(url).hostname.replace(/^www\./, "").toLowerCase() : ""; } catch { /* Keep the supplied name when a URL is malformed. */ }
  return SHOP_LABELS.find((shop) => shop.names.includes(normalized) || shop.hosts.includes(host) || (shop.label === "Kitea" && (id === "kitea" || id === "kitea-ma")))?.label ?? name?.trim() ?? (host || "Boutique");
}

/** Logo of a known boutique, found by its name or by the offer's site. */
export function shopLogo(name?: string | null, url?: string | null) {
  let host: string | null = null;
  try { host = url ? new URL(url).hostname.replace(/^www\./, "") : null; } catch { /* Fall back to matching the saved name. */ }
  return LOGOS.find((l) => l.name === name?.trim().toLowerCase() || l.host === host) ?? null;
}

export function ShopBrandIcon({ name, className }: { name: string; className: string }) {
  const logo = shopLogo(name);
  if (logo) return <Image src={logo.src} alt="" aria-hidden="true" width={40} height={40} unoptimized={logo.src.endsWith(".svg")} className={`${className} object-contain`} />;
  return <Store className={className} aria-hidden="true" />;
}
