ALTER TABLE "automation_settings" ADD COLUMN "creator_name" text DEFAULT 'Vinod Kumar' NOT NULL;--> statement-breakpoint
ALTER TABLE "automation_settings" ADD COLUMN "brand_name" text DEFAULT 'VK YouTube AI' NOT NULL;--> statement-breakpoint
ALTER TABLE "automation_settings" ADD COLUMN "creator_handle" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "automation_settings" ADD COLUMN "copyright_line" text DEFAULT '© 2026 Vinod Kumar' NOT NULL;--> statement-breakpoint
ALTER TABLE "automation_settings" ADD COLUMN "ai_attribution" text DEFAULT 'Produced with VK YouTube AI' NOT NULL;--> statement-breakpoint
ALTER TABLE "automation_settings" ADD COLUMN "social_links" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "automation_settings" ADD COLUMN "include_spoken_attribution" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "video_projects" ADD COLUMN "creator_identity" jsonb DEFAULT '{}'::jsonb;