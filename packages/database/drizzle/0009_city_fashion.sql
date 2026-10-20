INSERT INTO "shops" ("id", "name", "base_url", "active")
VALUES ('city-fashion-ma', 'City Fashion', 'https://cityfashion.ma', true)
ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "base_url" = EXCLUDED."base_url", "active" = true;
--> statement-breakpoint
INSERT INTO "user_shops" ("user_id", "shop_id")
SELECT "id", 'city-fashion-ma' FROM "users"
ON CONFLICT DO NOTHING;
