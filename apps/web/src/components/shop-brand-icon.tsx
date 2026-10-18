import Image from "next/image";
import { Store } from "lucide-react";

export function ShopBrandIcon({ name, className }: { name: string; className: string }) {
  if (name.trim().toLowerCase() === "marjane mall") {
    return <Image src="/brands/marjane-mark.png" alt="" aria-hidden="true" width={40} height={40} className={`${className} object-contain`} />;
  }
  return <Store className={className} aria-hidden="true" />;
}
