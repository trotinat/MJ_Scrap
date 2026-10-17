import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { DEAL_CLASS_LABELS, type DealClass } from "@mdw/shared";
import { isStale, relativeTime, STOCK_LABELS } from "@/lib/format";

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-col gap-3 border-b border-paper-line pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-display text-[1.9rem] font-extrabold leading-tight tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[0.95rem] text-ink-mute">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className, title, actions }: { children: ReactNode; className?: string; title?: string; actions?: ReactNode }) {
  return (
    <section className={cx("rounded-[1.35rem] border border-paper-line bg-paper-card card-soft", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between border-b border-paper-line px-5 py-3">
          {title && <h2 className="font-display text-base font-semibold text-ink">{title}</h2>}
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function StatCard({ label, value, hint, icon: Icon, tone = "slate" }: { label: string; value: ReactNode; hint?: ReactNode; icon: LucideIcon; tone?: "slate" | "green" | "amber" | "red" | "blue" }) {
  const tones = {
    slate: "bg-paper text-ink-soft",
    green: "bg-proof-soft text-proof",
    amber: "bg-tag-soft text-ink",
    red: "bg-promo-soft text-promo",
    blue: "bg-brand-50 text-ink",
  };
  return (
    <div className="rounded-[1.35rem] border border-paper-line bg-paper-card p-4 card-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-ink-mute">{label}</p>
          <p className="num mt-1 truncate font-display text-2xl font-bold text-ink">{value}</p>
          {hint && <p className="mt-1 text-xs text-ink-mute">{hint}</p>}
        </div>
        <span className={cx("rounded-lg p-2", tones[tone])}>
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      </div>
    </div>
  );
}

const BADGE_TONES = {
  slate: "bg-paper text-ink-soft ring-paper-line",
  green: "bg-proof-soft text-proof ring-proof/20",
  amber: "bg-tag-soft text-ink ring-tag-deep/40",
  red: "bg-promo-soft text-promo ring-promo/20",
  blue: "bg-brand-50 text-ink ring-paper-line",
  violet: "bg-ink text-tag ring-ink",
} as const;
export type Tone = keyof typeof BADGE_TONES;

export function Badge({ children, tone = "slate", title }: { children: ReactNode; tone?: Tone; title?: string }) {
  return (
    <span title={title} className={cx("inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", BADGE_TONES[tone])}>
      {children}
    </span>
  );
}

const CLASS_TONE: Record<DealClass, Tone> = { exceptional: "violet", very_good: "green", interesting: "blue", ordinary: "slate" };

export function ScoreBadge({ score, dealClass }: { score: number; dealClass: string }) {
  const c = (dealClass in CLASS_TONE ? dealClass : "ordinary") as DealClass;
  return (
    <Badge tone={CLASS_TONE[c]} title={DEAL_CLASS_LABELS[c]}>
      {DEAL_CLASS_LABELS[c]} <span className="num opacity-70">{score}</span>
    </Badge>
  );
}

export function StockBadge({ stock }: { stock: string }) {
  const tone: Tone = stock === "in_stock" ? "green" : stock === "out_of_stock" ? "red" : "slate";
  return <Badge tone={tone}>{STOCK_LABELS[stock] ?? stock}</Badge>;
}

export function FreshnessBadge({ at, staleAfterHours }: { at: Date | string | null; staleAfterHours: number }) {
  const stale = isStale(at, staleAfterHours);
  return (
    <Badge tone={stale ? "amber" : "slate"} title={stale ? "Donnée ancienne : pas d'observation récente" : "Dernière observation"}>
      {stale ? "Données anciennes · " : "Vu "}
      {relativeTime(at)}
    </Badge>
  );
}

export function EmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[1.35rem] border border-dashed border-paper-line bg-paper-card px-6 py-12 text-center">
      <Icon className="h-8 w-8 text-ink-mute" aria-hidden />
      <p className="mt-3 font-display text-base font-semibold text-ink">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-ink-mute">{children}</div>}
    </div>
  );
}

export const btn = {
  primary:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
  secondary:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-paper-line bg-paper-card px-4 py-2 text-sm font-semibold text-ink hover:border-brand-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 disabled:opacity-60",
  danger:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-promo/30 bg-paper-card px-4 py-2 text-sm font-semibold text-promo hover:bg-promo-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-promo disabled:opacity-60",
  ghost: "inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2.5 py-1 text-sm font-semibold text-brand-700 hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600",
};

export const input =
  "block w-full rounded-xl border border-paper-line bg-paper-card px-3 py-2 text-sm text-ink placeholder:text-ink-mute focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100";
export const label = "mb-1 block text-sm font-medium text-ink";

export function Field({ label: l, hint, error, children, htmlFor }: { label: string; hint?: string; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label className={label} htmlFor={htmlFor}>
        {l}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-ink-mute">{hint}</p>}
      {error && <p className="mt-1 text-xs text-promo">{error}</p>}
    </div>
  );
}

export function ProductImage({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  if (!src) {
    return <div className={cx("flex items-center justify-center bg-paper text-xs text-ink-mute", className)}>Pas d'image</div>;
  }
  // Plain <img>: images are hot-linked from the shop, with no referrer sent.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" className={cx("bg-white object-contain", className)} />;
}
