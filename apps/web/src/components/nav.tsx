"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Activity,
  Bell,
  History,
  LayoutDashboard,
  LineChart,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  Tag,
  X,
  Zap,
} from "lucide-react";
import { cx } from "./ui";

const LINKS = [
  { href: "/", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/criteres", label: "Mes critères de recherche", icon: Search },
  { href: "/promotions", label: "Promotions détectées", icon: Tag },
  { href: "/ventes-flash", label: "Ventes flash", icon: Zap },
  { href: "/historique-prix", label: "Historique des prix", icon: LineChart },
  { href: "/notifications", label: "Notifications Telegram", icon: Bell },
  { href: "/collectes", label: "Historique des collectes", icon: History },
  { href: "/parametres", label: "Paramètres", icon: Settings },
  { href: "/admin", label: "Administration et santé", icon: ShieldCheck },
];

export function Nav({ email, logout }: { email: string; logout: () => Promise<void> }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const links = (
    <nav className="flex flex-1 flex-col gap-1 p-3">
      {LINKS.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          onClick={() => setOpen(false)}
          className={cx(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            isActive(href) ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
          )}
          aria-current={isActive(href) ? "page" : undefined}
        >
          <Icon className="h-4 w-4 shrink-0" aria-hidden />
          {label}
        </Link>
      ))}
    </nav>
  );

  const footer = (
    <div className="border-t border-slate-200 p-3">
      <p className="truncate px-3 text-xs text-slate-500" title={email}>
        {email}
      </p>
      <form action={logout}>
        <button type="submit" className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-100">
          Se déconnecter
        </button>
      </form>
    </div>
  );

  const brand = (
    <Link href="/" className="flex items-center gap-2 px-6 py-5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
        <Activity className="h-4 w-4" aria-hidden />
      </span>
      <span className="text-sm font-semibold leading-tight text-slate-900">
        Marjane
        <br />
        Deals Watcher
      </span>
    </Link>
  );

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <span className="text-sm font-semibold">Marjane Deals Watcher</span>
        <button type="button" onClick={() => setOpen(true)} className="rounded-md p-2 text-slate-600 hover:bg-slate-100" aria-label="Ouvrir le menu">
          <Menu className="h-5 w-5" />
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between pr-3">
              {brand}
              <button type="button" onClick={() => setOpen(false)} className="rounded-md p-2 text-slate-600 hover:bg-slate-100" aria-label="Fermer le menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            {links}
            {footer}
          </aside>
        </div>
      )}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
        {brand}
        {links}
        {footer}
      </aside>
    </>
  );
}
