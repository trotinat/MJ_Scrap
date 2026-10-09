import pino from "pino";

/**
 * Structured JSON logs (one line per event) for `docker compose logs`.
 * Secrets are redacted by key, and the Telegram token pattern is scrubbed
 * from any message as a second line of defence.
 */
export function createLogger(level = process.env.LOG_LEVEL ?? "info") {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  return pino({
    level,
    base: { service: "worker" },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        "*.password",
        "*.passwordHash",
        "*.token",
        "*.botToken",
        "*.TELEGRAM_BOT_TOKEN",
        "*.DATABASE_URL",
        "*.ADMIN_PASSWORD",
        "config.TELEGRAM_BOT_TOKEN",
        "config.DATABASE_URL",
        "config.ADMIN_PASSWORD",
      ],
      censor: "[REDACTED]",
    },
    hooks: {
      logMethod(args, method) {
        const scrub = (v: unknown) =>
          typeof v === "string"
            ? (token ? v.split(token).join("[REDACTED]") : v).replace(/bot\d+:[A-Za-z0-9_-]{20,}/g, "bot[REDACTED]").replace(/(postgres(?:ql)?:\/\/[^:]+:)[^@]+@/g, "$1[REDACTED]@")
            : v;
        method.apply(this, args.map(scrub) as Parameters<typeof method>);
      },
    },
  });
}

export type Logger = ReturnType<typeof createLogger>;
