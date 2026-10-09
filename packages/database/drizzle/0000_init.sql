CREATE TABLE "application_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deal_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criterion_id" uuid NOT NULL,
	"offer_id" uuid NOT NULL,
	"is_match" boolean NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"deal_class" text DEFAULT 'ordinary' NOT NULL,
	"explanation" text DEFAULT '' NOT NULL,
	"breakdown" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"failed_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"price_cents" integer,
	"first_matched_at" timestamp with time zone,
	"last_evaluated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_notified_price_cents" integer,
	"last_notified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ip" text NOT NULL,
	"email" text,
	"success" boolean NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_attempts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"notification_id" uuid NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"success" boolean NOT NULL,
	"http_status" integer,
	"error" text,
	"telegram_message_id" bigint
);
--> statement-breakpoint
CREATE TABLE "notification_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"send_images" boolean DEFAULT true NOT NULL,
	"max_attempts" integer DEFAULT 8 NOT NULL,
	"max_per_run" integer DEFAULT 30 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dedupe_key" text NOT NULL,
	"criterion_id" uuid,
	"offer_id" uuid,
	"run_id" uuid,
	"event_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payload" jsonb NOT NULL,
	"price_cents" integer,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"last_error" text,
	"telegram_message_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "price_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"offer_id" uuid NOT NULL,
	"run_id" uuid,
	"price_cents" integer NOT NULL,
	"original_price_cents" integer,
	"advertised_discount_pct" numeric(5, 2),
	"stock_status" text DEFAULT 'unknown' NOT NULL,
	"source" text NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"source_id" text NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"seller" text,
	"current_price_cents" integer,
	"original_price_cents" integer,
	"advertised_discount_pct" numeric(5, 2),
	"stock_status" text DEFAULT 'unknown' NOT NULL,
	"rating" numeric(3, 2),
	"review_count" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"consecutive_misses" integer DEFAULT 0 NOT NULL,
	"min_price_cents" integer,
	"last_listing_path" text,
	"extraction" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_detail_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canonical_key" text NOT NULL,
	"name" text NOT NULL,
	"brand" text,
	"model_ref" text,
	"category_path" text,
	"image_url" text,
	"specs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"raw_specs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requested_by" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scraping_errors" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"url" text,
	"http_status" integer,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scraping_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trigger" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"scheduled_for" timestamp with time zone,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_summary" text,
	"worker_id" text
);
--> statement-breakpoint
CREATE TABLE "search_criteria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"notify_mode" text DEFAULT 'all' NOT NULL,
	"notify_min_score" integer DEFAULT 50 NOT NULL,
	"min_price_drop_pct" numeric(5, 2) DEFAULT 5 NOT NULL,
	"filters" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "worker_status" (
	"id" text PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"heartbeat_at" timestamp with time zone NOT NULL,
	"version" text,
	"next_run_at" timestamp with time zone,
	"current_run_id" uuid,
	"schedule_times" text
);
--> statement-breakpoint
ALTER TABLE "deal_matches" ADD CONSTRAINT "deal_matches_criterion_id_search_criteria_id_fk" FOREIGN KEY ("criterion_id") REFERENCES "public"."search_criteria"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_matches" ADD CONSTRAINT "deal_matches_offer_id_product_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."product_offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_attempts" ADD CONSTRAINT "notification_attempts_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_criterion_id_search_criteria_id_fk" FOREIGN KEY ("criterion_id") REFERENCES "public"."search_criteria"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_offer_id_product_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."product_offers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_run_id_scraping_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."scraping_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_offer_id_product_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."product_offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_run_id_scraping_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."scraping_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_offers" ADD CONSTRAINT "product_offers_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scraping_errors" ADD CONSTRAINT "scraping_errors_run_id_scraping_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."scraping_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deal_matches_criterion_offer_uq" ON "deal_matches" USING btree ("criterion_id","offer_id");--> statement-breakpoint
CREATE INDEX "deal_matches_match_score_idx" ON "deal_matches" USING btree ("is_match","score");--> statement-breakpoint
CREATE INDEX "deal_matches_offer_idx" ON "deal_matches" USING btree ("offer_id");--> statement-breakpoint
CREATE INDEX "login_attempts_ip_time_idx" ON "login_attempts" USING btree ("ip","attempted_at");--> statement-breakpoint
CREATE INDEX "notification_attempts_notification_idx" ON "notification_attempts" USING btree ("notification_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_uq" ON "notifications" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "notifications_status_next_idx" ON "notifications" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "notifications_created_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notifications_criterion_idx" ON "notifications" USING btree ("criterion_id");--> statement-breakpoint
CREATE INDEX "price_history_offer_time_idx" ON "price_history" USING btree ("offer_id","observed_at");--> statement-breakpoint
CREATE INDEX "price_history_observed_idx" ON "price_history" USING btree ("observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "product_offers_source_id_uq" ON "product_offers" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "product_offers_url_idx" ON "product_offers" USING btree ("url");--> statement-breakpoint
CREATE INDEX "product_offers_product_idx" ON "product_offers" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_offers_price_idx" ON "product_offers" USING btree ("current_price_cents");--> statement-breakpoint
CREATE INDEX "product_offers_last_seen_idx" ON "product_offers" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "product_offers_status_idx" ON "product_offers" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "products_canonical_key_uq" ON "products" USING btree ("canonical_key");--> statement-breakpoint
CREATE INDEX "products_model_ref_idx" ON "products" USING btree ("model_ref");--> statement-breakpoint
CREATE INDEX "products_brand_idx" ON "products" USING btree ("brand");--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("category_path");--> statement-breakpoint
CREATE INDEX "run_requests_status_idx" ON "run_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "scraping_errors_run_idx" ON "scraping_errors" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "scraping_runs_started_idx" ON "scraping_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "scraping_runs_status_idx" ON "scraping_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "search_criteria_enabled_idx" ON "search_criteria" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree (lower("email"));