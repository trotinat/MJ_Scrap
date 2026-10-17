CREATE TABLE "shops" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "shops" ("id", "name", "base_url", "active") VALUES ('marjane-mall', 'Marjane Mall', 'https://www.marjanemall.ma', true);--> statement-breakpoint
CREATE TABLE "user_shops" (
	"user_id" uuid NOT NULL,
	"shop_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_shops_user_id_shop_id_pk" PRIMARY KEY("user_id","shop_id")
);
--> statement-breakpoint
DROP INDEX "product_offers_source_id_uq";--> statement-breakpoint
DROP INDEX "products_canonical_key_uq";--> statement-breakpoint
ALTER TABLE "listing_crawls" ADD COLUMN "shop_id" text DEFAULT 'marjane-mall' NOT NULL;--> statement-breakpoint
ALTER TABLE "listing_crawls" DROP CONSTRAINT "listing_crawls_pkey";--> statement-breakpoint
ALTER TABLE "listing_crawls" ADD CONSTRAINT "listing_crawls_shop_id_path_pk" PRIMARY KEY("shop_id","path");--> statement-breakpoint
ALTER TABLE "product_offers" ADD COLUMN "shop_id" text DEFAULT 'marjane-mall' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "shop_id" text DEFAULT 'marjane-mall' NOT NULL;--> statement-breakpoint
ALTER TABLE "scraping_runs" ADD COLUMN "shop_id" text;--> statement-breakpoint
ALTER TABLE "search_criteria" ADD COLUMN "shop_id" text DEFAULT 'marjane-mall' NOT NULL;--> statement-breakpoint
INSERT INTO "user_shops" ("user_id", "shop_id") SELECT "id", 'marjane-mall' FROM "users" ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "scraping_runs" SET "shop_id" = 'marjane-mall' WHERE "shop_id" IS NULL;--> statement-breakpoint
ALTER TABLE "user_shops" ADD CONSTRAINT "user_shops_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_shops" ADD CONSTRAINT "user_shops_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_shops_shop_idx" ON "user_shops" USING btree ("shop_id");--> statement-breakpoint
ALTER TABLE "listing_crawls" ADD CONSTRAINT "listing_crawls_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_offers" ADD CONSTRAINT "product_offers_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scraping_runs" ADD CONSTRAINT "scraping_runs_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_criteria" ADD CONSTRAINT "search_criteria_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_offers_shop_source_uq" ON "product_offers" USING btree ("shop_id","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_shop_key_uq" ON "products" USING btree ("shop_id","canonical_key");--> statement-breakpoint
CREATE INDEX "search_criteria_shop_idx" ON "search_criteria" USING btree ("shop_id");
