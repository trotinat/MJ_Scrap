"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Activity, Bell, History, LineChart, MoreHorizontal, Search, Settings, ShieldCheck, Tag, X, Zap, Home } from "lucide-react";
import { cx } from "./ui";

/** What people come for, in the order they use it. */
const PRIMARY = [
  { href: "/", label: "Bons plans", icon: Home },
  { href: "/ventes-flash", label: "Offres", icon: Zap },
  { href: "/criteres", label: "Recherches", icon: Search },
  { href: "/notifications", label: "Alertes", icon: Bell },
];
/** Tools and maintenance. */
const SECONDARY = [
  { href: "/promotions", label: "Offres trouvées", icon: Tag },
  { href: "/historique-prix", label: "Historique des prix", icon: LineChart },
  { href: "/collectes", label: "Collectes", icon: History },
  { href: "/parametres", label: "Paramètres", icon: Settings },
  { href: "/admin", label: "État du système", icon: ShieldCheck },
];

export function Nav({ email, logout }: { email: string; logout: (() => Promise<void>) | null }) {
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [pathname]);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const secondaryActive = SECONDARY.some((l) => isActive(l.href));

  const brand = (
    <Link href="/" className="flex items-center gap-2.5 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-tag-deep">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-tag text-ink">
        <Activity className="h-5 w-5" aria-hidden />
      </span>
      <span className="font-display text-lg font-bold leading-none text-ink">
        Bons plans
        <span className="block text-xs font-medium text-ink-mute">Marjane Mall</span>
      </span>
    </Link>
  );

  const item = ({ href, label, icon: Icon }: (typeof PRIMARY)[number]) => (
    <Link
      key={href}
      href={href}
      aria-current={isActive(href) ? "page" : undefined}
      className={cx(
        "flex items-center gap-3 rounded-xl px-3 py-2 text-[0.95rem] focus:outline-none focus-visible:ring-2 focus-visible:ring-tag-deep",
        isActive(href) ? "bg-ink font-semibold text-white" : "text-ink-soft hover:bg-paper hover:text-ink",
      )}
    >
      <Icon className={cx("h-[18px] w-[18px]", isActive(href) && "text-tag")} aria-hidden />
      {label}
    </Link>
  );

  const account = (
    <div className="px-3 text-xs text-ink-mute">
      <p className="truncate" title={email}>
        {email}
      </p>
      {logout ? (
        <form action={logout}>
          <button type="submit" className="mt-1 font-medium text-ink-soft hover:text-ink">
            Se déconnecter
          </button>
        </form>
      ) : (
        <p className="mt-0.5">Accès local sans connexion</p>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop: quiet rail */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-paper-line bg-paper-card lg:flex">
        <div className="px-5 pb-4 pt-5">{brand}</div>
        <nav className="flex flex-col gap-1 px-3" aria-label="Navigation principale">
          {PRIMARY.map(item)}
        </nav>
        <p className="mt-6 px-6 pb-1 text-xs font-medium text-ink-mute">Outils</p>
        <nav className="flex flex-col gap-0.5 px-3" aria-label="Outils">
          {SECONDARY.map(item)}
        </nav>
        <div className="mt-auto border-t border-paper-line py-4">{account}</div>
      </aside>

      {/* Mobile: top bar with brand, bottom tab bar with the main sections */}
      <header className="sticky top-0 z-30 flex h-14 items-center border-b border-paper-line bg-paper-card/95 px-4 backdrop-blur lg:hidden">
        {brand}
      </header>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-paper-line bg-paper-card pb-[env(safe-area-inset-bottom)] lg:hidden"
        aria-label="Navigation principale"
      >
        {PRIMARY.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(href) ? "page" : undefined}
            className={cx("flex flex-col items-center gap-0.5 py-2 text-[11px]", isActive(href) ? "font-semibold text-ink" : "text-ink-mute")}
          >
            <span className={cx("rounded-full px-3 py-0.5", isActive(href) && "bg-tag")}>
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            {label}
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setMore(true)}
          aria-expanded={more}
          className={cx("flex flex-col items-center gap-0.5 py-2 text-[11px]", secondaryActive ? "font-semibold text-ink" : "text-ink-mute")}
        >
          <span className={cx("rounded-full px-3 py-0.5", secondaryActive && "bg-tag")}>
            <MoreHorizontal className="h-5 w-5" aria-hidden />
          </span>
          Plus
        </button>
      </nav>

      {more && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Plus d'outils">
          <button type="button" className="absolute inset-0 bg-ink/40" aria-label="Fermer" onClick={() => setMore(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-paper-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="mb-2 flex items-center justify-between px-2">
              <p className="font-display text-lg font-bold">Outils</p>
              <button type="button" onClick={() => setMore(false)} className="rounded-full p-2 hover:bg-paper" aria-label="Fermer">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex flex-col gap-1">{SECONDARY.map(item)}</nav>
            <div className="mt-4 border-t border-paper-line pt-3">{account}</div>
          </div>
        </div>
      )}
    </>
  );
}
