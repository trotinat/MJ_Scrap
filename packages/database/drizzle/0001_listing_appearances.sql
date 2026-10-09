CREATE TABLE "listing_appearances" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"offer_id" uuid NOT NULL,
	"listing_path" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_crawls" (
	"path" text PRIMARY KEY NOT NULL,
	"last_success_at" timestamp with time zone NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"method" text
);
--> statement-breakpoint
ALTER TABLE "listing_appearances" ADD CONSTRAINT "listing_appearances_offer_id_product_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."product_offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "listing_appearances_offer_path_uq" ON "listing_appearances" USING btree ("offer_id","listing_path");--> statement-breakpoint
CREATE INDEX "listing_appearances_path_seen_idx" ON "listing_appearances" USING btree ("listing_path","last_seen_at");