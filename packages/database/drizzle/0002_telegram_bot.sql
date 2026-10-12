CREATE TABLE "telegram_subscribers" (
	"chat_id" text PRIMARY KEY NOT NULL,
	"type" text,
	"username" text,
	"first_name" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_interaction_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "telegram_subscribers_status_idx" ON "telegram_subscribers" USING btree ("status");--> statement-breakpoint
ALTER TABLE "search_criteria" ADD COLUMN "origin" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
UPDATE "search_criteria" SET "origin" = 'recommended' WHERE "name" IN (
	'Adidas Homme – pointure 42',
	'Ventes flash : -40 % et plus',
	'Smart TV 55" 4K – moins de 6 000 MAD',
	'Casques & écouteurs – moins de 500 MAD',
	'Friteuse sans huile – moins de 1 000 MAD',
	'Mode Homme – Hauts en promo (taille M)',
	'Mode Homme – Pantalons & jeans (taille 32/33)',
	'Chaussures Homme – pointure 42 en promo'
);--> statement-breakpoint
UPDATE "notifications" SET "status" = 'dead', "last_error" = 'Filtré : hors de vos recherches (nouvelle règle de notification)'
WHERE "status" IN ('pending', 'failed')
	AND ("event_type" IN ('exceptional', 'back_in_stock')
		OR "criterion_id" IN (SELECT "id" FROM "search_criteria" WHERE "origin" = 'recommended'));
