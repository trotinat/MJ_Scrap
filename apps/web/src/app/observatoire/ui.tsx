"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowDownToLine, ArrowLeft, Boxes, Check, ChevronRight, CircleHelp, Clock3, Cpu, Database, HardDrive, Layers3, RefreshCw, Server, ShieldCheck, Signal, Sparkles, Zap } from "lucide-react";

type Payload = {
  sampledAt: string;
  host: null | { cpu: { idle: number; total: number }; memory: { used: number; total: number } | null; disk: { used: number; total: number } | null; uptimeSeconds: number | null; network: { received: number; sent: number } };
  app: { db: string; worker: string; heartbeatAt: string | null; running: boolean; counts: { products: number; offers: number; observations: number; criteria: number; runs24h: number; errors24h: number }; notifications: { pending: number; sent: number }; activity: Array<{ hour: string; runs: number }>; recentRuns: Array<{ id: string; shopId: string; status: string; trigger: string; startedAt: string; finishedAt: string | null; durationMs: number | null; stats: Record<string, number>; error: string | null }> };
};
type Point = { at: number; cpu: number | null; ram: number | null; rx: number | null; tx: number | null };

const fmt = (n: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n);
const pct = (used: number, total: number) => total > 0 ? Math.min(100, Math.max(0, (used / total) * 100)) : 0;
const bytes = (value: number) => {
  if (!Number.isFinite(value)) return "—";
  const units = ["o", "Ko", "Mo", "Go", "To"];
  let n = value, i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: i > 1 ? 1 : 0 }).format(n)} ${units[i]}`;
};
const time = (value: string) => new Intl.DateTimeFormat("fr-FR", { timeZone: "Africa/Casablanca", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
const runLabel: Record<string, string> = { success: "Terminée", partial: "Partielle", failed: "Échec", running: "En cours" };

function MiniChart({ values, color, fill = false }: { values: Array<number | null>; color: string; fill?: boolean }) {
  const valid = values.filter((v): v is number => v !== null && Number.isFinite(v));
  const points = values.map((v, i) => `${values.length < 2 ? 100 : (i / (values.length - 1)) * 100},${v === null ? 34 : 38 - Math.min(100, Math.max(0, v)) * 0.3}`).join(" ");
  if (valid.length < 2) return <div className="ops-chart-empty"><span /></div>;
  return <svg viewBox="0 0 100 44" preserveAspectRatio="none" aria-hidden="true" className="ops-spark">
    {fill && <polygon points={`0,44 ${points} 100,44`} fill={color} opacity=".12" />}
    <polyline points={points} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

function MetricCard({ title, value, detail, icon: Icon, percent, values, tone }: { title: string; value: string; detail: string; icon: typeof Cpu; percent?: number | null; values: Array<number | null>; tone: string }) {
  return <article className="ops-metric">
    <div className="ops-metric-top"><span className={`ops-icon ${tone}`}><Icon size={17} /></span><span className="ops-mini-label">{title}</span><span className="ops-live-tag"><i /> LIVE</span></div>
    <div className="ops-metric-value">{value}</div>
    <div className="ops-metric-foot"><span>{detail}</span>{percent !== undefined && percent !== null && <span className="ops-percent">{percent.toFixed(0)}%</span>}</div>
    <MiniChart values={values} color={tone === "lime" ? "#c7fa69" : tone === "blue" ? "#68a8ff" : tone === "cyan" ? "#55e1d0" : "#d5a6ff"} fill />
  </article>;
}

function Health({ name, status, note }: { name: string; status: string; note: string }) {
  const ok = status === "online";
  return <div className="ops-health-row"><div className={`ops-health-icon ${ok ? "is-up" : "is-down"}`}>{ok ? <Check size={15} /> : <CircleHelp size={15} />}</div><div className="min-w-0"><p>{name}</p><span>{note}</span></div><strong className={ok ? "ok" : "down"}>{ok ? "OPÉRATIONNEL" : "À VÉRIFIER"}</strong></div>;
}

export function OpsDashboard() {
  const [data, setData] = useState<Payload | null>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const previous = useRef<{ at: number; host: Payload["host"] } | null>(null);

  const refresh = useCallback(async (manual = false) => {
    if (manual) setBusy(true);
    try {
      const response = await fetch("/api/ops", { cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 401 ? "Session expirée. Reconnectez-vous." : "Le serveur ne répond pas.");
      const next = await response.json() as Payload;
      const now = Date.now();
      const old = previous.current;
      const cpu = old?.host && next.host && next.host.cpu.total > old.host.cpu.total
        ? Math.max(0, Math.min(100, (1 - (next.host.cpu.idle - old.host.cpu.idle) / (next.host.cpu.total - old.host.cpu.total)) * 100)) : null;
      const rx = old?.host && next.host && now > old.at ? Math.max(0, (next.host.network.received - old.host.network.received) * 1000 / (now - old.at)) : null;
      const tx = old?.host && next.host && now > old.at ? Math.max(0, (next.host.network.sent - old.host.network.sent) * 1000 / (now - old.at)) : null;
      const ram = next.host?.memory ? pct(next.host.memory.used, next.host.memory.total) : null;
      previous.current = { at: now, host: next.host };
      setPoints((items) => [...items, { at: now, cpu, ram, rx, tx }].slice(-36));
      setData(next); setUpdated(new Date()); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Mesures momentanément indisponibles."); }
    finally { if (manual) setBusy(false); }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 10_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const host = data?.host;
  const values = useMemo(() => ({ cpu: points.map((p) => p.cpu), ram: points.map((p) => p.ram), rx: points.map((p) => p.rx), tx: points.map((p) => p.tx) }), [points]);
  const app = data?.app;
  const totalRunStats = app?.recentRuns[0]?.stats ?? {};
  const maxHourlyRuns = Math.max(1, ...(app?.activity.map((hour) => hour.runs) ?? []));
  const uptime = host?.uptimeSeconds ? `${Math.floor(host.uptimeSeconds / 86400)}j ${Math.floor((host.uptimeSeconds % 86400) / 3600)}h` : "En attente";

  return <div className="ops-shell">
    <aside className="ops-rail">
      <Link href="/" className="ops-brand"><span className="ops-brand-mark"><Activity size={20} /></span><span>HAWTA<span className="ops-brand-sub">CONTROL ROOM</span></span></Link>
      <div className="ops-rail-label">OBSERVABILITÉ</div>
      <a className="ops-rail-link active" href="#overview"><Signal size={17} /> Vue système <span className="ops-rail-pulse" /></a>
      <a className="ops-rail-link" href="#services"><Boxes size={17} /> Services</a>
      <a className="ops-rail-link" href="#activity"><Layers3 size={17} /> Activité collecteur</a>
      <div className="ops-rail-bottom"><div className="ops-rail-status"><span className={host ? "online" : "offline"} /><div><b>{host ? "VPS connecté" : "Connexion VPS"}</b><small>{host ? "Nuremberg · eu-central" : "Mesures en attente"}</small></div></div><Link href="/admin" className="ops-rail-link"><ShieldCheck size={17} /> Administration</Link><Link href="/" className="ops-rail-link"><ArrowLeft size={17} /> Retour à Hawta</Link></div>
    </aside>

    <main className="ops-main" id="overview">
      <header className="ops-topbar"><div className="ops-crumb"><span>HAWTA</span><ChevronRight size={14} /><b>Observatoire</b></div><div className="ops-top-actions"><span className="ops-secure"><ShieldCheck size={14} /> PRIVÉ · COMPTE CONNECTÉ</span><button className="ops-refresh" onClick={() => void refresh(true)} disabled={busy}><RefreshCw size={15} className={busy ? "ops-spin" : ""} /> <span>Actualiser</span></button></div></header>

      <section className="ops-heading"><div><div className="ops-kicker"><span className="ops-orbit"><i /><i /><i /></span> LIVE INFRASTRUCTURE MONITOR</div><h1>Observatoire <em>Hawta</em></h1><p>Une vue claire de votre VPS et de tout ce qui tourne dessus.</p></div><div className="ops-status-card"><div className="ops-status-orb"><Server size={22} /></div><div><small>ÉTAT GLOBAL</small><strong>{host && app?.db === "online" ? "Tout fonctionne" : "Synchronisation…"}</strong><span><i /> Actualisation automatique · 10 s</span></div></div></section>

      {error && <div className="ops-alert" role="status">{error}</div>}
      <div className="ops-section-line"><span>RESSOURCES VPS</span><span>{updated ? `MESURÉ À ${time(updated.toISOString())}` : "CONNEXION AUX CAPTEURS…"}</span></div>
      {!host && <div className="ops-agent-note"><Zap size={15} /> Les mesures machine apparaîtront après l’activation de l’agent VPS.</div>}
      <section className="ops-metrics-grid" aria-label="Ressources VPS">
        <MetricCard title="Processeur" value={points.at(-1)?.cpu === null || points.at(-1)?.cpu === undefined ? "—" : `${points.at(-1)!.cpu!.toFixed(0)}%`} detail="Charge instantanée" percent={points.at(-1)?.cpu} icon={Cpu} values={values.cpu} tone="lime" />
        <MetricCard title="Mémoire vive" value={host?.memory ? `${bytes(host.memory.used)} / ${bytes(host.memory.total)}` : "— / —"} detail={host?.memory ? `${bytes(host.memory.total - host.memory.used)} disponibles` : "Capteur indisponible"} percent={host?.memory ? pct(host.memory.used, host.memory.total) : null} icon={Layers3} values={values.ram} tone="blue" />
        <MetricCard title="Stockage système" value={host?.disk ? `${bytes(host.disk.used)} / ${bytes(host.disk.total)}` : "— / —"} detail={host?.disk ? `${bytes(host.disk.total - host.disk.used)} libres` : "Capteur indisponible"} percent={host?.disk ? pct(host.disk.used, host.disk.total) : null} icon={HardDrive} values={host?.disk ? points.map(() => pct(host.disk!.used, host.disk!.total)) : []} tone="cyan" />
        <MetricCard title="Réseau · réception" value={points.at(-1)?.rx == null ? "—" : `${bytes(points.at(-1)!.rx!)} /s`} detail={points.at(-1)?.tx == null ? `Uptime ${uptime}` : `Émission ${bytes(points.at(-1)!.tx!)} /s`} icon={ArrowDownToLine} values={values.rx} tone="violet" />
      </section>

      <div className="ops-section-line" id="services"><span>SERVICES & APPLICATION</span><span>{app?.running ? "COLLECTE EN COURS" : "MONITORING ACTIF"}</span></div>
      <section className="ops-middle-grid">
        <article className="ops-panel ops-service-panel"><div className="ops-panel-head"><div><div className="ops-panel-title"><Sparkles size={17} /> Cœur de la plateforme</div><p>Services qui font tourner votre radar</p></div><span className="ops-panel-live"><i /> CONTRÔLÉ EN DIRECT</span></div>
          <div className="ops-health-list"><Health name="Application Hawta" status="online" note="Interface & API · sécurisée" /><Health name="Base de données" status={app?.db ?? "offline"} note={`${fmt(app?.counts.observations ?? 0)} relevés de prix stockés`} /><Health name="Collecteur automatique" status={app?.worker ?? "offline"} note={app?.heartbeatAt ? `Dernier signal · ${time(app.heartbeatAt)}` : "En attente du premier signal"} /></div>
          <div className="ops-data-ribbon"><div><Database size={15} /><span>Base PostgreSQL</span><b>{fmt(app?.counts.products ?? 0)} produits</b></div><div><Boxes size={15} /><span>Catalogue actif</span><b>{fmt(app?.counts.offers ?? 0)} offres</b></div></div>
        </article>
        <article className="ops-panel ops-activity-card"><div className="ops-panel-head"><div><div className="ops-panel-title"><Activity size={17} /> Activité 24 h</div><p>Volume de travail du robot</p></div><span className="ops-activity-icon"><Zap size={17} /></span></div>
          <div className="ops-activity-number">{fmt(app?.counts.runs24h ?? 0)}<span> collectes</span></div>
          <div className="ops-activity-bars" aria-label="Collectes par heure sur les dernières 24 heures">{app?.activity.map((hour, index) => <i key={`${hour.hour}-${index}`} className={index === app.activity.length - 1 ? "today" : ""} title={`${hour.hour} · ${hour.runs} collecte${hour.runs > 1 ? "s" : ""}`} style={{ height: `${Math.max(4, (hour.runs / maxHourlyRuns) * 100)}%` }} />)}</div>
          <div className="ops-activity-foot"><span><i className="good" /> {fmt(app?.notifications.sent ?? 0)} alertes envoyées / 24 h</span><span className={(app?.counts.errors24h ?? 0) ? "warn" : ""}>{fmt(app?.counts.errors24h ?? 0)} erreurs</span></div>
        </article>
      </section>

      <div className="ops-section-line" id="activity"><span>DERNIÈRES COLLECTES</span><span>{app?.recentRuns.length ?? 0} ÉVÉNEMENTS RÉCENTS</span></div>
      <section className="ops-panel ops-runs-panel"><div className="ops-panel-head"><div><div className="ops-panel-title"><Clock3 size={17} /> Journal du collecteur</div><p>Les dernières opérations enregistrées sur la base</p></div><span className="ops-total"><span>{fmt(app?.counts.criteria ?? 0)}</span> critères actifs</span></div>
        <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>OPÉRATION</th><th>BOUTIQUE</th><th>HEURE</th><th>RÉSULTAT</th><th>DURÉE</th></tr></thead><tbody>{app?.recentRuns.map((run) => <tr key={run.id}><td><span className={`ops-run-dot ${run.status}`} />{runLabel[run.status] ?? run.status}</td><td>{run.shopId === "urban-jungle-ma" ? "Urban Jungle" : "Marjane Mall"}</td><td>{time(run.startedAt)}</td><td><span className={`ops-run-badge ${run.status}`}>{run.status === "success" ? "STABLE" : run.status === "running" ? "LIVE" : run.status === "partial" ? "PARTIEL" : "ÉCHEC"}</span></td><td>{run.durationMs ? `${(run.durationMs / 1000).toFixed(0)} s` : run.status === "running" ? "En cours" : "—"}</td></tr>)}{!app?.recentRuns.length && <tr><td colSpan={5} className="ops-empty">Aucune collecte enregistrée pour le moment.</td></tr>}</tbody></table></div>
        {totalRunStats.offersSeen !== undefined && <div className="ops-last-run-note"><span className="ops-run-dot success" /> Dernière collecte : <b>{fmt(totalRunStats.offersSeen)} offres explorées</b>{totalRunStats.offersUpserted !== undefined && <> · <b>{fmt(totalRunStats.offersUpserted)} mises à jour</b></>} {app?.recentRuns[0]?.error && <span className="ops-last-run-error">· {app.recentRuns[0].error}</span>}</div>}
      </section>
      <footer className="ops-footer"><span><span className="ops-footer-mark">H</span> HAWTA CONTROL ROOM <span className="ops-footer-dot">·</span> HAUTE DISPONIBILITÉ, HAUTE LISIBILITÉ</span><span><ShieldCheck size={13} /> DONNÉES PRIVÉES</span></footer>
    </main>
  </div>;
}
