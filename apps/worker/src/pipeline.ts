import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import type pg from "pg";
import {
  dealMatches,
  getAppSettings,
  listingCrawls,
  getNotificationSettings,
  listCriteria,
  productOffers,
  scrapingErrors,
  scrapingRuns,
  SCRAPE_LOCK_KEY,
  withAdvisoryLock,
  workerStatus,
  type Db,
  type RunStats,
  type RunStatus,
  type RunTrigger,
} from "@mdw/database";
import { AccessBlockedError, detectBrand, extractModelRef, RobotsDisallowedError, type SiteAdapter } from "@mdw/scraper";
import { decideNotification, evaluate, type PreviousMatchState } from "@mdw/scoring";
import { anyPhraseMatches, madToCents, type AppSettings, type Criterion, type ListingItem, type ProductDetail } from "@mdw/shared";
import { enqueueNotification, formatDealMessage, processOutbox, type TelegramClient } from "@mdw/notifications";
import { applyMissingPolicy, markOfferGone, saveObservation, type OfferObservation } from "./persist";
import type { Logger } from "./logger";

export interface PipelineDeps {
  db: Db;
  pool: pg.Pool;
  adapter: SiteAdapter;
  logger: Logger;
  telegram: TelegramClient | null;
  workerId: string;
  now?: () => Date;
}

export interface RunOutcome {
  runId: string;
  status: RunStatus;
  stats: RunStats;
}

/**
 * Entry point for a scraping run. Holds a PostgreSQL advisory lock for the
 * whole run so two runs (scheduled + manual, or two workers) never overlap.
 */
export async function runScrape(deps: PipelineDeps, trigger: RunTrigger, scheduledFor: Date | null = null): Promise<RunOutcome> {
  const res = await withAdvisoryLock(deps.pool, SCRAPE_LOCK_KEY, () => doRun(deps, trigger, scheduledFor));
  if (res.acquired) return res.value;
  const [run] = await deps.db
    .insert(scrapingRuns)
    .values({
      trigger,
      status: "skipped",
      scheduledFor,
      finishedAt: new Date(),
      durationMs: 0,
      errorSummary: "Une autre collecte était déjà en cours : exécution ignorée.",
      workerId: deps.workerId,
    })
    .returning({ id: scrapingRuns.id });
  deps.logger.warn({ trigger }, "collecte ignorée : une autre est en cours");
  return { runId: run!.id, status: "skipped", stats: {} };
}

/** Light pre-filter on listing data so that only plausible candidates get a detail fetch. */
export function couldMatch(item: ListingItem, c: Criterion, seenOn: string[] = [item.listingPath]): boolean {
  const f = c.filters;
  const keywords = [...f.keywords, ...f.altKeywords];
  const title = `${item.title}`;
  if (keywords.length > 0 && !anyPhraseMatches(title, keywords)) {
    if (!(f.modelRef && title.toUpperCase().replace(/[^A-Z0-9]/g, "").includes(f.modelRef.toUpperCase().replace(/[^A-Z0-9]/g, "")))) {
      return false;
    }
  }
  if (keywords.length === 0 && f.categoryPaths.length > 0 && !f.categoryPaths.some((p) => seenOn.some((s) => s.startsWith(p)))) return false;
  if (item.priceCents !== null) {
    // Generous margins: the detail page is authoritative.
    if (f.maxPrice !== null && item.priceCents > madToCents(f.maxPrice) * 1.15) return false;
    if (f.minPrice !== null && item.priceCents < madToCents(f.minPrice) * 0.85) return false;
  }
  return true;
}

function fromDetail(d: ProductDetail, categoryPath: string | null, listingPath: string | null): OfferObservation {
  return {
    sourceId: d.sourceId,
    url: d.url,
    title: d.title,
    brand: d.brand,
    modelRef: d.modelRef,
    imageUrl: d.imageUrl,
    priceCents: d.priceCents,
    originalPriceCents: d.originalPriceCents,
    advertisedDiscountPct: d.advertisedDiscountPct,
    seller: d.seller,
    stock: d.stock,
    rating: d.rating,
    reviewCount: d.reviewCount,
    rawSpecs: d.rawSpecs,
    categoryPath,
    listingPath,
    source: "detail",
    extraction: d.extraction,
  };
}

function fromListing(i: ListingItem, categoryPath: string | null): OfferObservation {
  return {
    sourceId: i.sourceId,
    url: i.url,
    title: i.title,
    brand: detectBrand(i.title) ?? i.brand ?? null,
    modelRef: extractModelRef(i.title),
    imageUrl: i.imageUrl,
    priceCents: i.priceCents!,
    originalPriceCents: i.originalPriceCents,
    advertisedDiscountPct: i.advertisedDiscountPct,
    seller: i.seller,
    stock: "unknown",
    rating: i.rating,
    reviewCount: i.reviewCount,
    rawSpecs: {},
    categoryPath,
    listingPath: i.listingPath,
    source: "listing",
    extraction: "listing-card",
  };
}

async function doRun(deps: PipelineDeps, trigger: RunTrigger, scheduledFor: Date | null): Promise<RunOutcome> {
  const { db, adapter, logger } = deps;
  const now = deps.now ?? (() => new Date());
  const started = now();
  const stats: RunStats = {
    listingPaths: 0,
    listingPagesFetched: 0,
    cardsSeen: 0,
    detailFetches: 0,
    detailFailures: 0,
    newOffers: 0,
    priceDrops: 0,
    restocks: 0,
    markedMissing: 0,
    matches: 0,
    notificationsQueued: 0,
    notificationsSent: 0,
  };
  const errors: string[] = [];

  const [run] = await db
    .insert(scrapingRuns)
    .values({ trigger, status: "running", scheduledFor, startedAt: started, workerId: deps.workerId })
    .returning({ id: scrapingRuns.id });
  const runId = run!.id;
  await db.update(workerStatus).set({ currentRunId: runId }).where(eq(workerStatus.id, deps.workerId));
  const log = logger.child({ runId, trigger });
  log.info("collecte démarrée");

  // Recording an error must never break the run (e.g. a character the database refuses).
  const recordError = async (stage: string, message: string, url?: string | null, httpStatus?: number | null) => {
    errors.push(`${stage}: ${firstLine(message)}`);
    log.warn({ stage, url, httpStatus, err: message }, "erreur de collecte");
    try {
      await db.insert(scrapingErrors).values({ runId, stage, url: url ? toStorable(url) : null, httpStatus: httpStatus ?? null, message: toStorable(message).slice(0, 2000) });
    } catch (err) {
      log.error({ err: (err as Error).message }, "impossible d'enregistrer l'erreur de collecte");
    }
  };

  let status: RunStatus = "success";
  let fatal: string | null = null;

  try {
    const settings: AppSettings = await getAppSettings(db);
    const criteria = await listCriteria(db, { enabledOnly: true });
    // Promotion pages (Ventes flash…) are collected even without criteria.
    if (criteria.length === 0 && settings.dealPagePaths.length === 0) {
      fatal = "Aucun critère de recherche actif : rien à collecter. Créez ou activez un critère dans « Mes critères de recherche ».";
      status = "skipped";
    } else {
      const blocked = await collect(deps, runId, criteria, settings, stats, recordError, now, log);
      if (blocked) {
        // The site refused access: nothing more was requested, but what was
        // legitimately read before the refusal has been stored.
        stats.accessBlocked = blocked instanceof AccessBlockedError;
        fatal = `${blocked.message} La collecte s'est arrêtée sans contourner la protection${(stats.cardsSeen ?? 0) > 0 ? ` ; ${stats.cardsSeen} fiche(s) lues avant le refus ont été enregistrées.` : "."}`;
        await recordError("access", blocked.message, null, blocked instanceof AccessBlockedError ? blocked.status : null);
        status = (stats.cardsSeen ?? 0) > 0 ? "partial" : "failed";
      }
    }
  } catch (err) {
    if (err instanceof AccessBlockedError || err instanceof RobotsDisallowedError) {
      stats.accessBlocked = err instanceof AccessBlockedError;
      fatal = err.message;
      await recordError("access", err.message, null, err instanceof AccessBlockedError ? err.status : null);
    } else {
      fatal = `Erreur inattendue : ${firstLine((err as Error).message)}`;
      await recordError("pipeline", (err as Error).stack ?? (err as Error).message);
    }
    status = "failed";
  } finally {
    await adapter.close().catch(() => undefined);
  }

  if (status !== "failed" && errors.length > 0) status = "partial";

  // Deliver alerts queued by this run (and any pending retries).
  if (deps.telegram) {
    try {
      const ns = await getNotificationSettings(db);
      const settings = await getAppSettings(db);
      if (ns.enabled && settings.notificationsEnabled) {
        const r = await processOutbox(db, deps.telegram, {
          limit: ns.maxPerRun,
          maxAttempts: ns.maxAttempts,
          sendImages: ns.sendImages,
          logger: log,
        });
        stats.notificationsSent = r.sent;
      }
    } catch (err) {
      await recordError("notifications", (err as Error).message);
    }
  }

  const finished = now();
  const summary = fatal ?? (errors.length ? `${errors.length} erreur(s) : ${errors.slice(0, 3).join(" | ")}` : null);
  const close = (errorSummary: string | null) =>
    db
      .update(scrapingRuns)
      .set({ status, finishedAt: finished, durationMs: finished.getTime() - started.getTime(), stats, errorSummary })
      .where(eq(scrapingRuns.id, runId));
  // A run is always closed, even if its summary cannot be stored as is.
  await close(summary ? toStorable(summary).slice(0, 2000) : null).catch(() => close("Résumé d'erreur non enregistrable (voir les journaux du worker)."));
  await db.update(workerStatus).set({ currentRunId: null }).where(eq(workerStatus.id, deps.workerId));
  log.info({ status, stats, durationMs: finished.getTime() - started.getTime() }, "collecte terminée");
  return { runId, status, stats };
}

async function collect(
  deps: PipelineDeps,
  runId: string,
  criteria: Criterion[],
  settings: AppSettings,
  stats: RunStats,
  recordError: (stage: string, message: string, url?: string | null, httpStatus?: number | null) => Promise<void>,
  now: () => Date,
  log: Logger,
): Promise<AccessBlockedError | RobotsDisallowedError | null> {
  const { db, adapter } = deps;
  let blocked: AccessBlockedError | RobotsDisallowedError | null = null;

  /* 1. Discover listings ---------------------------------------------------- */
  const dealPaths = new Set(settings.dealPagePaths);
  // Promotion pages first: they are plain HTML and stay useful even if a later listing is refused.
  const paths = [...new Set([...settings.dealPagePaths, ...criteria.flatMap((c) => c.filters.categoryPaths)])];
  stats.listingPaths = paths.length;
  const crawledPaths: string[] = [];
  const items = new Map<string, { item: ListingItem; categoryPath: string | null; seenOn: Set<string> }>();

  for (const path of paths) {
    try {
      const res = await adapter.discover(path, settings.maxListingPagesPerPath);
      stats.listingPagesFetched! += res.pagesLoaded;
      log.info({ path, method: res.method, cards: res.items.length }, "liste analysée");
      // An empty extraction is treated as a failure, so it can never mark offers as missing.
      if (res.items.length === 0) {
        await recordError(
          "listing",
          "Aucun produit dans la réponse du site pour cette page (liste chargée par le navigateur). Ses produits restent détectés s'ils apparaissent dans les Ventes flash ou le Déstockage.",
          path,
        );
      }
      else {
        crawledPaths.push(path);
        const crawl = { lastSuccessAt: now(), itemCount: res.items.length, method: res.method };
        await db.insert(listingCrawls).values({ path, ...crawl }).onConflictDoUpdate({ target: listingCrawls.path, set: crawl });
      }
      for (const item of res.items) {
        stats.cardsSeen!++;
        const existing = items.get(item.sourceId);
        const categoryPath = dealPaths.has(path) ? null : path;
        if (!existing) items.set(item.sourceId, { item, categoryPath, seenOn: new Set([path]) });
        else {
          existing.seenOn.add(path);
          if (!existing.categoryPath && categoryPath) existing.categoryPath = categoryPath;
        }
      }
    } catch (err) {
      if (err instanceof AccessBlockedError) {
        // Stop all further requests immediately; keep what was already read.
        blocked = err;
        break;
      }
      if (err instanceof RobotsDisallowedError) {
        await recordError("robots", err.message, path);
        continue;
      }
      const e = err as Error & { status?: number };
      await recordError("listing", e.message, path, e.status ?? null);
    }
  }

  /* 2. Choose candidates ---------------------------------------------------- */
  const candidates = [...items.values()].filter(
    ({ item, seenOn }) => item.priceCents !== null && criteria.some((c) => couldMatch(item, c, [...seenOn])),
  );
  // Every priced card from a promotion page is stored (listing data only) for the Ventes flash view.
  const candidateIds = new Set(candidates.map((c) => c.item.sourceId));
  const dealOnly = [...items.values()].filter(
    ({ item, seenOn }) => item.priceCents !== null && !candidateIds.has(item.sourceId) && [...seenOn].some((p) => dealPaths.has(p)),
  );

  // Offers that matched before but were not seen on listings: refresh their page.
  const seenSourceIds = [...items.keys()];
  const tracked = await db
    .selectDistinct({ id: productOffers.id, url: productOffers.url, sourceId: productOffers.sourceId, lastListingPath: productOffers.lastListingPath })
    .from(productOffers)
    .innerJoin(dealMatches, eq(dealMatches.offerId, productOffers.id))
    .where(
      and(
        eq(dealMatches.isMatch, true),
        inArray(dealMatches.criterionId, criteria.map((c) => c.id)),
        inArray(productOffers.status, ["active", "unavailable"]),
        seenSourceIds.length ? notInArray(productOffers.sourceId, seenSourceIds) : sql`true`,
      ),
    );

  // After a refusal, no product page is requested: listing data only.
  let budget = blocked ? 0 : settings.maxDetailFetchesPerRun;
  const seenOfferIds = new Set<string>();

  /* 3. Fetch details, store, evaluate --------------------------------------- */
  const handle = async (obs: OfferObservation) => {
    const t = now();
    await db.transaction(async (tx) => {
      const saved = await saveObservation(tx, obs, runId, t);
      seenOfferIds.add(saved.offerId);
      if (saved.isNewOffer) stats.newOffers!++;
      if (saved.previous.priceCents !== null && obs.priceCents < saved.previous.priceCents) stats.priceDrops!++;
      if (saved.previous.stock === "out_of_stock" && saved.matchable.stock === "in_stock") stats.restocks!++;

      for (const criterion of criteria) {
        const ev = evaluate(criterion, saved.matchable, saved.facts, settings);
        const [prevRow] = await tx
          .select()
          .from(dealMatches)
          .where(and(eq(dealMatches.criterionId, criterion.id), eq(dealMatches.offerId, saved.offerId)))
          .limit(1)
          .for("update");
        // Only keep rows for products that are relevant to this criterion.
        if (!ev.isMatch && !prevRow) continue;
        const prev: PreviousMatchState | null = prevRow
          ? {
              isMatch: prevRow.isMatch,
              score: prevRow.score,
              dealClass: prevRow.dealClass,
              priceCents: prevRow.priceCents,
              lastNotifiedPriceCents: prevRow.lastNotifiedPriceCents,
              lastNotifiedAt: prevRow.lastNotifiedAt,
            }
          : null;
        if (ev.isMatch) stats.matches!++;

        const decision = decideNotification(criterion, ev, prev, {
          offerId: saved.offerId,
          priceCents: obs.priceCents,
          previousPriceCents: saved.previous.priceCents,
          previousStock: saved.previous.stock,
          currentStock: saved.matchable.stock,
          observationKey: String(saved.observationId),
        });

        let notified = false;
        if (decision) {
          const html = formatDealMessage({
            event: decision.event,
            criterionName: criterion.name,
            title: obs.title,
            url: obs.url,
            priceCents: obs.priceCents,
            originalPriceCents: obs.originalPriceCents,
            advertisedDiscountPct: obs.advertisedDiscountPct,
            previousPriceCents: saved.facts.previousPriceCents,
            changeVsPreviousPct: ev.changeVsPreviousPct,
            stock: saved.matchable.stock,
            seller: obs.seller,
            score: ev.score,
            dealClass: ev.dealClass,
            explanation: ev.explanation,
            observedAt: t,
          });
          const id = await enqueueNotification(tx, {
            dedupeKey: decision.dedupeKey,
            eventType: decision.event,
            payload: { html, imageUrl: obs.imageUrl },
            criterionId: criterion.id,
            offerId: saved.offerId,
            runId,
            priceCents: obs.priceCents,
          });
          if (id) {
            stats.notificationsQueued!++;
            notified = true;
          }
        }

        const values = {
          isMatch: ev.isMatch,
          score: ev.score,
          dealClass: ev.dealClass,
          explanation: ev.explanation,
          breakdown: ev.breakdown,
          failedReasons: ev.failedReasons,
          priceCents: obs.priceCents,
          lastEvaluatedAt: t,
          ...(ev.isMatch && !prevRow?.firstMatchedAt ? { firstMatchedAt: t } : {}),
          ...(notified ? { lastNotifiedPriceCents: obs.priceCents, lastNotifiedAt: t } : {}),
        };
        if (prevRow) await tx.update(dealMatches).set(values).where(eq(dealMatches.id, prevRow.id));
        else await tx.insert(dealMatches).values({ criterionId: criterion.id, offerId: saved.offerId, ...values });
      }
    });
  };

  // Previously matched offers first (keeps their history continuous), then new candidates.
  const knownIds = new Set(
    (
      await db
        .select({ sourceId: productOffers.sourceId })
        .from(productOffers)
        .where(seenSourceIds.length ? inArray(productOffers.sourceId, seenSourceIds) : sql`false`)
    ).map((r) => r.sourceId),
  );
  candidates.sort((a, b) => Number(knownIds.has(b.item.sourceId)) - Number(knownIds.has(a.item.sourceId)));

  for (const { item, categoryPath, seenOn } of candidates) {
    let obs: OfferObservation = { ...fromListing(item, categoryPath), listingPaths: [...seenOn] };
    // The listing data already holds exact prices: a product page is only
    // requested when a criterion needs technical specs (size, RAM, 4K…).
    const needsSpecs = criteria.some(
      (c) => (c.filters.mandatorySpecs.length > 0 || c.filters.preferredSpecs.length > 0) && couldMatch(item, c, [...seenOn]),
    );
    if (budget > 0 && needsSpecs) {
      budget--;
      stats.detailFetches!++;
      let r: Awaited<ReturnType<typeof adapter.fetchProduct>>;
      try {
        r = await adapter.fetchProduct(item.url);
      } catch (err) {
        if (!(err instanceof AccessBlockedError)) throw err;
        blocked = err;
        budget = 0;
        r = { kind: "error", message: err.message, status: err.status };
      }
      if (r.kind === "ok") {
        obs = { ...fromDetail(r.detail, categoryPath, item.listingPath), listingPaths: [...seenOn] };
        if (r.detail.warnings.length) log.debug({ url: item.url, warnings: r.detail.warnings }, "avertissements d'extraction");
      } else {
        stats.detailFailures!++;
        await recordError("detail", r.kind === "gone" ? `Page produit introuvable (HTTP ${r.status})` : r.message, item.url, r.kind === "gone" ? r.status : (r.status ?? null));
        // Fall back to the listing card data (still a real observation).
      }
    }
    try {
      await handle(obs);
    } catch (err) {
      await recordError("store", (err as Error).message, item.url);
    }
  }

  for (const { item, categoryPath, seenOn } of dealOnly) {
    try {
      await handle({ ...fromListing(item, categoryPath), listingPaths: [...seenOn] });
    } catch (err) {
      await recordError("store", (err as Error).message, item.url);
    }
  }

  for (const t of tracked) {
    if (budget <= 0 || blocked) break;
    budget--;
    stats.detailFetches!++;
    const r = await adapter.fetchProduct(t.url);
    if (r.kind === "ok") {
      try {
        await handle(fromDetail(r.detail, null, t.lastListingPath));
      } catch (err) {
        await recordError("store", (err as Error).message, t.url);
      }
    } else if (r.kind === "gone") {
      stats.detailFailures!++;
      await db.transaction((tx) => markOfferGone(tx, t.id, now()));
      seenOfferIds.add(t.id);
    } else {
      stats.detailFailures!++;
      await recordError("detail", r.message, t.url, r.status ?? null);
    }
  }

  /* 4. Missing policy (only for listings crawled successfully) -------------- */
  // Every offer that appeared on a listing counts as seen, candidate or not.
  if (seenSourceIds.length) {
    const visible = await db.select({ id: productOffers.id }).from(productOffers).where(inArray(productOffers.sourceId, seenSourceIds));
    for (const v of visible) seenOfferIds.add(v.id);
  }
  // A refused run is incomplete: never use it to mark offers as missing.
  if (!blocked) {
    stats.markedMissing = await db.transaction((tx) => applyMissingPolicy(tx, crawledPaths, seenOfferIds, settings.missingAfterRuns, now()));
  }
  return blocked;
}

/** First line of an error (database errors repeat the whole query and its values). */
function firstLine(message: string): string {
  const line = message.split("\n")[0] ?? message;
  return line.length > 300 ? `${line.slice(0, 300)}…` : line;
}

/** ASCII equivalents for typographic characters some databases cannot store. */
function toStorable(text: string): string {
  return text
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"');
}
