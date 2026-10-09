import { z } from "zod";
import { DEFAULT_SCRAPE_TIMES, scheduleTimesToPatterns } from "@mdw/shared";

const bool = z
  .string()
  .optional()
  .transform((v) => (v === undefined ? undefined : /^(1|true|yes|oui)$/i.test(v)));

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL requis"),
  SCRAPE_TIMES: z
    .string()
    .default(DEFAULT_SCRAPE_TIMES)
    .refine((v) => {
      try {
        scheduleTimesToPatterns(v);
        return true;
      } catch {
        return false;
      }
    }, "SCRAPE_TIMES invalide (ex. 09:00,18:00)"),
  SCRAPER_USER_AGENT: z
    .string()
    .default("Mozilla/5.0 (compatible; MarjaneDealsWatcher/1.0; usage personnel; +https://github.com/trotinat/MJ_Scrap)"),
  RENDER_MODE: z.enum(["auto", "never", "always"]).default("auto"),
  RESPECT_ROBOTS: bool.default("true"),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().min(5000).max(120000).default(25000),
  RENDER_TIMEOUT_MS: z.coerce.number().int().min(10000).max(180000).default(60000),
  MAX_RETRIES: z.coerce.number().int().min(0).max(6).default(3),
  HEALTH_PORT: z.coerce.number().int().min(1).max(65535).default(8081),
  CATCHUP_WINDOW_HOURS: z.coerce.number().min(0).max(24).default(6),
  OUTBOX_INTERVAL_SECONDS: z.coerce.number().int().min(10).max(3600).default(60),
  WORKER_ID: z.string().default(`worker-${process.pid}`),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  ADMIN_EMAIL: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
});

export type WorkerConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Configuration invalide : ${msg}`);
  }
  return parsed.data;
}
