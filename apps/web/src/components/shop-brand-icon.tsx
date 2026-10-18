import Image from "next/image";
import { Store } from "lucide-react";

const LOGOS = [
  { name: "marjane mall", host: "marjanemall.ma", src: "/brands/marjane-mark.png", alt: "Marjane Mall" },
  { name: "urban jungle maroc", host: "ma.urbanjunglestore.com", src: "/brands/urban-jungle-mark.svg", alt: "Urban Jungle Maroc" },
];

/** Logo of a known boutique, found by its name or by the offer's site. */
export function shopLogo(name?: string | null, url?: string | null) {
  const host = url ? new URL(url).hostname.replace(/^www\./, "") : null;
  return LOGOS.find((l) => l.name === name?.trim().toLowerCase() || l.host === host) ?? null;
}

export function ShopBrandIcon({ name, className }: { name: string; className: string }) {
  const logo = shopLogo(name);
  if (logo) return <Image src={logo.src} alt="" aria-hidden="true" width={40} height={40} unoptimized={logo.src.endsWith(".svg")} className={`${className} object-contain`} />;
  return <Store className={className} aria-hidden="true" />;
}
