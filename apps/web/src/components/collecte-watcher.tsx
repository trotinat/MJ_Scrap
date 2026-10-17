"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, X } from "lucide-react";

interface Status {
  running: boolean;
  pending: boolean;
  lastRunId: string | null;
  lastStatus: string | null;
  stats: { cardsSeen?: number; offersProcessed?:number; detailCacheHits?:number; matches?: number; newOffers?: number; priceDrops?: number } | null;
}

/** Event any "Vérifier maintenant" button fires so the watcher starts at once. */
export const RUN_REQUESTED_EVENT = "mdw:run-requested";

const POLL_MS = 2500;

/**
 * Global collection watcher: shows a loading banner while a run is in progress
 * and, the moment it finishes, refreshes the page data and shows a short
 * summary toast. Idle (no polling) until a run is active or requested.
 */
export function CollecteWatcher() {
  const router = useRouter();
  const [progress,setProgress]=useState<Status["stats"]>(null);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<Status["stats"] | null>(null);
  const [lastStatus, setLastStatus] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const sawRunning = useRef(false);
  const lastRefresh=useRef(0);

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/run-status", { cache: "no-store" });
      if (!res.ok) return;
      const s: Status = await res.json();
      setRunning(s.running);
      if(s.running) setProgress(s.stats);
      if (s.running) {
        sawRunning.current = true;
        if(Date.now()-lastRefresh.current>=15000){lastRefresh.current=Date.now();router.refresh();}
        if (!timer.current) timer.current = setInterval(poll, POLL_MS);
      } else if (sawRunning.current) {
        // A run we were watching just finished.
        sawRunning.current = false;
        stop();
        setDone(s.stats ?? {});
        setLastStatus(s.lastStatus);
        router.refresh();
        setTimeout(() => setDone(null), 8000);
      }
    } catch {
      /* transient network error: keep polling */
    }
  }, [router, stop]);

  const start = useCallback(() => {
    sawRunning.current = true; // optimistic: a run was just requested
    setRunning(true);
    if (!timer.current) timer.current = setInterval(poll, POLL_MS);
    void poll();
  }, [poll]);

  useEffect(() => {
    // One check on mount; only keep polling if something is actually running.
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/run-status", { cache: "no-store" });
        if (!mounted || !res.ok) return;
        const s: Status = await res.json();
        if (s.running) {
          sawRunning.current = true;
          setRunning(true);
          if (!timer.current) timer.current = setInterval(poll, POLL_MS);
        }
      } catch {
        /* ignore */
      }
    })();
    const onReq = () => start();
    const idleTimer = setInterval(() => void poll(), 30_000);
    window.addEventListener(RUN_REQUESTED_EVENT, onReq);
    return () => {
      mounted = false;
      window.removeEventListener(RUN_REQUESTED_EVENT, onReq);
      stop();
      clearInterval(idleTimer);
    };
  }, [poll, start, stop]);

  if (!running && !done) return null;

  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 lg:bottom-6">
      {running ? (
        <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-forest-line bg-forest px-4 py-2.5 text-sm font-medium text-white shadow-lg">
          <Loader2 className="h-4 w-4 animate-spin text-tag" aria-hidden />
          <span>Collecte en cours{progress?.offersProcessed ? ` · ${progress.offersProcessed} offres disponibles` : "… lecture des pages Marjane Mall"}{progress?.detailCacheHits ? ` · ${progress.detailCacheHits} fiches réutilisées` : ""}</span>
        </div>
      ) : done ? (
        <div className={`pointer-events-auto flex items-center gap-3 rounded-full border px-4 py-2.5 text-sm font-medium text-white shadow-lg ${lastStatus === 'success' ? 'border-proof/30 bg-proof' : 'border-tag-deep bg-forest'}`}>
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          <span>
            {lastStatus === 'success' ? 'Collecte terminée' : lastStatus === 'partial' ? 'Collecte partielle · certaines pages non vérifiées' : 'Collecte non terminée · voir les détails'}
            {done?.cardsSeen != null && <span className="opacity-90"> · {done.cardsSeen} produits lus</span>}
            {done?.newOffers ? <span className="opacity-90"> · {done.newOffers} nouveautés</span> : null}
          </span>
          <button type="button" onClick={() => setDone(null)} className="rounded-full p-0.5 hover:bg-white/20" aria-label="Fermer">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
