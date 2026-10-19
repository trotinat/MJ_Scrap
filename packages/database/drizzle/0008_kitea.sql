INSERT INTO "shops" ("id", "name", "base_url", "active")
VALUES ('kitea-ma', 'KITEA', 'https://www.kitea.com', true)
ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "base_url" = EXCLUDED."base_url", "active" = true;
--> statement-breakpoint
INSERT INTO "user_shops" ("user_id", "shop_id")
SELECT "id", 'kitea-ma' FROM "users"
ON CONFLICT DO NOTHING;
