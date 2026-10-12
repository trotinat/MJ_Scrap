"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ShoppingBag, Bell, History, LineChart, MoreHorizontal, Percent, Search, Settings, ShieldCheck, Tag, UserCog, X, Zap, Home } from "lucide-react";
import { cx } from "./ui";

/** What people come for, in the order they use it. */
const PRIMARY = [
  { href: "/", label: "Accueil", icon: Home },
  { href: "/ventes-flash", label: "Promos", icon: Zap },
  { href: "/criteres", label: "Recherches", icon: Search },
  { href: "/notifications", label: "Alertes", icon: Bell },
];
/** Tools and maintenance. */
const SECONDARY = [
  { href: "/profil", label: "Mon profil", icon: UserCog },
  { href: "/destockage", label: "Déstockage", icon: Percent },
  { href: "/promotions", label: "Résultats", icon: Tag },
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

  const brand = (dark: boolean) => (
    <Link href="/" className="flex items-center gap-3 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-tag">
      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-tag text-forest shadow-sm">
        <ShoppingBag className="h-5 w-5" aria-hidden />
      </span>
      <span className={cx("font-display text-xl font-semibold leading-none", dark ? "text-white" : "text-ink")}>
        Bons plans
        <span className={cx("mt-1 block font-sans text-[11px] font-medium uppercase tracking-wider", dark ? "text-white/55" : "text-ink-mute")}>Marjane Mall</span>
      </span>
    </Link>
  );

  const item = (dark: boolean) => ({ href, label, icon: Icon }: (typeof PRIMARY)[number]) => (
    <Link
      key={href}
      href={href}
      aria-current={isActive(href) ? "page" : undefined}
      className={cx(
        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[0.92rem] focus:outline-none focus-visible:ring-2 focus-visible:ring-tag",
        dark
          ? isActive(href)
            ? "bg-white/10 font-semibold text-white"
            : "text-white/70 hover:bg-white/5 hover:text-white"
          : isActive(href)
            ? "bg-ink font-semibold text-white"
            : "text-ink-soft hover:bg-paper hover:text-ink",
      )}
    >
      {dark && isActive(href) && <span className="absolute -left-3 top-2 bottom-2 w-1 rounded-r-full bg-tag" aria-hidden />}
      <Icon className={cx("h-[18px] w-[18px]", isActive(href) && (dark ? "text-tag" : "text-tag"))} aria-hidden />
      {label}
    </Link>
  );

  const account = (dark: boolean) => (
    <div className={cx("px-3 text-xs", dark ? "text-white/60" : "text-ink-mute")}>
      <p className="truncate" title={email}>
        {email}
      </p>
      {logout ? (
        <form action={logout}>
          <button type="submit" className={cx("mt-1 font-medium", dark ? "text-white/80 hover:text-white" : "text-ink-soft hover:text-ink")}>
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
      {/* Desktop: dark forest rail */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-forest lg:flex">
        <div className="px-6 pb-6 pt-7">{brand(true)}</div>
        <nav className="flex flex-col gap-1 px-3" aria-label="Navigation principale">
          {PRIMARY.map(item(true))}
        </nav>
        <p className="mt-8 px-6 pb-2 text-[11px] font-semibold uppercase tracking-widest text-white/35">Outils</p>
        <nav className="flex flex-col gap-0.5 px-3" aria-label="Outils">
          {SECONDARY.map(item(true))}
        </nav>
        <div className="mt-auto border-t border-forest-line py-4">{account(true)}</div>
      </aside>

      {/* Mobile: top bar with brand, bottom tab bar with the main sections */}
      <header className="sticky top-0 z-30 flex h-14 items-center border-b border-paper-line bg-paper-card/95 px-4 backdrop-blur lg:hidden">
        {brand(false)}
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
            className={cx("flex flex-col items-center gap-0.5 py-2 text-[11px] leading-tight", isActive(href) ? "font-semibold text-ink" : "text-ink-mute")}
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
            <nav className="flex flex-col gap-1">{SECONDARY.map(item(false))}</nav>
            <div className="mt-4 border-t border-paper-line pt-3">{account(false)}</div>
          </div>
        </div>
      )}
    </>
  );
}
