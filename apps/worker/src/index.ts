import { createDb } from "@mdw/database";
import { loadConfig } from "./config";
import { createLogger } from "./logger";
import { lazyDeps, markInterruptedRuns, runEnabledShops } from "./deps";
import { Scheduler } from "./scheduler";
import { startHealthServer } from "./health";

const VERSION = process.env.APP_VERSION ?? "1.0.0";

async function main() {
  const config = loadConfig();
  const logger = createLogger(config.LOG_LEVEL);
  // Pool: 1 connection held by the advisory lock during a run + regular queries.
  const { db, pool, close } = createDb(config.DATABASE_URL, 6);

  const interrupted = await markInterruptedRuns(db, pool);
  if (interrupted) logger.warn({ interrupted }, "collectes interrompues marquées comme telles");

  const baseDeps = lazyDeps(db, pool, config, logger);
  if (!baseDeps.telegram) logger.warn("TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID absents : les alertes resteront en file d'attente");

  const scheduler = new Scheduler(baseDeps, {
    scheduleTimes: config.SCRAPE_TIMES,
    catchUpWindowHours: config.CATCHUP_WINDOW_HOURS,
    outboxIntervalSeconds: config.OUTBOX_INTERVAL_SECONDS,
    version: VERSION,
    makeDeps: () => lazyDeps(db, pool, config, logger),
    run: (_deps, trigger, scheduledFor) => runEnabledShops(db, pool, config, logger, trigger, scheduledFor),
  });
  await scheduler.start();
  const server = startHealthServer(config.HEALTH_PORT, db, scheduler);
  logger.info({ port: config.HEALTH_PORT, version: VERSION }, "worker prêt");

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "arrêt en cours");
    server.close();
    await scheduler.stop();
    await close().catch(() => undefined);
    logger.info("arrêt terminé");
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("unhandledRejection", (err) => logger.error({ err: String(err) }, "promesse rejetée non gérée"));
}

main().catch((err) => {
  console.error(JSON.stringify({ level: "fatal", msg: "le worker n'a pas pu démarrer", err: (err as Error).message }));
  process.exit(1);
});
