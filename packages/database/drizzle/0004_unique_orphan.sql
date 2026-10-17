CREATE TABLE "user_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "search_criteria" ADD COLUMN "user_id" uuid;--> statement-breakpoint
-- Keep every existing search under Houssam's account. On a fresh installation
-- with another first user, the fallback only matters if searches predate this migration.
UPDATE "search_criteria" SET "user_id" = owner.id
FROM (SELECT id FROM "users" ORDER BY CASE WHEN lower(email) = 'houssam@test.com' THEN 0 ELSE 1 END, created_at LIMIT 1) owner
WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "search_criteria" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
-- Migrate the former global shopper profile only to the owner of the legacy searches.
INSERT INTO "user_profiles" ("user_id", "profile", "updated_at")
SELECT owner.id, coalesce((SELECT value->'shopperProfile' FROM "application_settings" WHERE key = 'app'), '{}'::jsonb),
  coalesce((SELECT updated_at FROM "application_settings" WHERE key = 'app'), now())
FROM (SELECT id FROM "users" ORDER BY CASE WHEN lower(email) = 'houssam@test.com' THEN 0 ELSE 1 END, created_at LIMIT 1) owner
ON CONFLICT ("user_id") DO NOTHING;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_criteria" ADD CONSTRAINT "search_criteria_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "search_criteria_user_idx" ON "search_criteria" USING btree ("user_id");
