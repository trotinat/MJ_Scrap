import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { AppSettings, CriterionFilters, NormalizedSpecs, NotifyMode } from "@mdw/shared";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();

/* ----------------------------------------------------------------------------
 * Authentication
 * ------------------------------------------------------------------------- */

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: createdAt(),
  lastLoginAt: ts("last_login_at"),
}, (t) => [uniqueIndex("users_email_uq").on(sql`lower(${t.email})`)]);

export const sessions = pgTable("sessions", {
  /** SHA-256 of the session token; the raw token only lives in the cookie. */
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
  expiresAt: ts("expires_at").notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
}, (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)]);

export const loginAttempts = pgTable("login_attempts", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  ip: text("ip").notNull(),
  email: text("email"),
  success: boolean("success").notNull(),
  attemptedAt: ts("attempted_at").notNull().defaultNow(),
}, (t) => [index("login_attempts_ip_time_idx").on(t.ip, t.attemptedAt)]);

/* ----------------------------------------------------------------------------
 * Search criteria
 * ------------------------------------------------------------------------- */

export const searchCriteria = pgTable("search_criteria", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  enabled: boolean("enabled").notNull().default(true),
  notifyMode: text("notify_mode").$type<NotifyMode>().notNull().default("all"),
  notifyMinScore: integer("notify_min_score").notNull().default(50),
  minPriceDropPct: numeric("min_price_drop_pct", { precision: 5, scale: 2, mode: "number" }).notNull().default(5),
  /** Validated by criterionFiltersSchema (amounts in MAD). */
  filters: jsonb("filters").$type<CriterionFilters>().notNull(),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
}, (t) => [index("search_criteria_enabled_idx").on(t.enabled)]);

/* ----------------------------------------------------------------------------
 * Products, offers and price history
 * ------------------------------------------------------------------------- */

/**
 * A product = one distinct item (brand + model reference + variant).
 * Several marketplace offers (sellers / listings) can point to one product.
 */
export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** "ref:<BRAND>:<MODELREF>" when a reference is known, else "src:<sourceId>". */
  canonicalKey: text("canonical_key").notNull(),
  name: text("name").notNull(),
  brand: text("brand"),
  modelRef: text("model_ref"),
  categoryPath: text("category_path"),
  imageUrl: text("image_url"),
  specs: jsonb("specs").$type<NormalizedSpecs>().notNull().default({}),
  rawSpecs: jsonb("raw_specs").$type<Record<string, string>>().notNull().default({}),
  firstSeenAt: ts("first_seen_at").notNull().defaultNow(),
  lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("products_canonical_key_uq").on(t.canonicalKey),
  index("products_model_ref_idx").on(t.modelRef),
  index("products_brand_idx").on(t.brand),
  index("products_category_idx").on(t.categoryPath),
]);

export type OfferStatus = "active" | "unavailable" | "missing";

export const productOffers = pgTable("product_offers", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  /** Identifier from the product URL (/p/<slug>-<sourceId>). */
  sourceId: text("source_id").notNull(),
  url: text("url").notNull(),
  title: text("title").notNull(),
  seller: text("seller"),
  currentPriceCents: integer("current_price_cents"),
  originalPriceCents: integer("original_price_cents"),
  advertisedDiscountPct: numeric("advertised_discount_pct", { precision: 5, scale: 2, mode: "number" }),
  stockStatus: text("stock_status").$type<"in_stock" | "out_of_stock" | "unknown">().notNull().default("unknown"),
  rating: numeric("rating", { precision: 3, scale: 2, mode: "number" }),
  reviewCount: integer("review_count"),
  status: text("status").$type<OfferStatus>().notNull().default("active"),
  consecutiveMisses: integer("consecutive_misses").notNull().default(0),
  minPriceCents: integer("min_price_cents"),
  lastListingPath: text("last_listing_path"),
  extraction: text("extraction"),
  firstSeenAt: ts("first_seen_at").notNull().defaultNow(),
  lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
  lastSuccessAt: ts("last_success_at"),
  lastDetailAt: ts("last_detail_at"),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("product_offers_source_id_uq").on(t.sourceId),
  index("product_offers_url_idx").on(t.url),
  index("product_offers_product_idx").on(t.productId),
  index("product_offers_price_idx").on(t.currentPriceCents),
  index("product_offers_last_seen_idx").on(t.lastSeenAt),
  index("product_offers_status_idx").on(t.status),
]);

export const priceHistory = pgTable("price_history", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  offerId: uuid("offer_id").notNull().references(() => productOffers.id, { onDelete: "cascade" }),
  runId: uuid("run_id").references(() => scrapingRuns.id, { onDelete: "set null" }),
  priceCents: integer("price_cents").notNull(),
  originalPriceCents: integer("original_price_cents"),
  advertisedDiscountPct: numeric("advertised_discount_pct", { precision: 5, scale: 2, mode: "number" }),
  stockStatus: text("stock_status").$type<"in_stock" | "out_of_stock" | "unknown">().notNull().default("unknown"),
  /** "detail" (product page) or "listing" (category card). */
  source: text("source").$type<"detail" | "listing">().notNull(),
  observedAt: ts("observed_at").notNull().defaultNow(),
}, (t) => [
  index("price_history_offer_time_idx").on(t.offerId, t.observedAt),
  index("price_history_observed_idx").on(t.observedAt),
]);

/* ----------------------------------------------------------------------------
 * Scraping runs
 * ------------------------------------------------------------------------- */

export type RunStatus = "running" | "success" | "partial" | "failed" | "skipped" | "interrupted";
export type RunTrigger = "schedule" | "manual" | "catchup";

export interface RunStats {
  listingPaths?: number;
  listingPagesFetched?: number;
  cardsSeen?: number;
  detailFetches?: number;
  detailFailures?: number;
  newOffers?: number;
  priceDrops?: number;
  restocks?: number;
  markedMissing?: number;
  matches?: number;
  notificationsQueued?: number;
  notificationsSent?: number;
  accessBlocked?: boolean;
}

export const scrapingRuns = pgTable("scraping_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  trigger: text("trigger").$type<RunTrigger>().notNull(),
  status: text("status").$type<RunStatus>().notNull().default("running"),
  scheduledFor: ts("scheduled_for"),
  startedAt: ts("started_at").notNull().defaultNow(),
  finishedAt: ts("finished_at"),
  durationMs: integer("duration_ms"),
  stats: jsonb("stats").$type<RunStats>().notNull().default({}),
  errorSummary: text("error_summary"),
  workerId: text("worker_id"),
}, (t) => [index("scraping_runs_started_idx").on(t.startedAt), index("scraping_runs_status_idx").on(t.status)]);

export const scrapingErrors = pgTable("scraping_errors", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  runId: uuid("run_id").notNull().references(() => scrapingRuns.id, { onDelete: "cascade" }),
  stage: text("stage").notNull(),
  url: text("url"),
  httpStatus: integer("http_status"),
  message: text("message").notNull(),
  createdAt: createdAt(),
}, (t) => [index("scraping_errors_run_idx").on(t.runId)]);

/** Manual "run now" requests from the dashboard, consumed by the worker. */
export const runRequests = pgTable("run_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestedBy: text("requested_by"),
  status: text("status").$type<"pending" | "picked" | "done">().notNull().default("pending"),
  runId: uuid("run_id"),
  createdAt: createdAt(),
}, (t) => [index("run_requests_status_idx").on(t.status)]);

/* ----------------------------------------------------------------------------
 * Matching and notifications
 * ------------------------------------------------------------------------- */

export interface ScoreComponent {
  key: string;
  label: string;
  weight: number;
  value: number;
  applicable: boolean;
  note?: string;
}

export const dealMatches = pgTable("deal_matches", {
  id: uuid("id").primaryKey().defaultRandom(),
  criterionId: uuid("criterion_id").notNull().references(() => searchCriteria.id, { onDelete: "cascade" }),
  offerId: uuid("offer_id").notNull().references(() => productOffers.id, { onDelete: "cascade" }),
  isMatch: boolean("is_match").notNull(),
  score: integer("score").notNull().default(0),
  dealClass: text("deal_class").notNull().default("ordinary"),
  explanation: text("explanation").notNull().default(""),
  breakdown: jsonb("breakdown").$type<ScoreComponent[]>().notNull().default([]),
  failedReasons: jsonb("failed_reasons").$type<string[]>().notNull().default([]),
  priceCents: integer("price_cents"),
  firstMatchedAt: ts("first_matched_at"),
  lastEvaluatedAt: ts("last_evaluated_at").notNull().defaultNow(),
  lastNotifiedPriceCents: integer("last_notified_price_cents"),
  lastNotifiedAt: ts("last_notified_at"),
}, (t) => [
  uniqueIndex("deal_matches_criterion_offer_uq").on(t.criterionId, t.offerId),
  index("deal_matches_match_score_idx").on(t.isMatch, t.score),
  index("deal_matches_offer_idx").on(t.offerId),
]);

export type NotificationEvent =
  | "new_match"
  | "target_reached"
  | "price_drop"
  | "back_in_stock"
  | "exceptional"
  | "test";

export type NotificationStatus = "pending" | "sending" | "sent" | "failed" | "dead";

export interface NotificationPayload {
  html: string;
  imageUrl: string | null;
}

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Idempotency key: a given event is only ever enqueued once. */
  dedupeKey: text("dedupe_key").notNull(),
  criterionId: uuid("criterion_id").references(() => searchCriteria.id, { onDelete: "set null" }),
  offerId: uuid("offer_id").references(() => productOffers.id, { onDelete: "set null" }),
  runId: uuid("run_id").references(() => scrapingRuns.id, { onDelete: "set null" }),
  eventType: text("event_type").$type<NotificationEvent>().notNull(),
  status: text("status").$type<NotificationStatus>().notNull().default("pending"),
  payload: jsonb("payload").$type<NotificationPayload>().notNull(),
  priceCents: integer("price_cents"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: ts("next_attempt_at").notNull().defaultNow(),
  lockedUntil: ts("locked_until"),
  lastError: text("last_error"),
  telegramMessageId: bigint("telegram_message_id", { mode: "number" }),
  createdAt: createdAt(),
  sentAt: ts("sent_at"),
}, (t) => [
  uniqueIndex("notifications_dedupe_uq").on(t.dedupeKey),
  index("notifications_status_next_idx").on(t.status, t.nextAttemptAt),
  index("notifications_created_idx").on(t.createdAt),
  index("notifications_criterion_idx").on(t.criterionId),
]);

/** Delivery log: one row per attempt. */
export const notificationAttempts = pgTable("notification_attempts", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  notificationId: uuid("notification_id").notNull().references(() => notifications.id, { onDelete: "cascade" }),
  attemptedAt: ts("attempted_at").notNull().defaultNow(),
  success: boolean("success").notNull(),
  httpStatus: integer("http_status"),
  error: text("error"),
  telegramMessageId: bigint("telegram_message_id", { mode: "number" }),
}, (t) => [index("notification_attempts_notification_idx").on(t.notificationId)]);

export const notificationSettings = pgTable("notification_settings", {
  id: integer("id").primaryKey().default(1),
  enabled: boolean("enabled").notNull().default(true),
  sendImages: boolean("send_images").notNull().default(true),
  maxAttempts: integer("max_attempts").notNull().default(8),
  maxPerRun: integer("max_per_run").notNull().default(30),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/* ----------------------------------------------------------------------------
 * Application settings and worker status
 * ------------------------------------------------------------------------- */

export const applicationSettings = pgTable("application_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<AppSettings | Record<string, unknown>>().notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const workerStatus = pgTable("worker_status", {
  id: text("id").primaryKey(),
  startedAt: ts("started_at").notNull(),
  heartbeatAt: ts("heartbeat_at").notNull(),
  version: text("version"),
  nextRunAt: ts("next_run_at"),
  currentRunId: uuid("current_run_id"),
  scheduleTimes: text("schedule_times"),
});
