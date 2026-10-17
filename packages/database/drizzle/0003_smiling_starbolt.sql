ALTER TABLE "search_criteria" ADD COLUMN IF NOT EXISTS "origin" text DEFAULT 'user' NOT NULL;
