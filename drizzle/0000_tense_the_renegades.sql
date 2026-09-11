CREATE TABLE "analytics_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"channel_id" uuid,
	"youtube_video_id" text DEFAULT '',
	"views" integer DEFAULT 0,
	"impressions" integer DEFAULT 0,
	"ctr" real DEFAULT 0,
	"watch_time_sec" integer DEFAULT 0,
	"avg_view_duration_sec" real DEFAULT 0,
	"avg_percentage_viewed" real DEFAULT 0,
	"likes" integer DEFAULT 0,
	"comments" integer DEFAULT 0,
	"shares" integer DEFAULT 0,
	"subs_gained" integer DEFAULT 0,
	"traffic_sources" jsonb DEFAULT '{}'::jsonb,
	"source" text DEFAULT 'youtube',
	"captured_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"niche_id" uuid,
	"project_id" uuid,
	"kind" text DEFAULT 'image' NOT NULL,
	"file_name" text DEFAULT '',
	"storage_path" text DEFAULT '',
	"remote_url" text DEFAULT '',
	"source" text DEFAULT 'generated',
	"license" text DEFAULT 'original',
	"attribution" text DEFAULT '',
	"rights" text DEFAULT 'owned',
	"width" integer DEFAULT 0,
	"height" integer DEFAULT 0,
	"duration_sec" real DEFAULT 0,
	"meta" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"mode" text DEFAULT 'manual',
	"auto_research" boolean DEFAULT true,
	"auto_ideas" boolean DEFAULT true,
	"auto_script" boolean DEFAULT true,
	"auto_production" boolean DEFAULT false,
	"auto_upload" boolean DEFAULT false,
	"auto_publishing" boolean DEFAULT false,
	"auto_analytics" boolean DEFAULT true,
	"auto_strategy" boolean DEFAULT true,
	"approval_gates" jsonb DEFAULT '["script","publish"]'::jsonb,
	"max_videos_per_day" integer DEFAULT 1,
	"max_videos_per_week" integer DEFAULT 3,
	"max_cost_per_video" real DEFAULT 5,
	"allowed_niches" jsonb DEFAULT '[]'::jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "automation_settings_channel_id_unique" UNIQUE("channel_id")
);
--> statement-breakpoint
CREATE TABLE "channel_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"successful_topics" jsonb DEFAULT '[]'::jsonb,
	"failed_topics" jsonb DEFAULT '[]'::jsonb,
	"successful_hooks" jsonb DEFAULT '[]'::jsonb,
	"failed_hooks" jsonb DEFAULT '[]'::jsonb,
	"successful_lengths" jsonb DEFAULT '[]'::jsonb,
	"successful_title_structures" jsonb DEFAULT '[]'::jsonb,
	"successful_thumbnails" jsonb DEFAULT '[]'::jsonb,
	"successful_formats" jsonb DEFAULT '[]'::jsonb,
	"successful_posting_patterns" jsonb DEFAULT '[]'::jsonb,
	"weights" jsonb DEFAULT '{}'::jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "channel_memories_channel_id_unique" UNIQUE("channel_id")
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"youtube_channel_id" text DEFAULT '',
	"channel_url" text DEFAULT '',
	"country" text DEFAULT 'US',
	"language" text DEFAULT 'en',
	"target_audience" text DEFAULT '',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"niche_id" uuid NOT NULL,
	"channel_id" text DEFAULT '',
	"channel_name" text NOT NULL,
	"channel_url" text DEFAULT '',
	"subscriber_count" integer DEFAULT 0,
	"avg_views" integer DEFAULT 0,
	"upload_frequency" text DEFAULT '',
	"notes" text DEFAULT '',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_calendars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"niche_id" uuid NOT NULL,
	"scheduled_date" timestamp NOT NULL,
	"topic" text NOT NULL,
	"format" text DEFAULT 'long-form',
	"project_id" uuid,
	"status" text DEFAULT 'planned',
	"rationale" text DEFAULT '',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_ideas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid,
	"niche_id" uuid NOT NULL,
	"title" text NOT NULL,
	"title_ideas" jsonb DEFAULT '[]'::jsonb,
	"hook" text DEFAULT '',
	"angle" text DEFAULT '',
	"audience" text DEFAULT '',
	"format" text DEFAULT 'long-form',
	"duration_sec" integer DEFAULT 480,
	"narrative_structure" text DEFAULT '',
	"visual_concept" text DEFAULT '',
	"thumbnail_concept" text DEFAULT '',
	"why_it_may_work" text DEFAULT '',
	"risks" text DEFAULT '',
	"research_requirements" text DEFAULT '',
	"score" real DEFAULT 0,
	"status" text DEFAULT 'proposed',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"job_id" uuid,
	"category" text NOT NULL,
	"amount_usd" real DEFAULT 0,
	"detail" text DEFAULT '',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "edit_decision_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"edl" jsonb DEFAULT '{}'::jsonb,
	"version" integer DEFAULT 1,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "edit_decision_lists_project_id_unique" UNIQUE("project_id")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'queued',
	"progress" real DEFAULT 0,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"result" jsonb DEFAULT '{}'::jsonb,
	"logs" jsonb DEFAULT '[]'::jsonb,
	"retry_count" integer DEFAULT 0,
	"max_retries" integer DEFAULT 3,
	"error" text DEFAULT '',
	"started_at" timestamp,
	"finished_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "niche_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"niche_id" uuid NOT NULL,
	"audience" text DEFAULT '',
	"subtopics" jsonb DEFAULT '[]'::jsonb,
	"evergreen_topics" jsonb DEFAULT '[]'::jsonb,
	"breaking_topics" jsonb DEFAULT '[]'::jsonb,
	"seasonal_topics" jsonb DEFAULT '[]'::jsonb,
	"keywords" jsonb DEFAULT '[]'::jsonb,
	"content_gaps" jsonb DEFAULT '[]'::jsonb,
	"successful_formats" jsonb DEFAULT '[]'::jsonb,
	"successful_hooks" jsonb DEFAULT '[]'::jsonb,
	"title_patterns" jsonb DEFAULT '[]'::jsonb,
	"thumbnail_patterns" jsonb DEFAULT '[]'::jsonb,
	"duration_patterns" text DEFAULT '',
	"upload_patterns" text DEFAULT '',
	"raw_profile" jsonb DEFAULT '{}'::jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "niche_profiles_niche_id_unique" UNIQUE("niche_id")
);
--> statement-breakpoint
CREATE TABLE "niches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"primary_niche" text NOT NULL,
	"sub_niches" jsonb DEFAULT '[]'::jsonb,
	"topics_to_avoid" jsonb DEFAULT '[]'::jsonb,
	"preferred_formats" jsonb DEFAULT '["long-form"]'::jsonb,
	"content_type" text DEFAULT 'both',
	"target_duration_sec" integer DEFAULT 480,
	"videos_per_day" integer DEFAULT 1,
	"videos_per_week" integer DEFAULT 3,
	"tone" text DEFAULT 'energetic',
	"voice_style" text DEFAULT 'neutral',
	"editing_style" text DEFAULT 'dynamic',
	"visual_style" text DEFAULT 'cinematic',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"niche_id" uuid NOT NULL,
	"trend_id" uuid,
	"topic" text NOT NULL,
	"opportunity_score" real DEFAULT 0,
	"demand" real DEFAULT 0,
	"trend_velocity" real DEFAULT 0,
	"competition_level" real DEFAULT 0,
	"freshness" real DEFAULT 0,
	"channel_fit" real DEFAULT 0,
	"gap_score" real DEFAULT 0,
	"production_difficulty" real DEFAULT 0,
	"historical_fit" real DEFAULT 0,
	"status" text DEFAULT 'ranked',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quality_gates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"facts" text DEFAULT 'pending',
	"originality" text DEFAULT 'pending',
	"rights" text DEFAULT 'pending',
	"policy_risk" text DEFAULT 'pending',
	"audio" text DEFAULT 'pending',
	"video" text DEFAULT 'pending',
	"captions" text DEFAULT 'pending',
	"thumbnail" text DEFAULT 'pending',
	"title" text DEFAULT 'pending',
	"metadata" text DEFAULT 'pending',
	"verdict" text DEFAULT 'PENDING',
	"reasons" jsonb DEFAULT '[]'::jsonb,
	"details" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quota_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text DEFAULT 'youtube' NOT NULL,
	"date" text NOT NULL,
	"units_used" integer DEFAULT 0,
	"units_limit" integer DEFAULT 10000,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reference_videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"niche_id" uuid NOT NULL,
	"video_id" text NOT NULL,
	"title" text NOT NULL,
	"channel_name" text DEFAULT '',
	"channel_id" text DEFAULT '',
	"published_at" timestamp,
	"duration_sec" integer DEFAULT 0,
	"view_count" integer DEFAULT 0,
	"like_count" integer DEFAULT 0,
	"comment_count" integer DEFAULT 0,
	"description" text DEFAULT '',
	"tags" jsonb DEFAULT '[]'::jsonb,
	"category" text DEFAULT '',
	"thumbnail_url" text DEFAULT '',
	"views_per_day" real DEFAULT 0,
	"velocity_score" real DEFAULT 0,
	"is_short" boolean DEFAULT false,
	"analysis" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "renders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"output_path" text DEFAULT '',
	"preview_html" text DEFAULT '',
	"status" text DEFAULT 'queued',
	"progress" real DEFAULT 0,
	"log" text DEFAULT '',
	"duration_sec" real DEFAULT 0,
	"file_size" integer DEFAULT 0,
	"renderer" text DEFAULT 'ffmpeg',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"niche_id" uuid NOT NULL,
	"query" text NOT NULL,
	"query_type" text DEFAULT 'keyword',
	"result_count" integer DEFAULT 0,
	"summary" text DEFAULT '',
	"raw_data" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "script_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"script_id" uuid NOT NULL,
	"claim" text NOT NULL,
	"source" text DEFAULT '',
	"url" text DEFAULT '',
	"confidence" real DEFAULT 0,
	"status" text DEFAULT 'UNCERTAIN',
	"notes" text DEFAULT '',
	"is_critical" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idea_id" uuid,
	"niche_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"word_count" integer DEFAULT 0,
	"estimated_duration_sec" integer DEFAULT 0,
	"structure" jsonb DEFAULT '{}'::jsonb,
	"version" integer DEFAULT 1,
	"status" text DEFAULT 'draft',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_metadata" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text DEFAULT '',
	"description" text DEFAULT '',
	"chapters" jsonb DEFAULT '[]'::jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"hashtags" jsonb DEFAULT '[]'::jsonb,
	"category" text DEFAULT '',
	"category_id" text DEFAULT '22',
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "seo_metadata_project_id_unique" UNIQUE("project_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "storyboard_scenes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storyboard_id" uuid NOT NULL,
	"scene_index" integer NOT NULL,
	"start_sec" real DEFAULT 0,
	"end_sec" real DEFAULT 0,
	"narration" text DEFAULT '',
	"visual" text DEFAULT '',
	"broll" text DEFAULT '',
	"caption" text DEFAULT '',
	"text_overlay" text DEFAULT '',
	"music" text DEFAULT '',
	"sfx" text DEFAULT '',
	"transition" text DEFAULT 'cut',
	"asset_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storyboards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"script_id" uuid NOT NULL,
	"project_id" uuid,
	"total_duration_sec" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"niche_id" uuid NOT NULL,
	"recommendation" text DEFAULT '',
	"why_now" text DEFAULT '',
	"why_topic" text DEFAULT '',
	"why_format" text DEFAULT '',
	"why_hook" text DEFAULT '',
	"why_length" text DEFAULT '',
	"planned_topic" text DEFAULT '',
	"planned_format" text DEFAULT '',
	"planned_hook" text DEFAULT '',
	"planned_length_sec" integer DEFAULT 0,
	"confidence" real DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "thumbnails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"concept" text DEFAULT '',
	"image_path" text DEFAULT '',
	"svg" text DEFAULT '',
	"clarity" real DEFAULT 0,
	"curiosity" real DEFAULT 0,
	"emotion" real DEFAULT 0,
	"composition" real DEFAULT 0,
	"mobile_readability" real DEFAULT 0,
	"niche_relevance" real DEFAULT 0,
	"total_score" real DEFAULT 0,
	"selected" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "title_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"curiosity" real DEFAULT 0,
	"clarity" real DEFAULT 0,
	"relevance" real DEFAULT 0,
	"freshness" real DEFAULT 0,
	"search_usefulness" real DEFAULT 0,
	"emotional_appeal" real DEFAULT 0,
	"clickbait_risk" real DEFAULT 0,
	"total_score" real DEFAULT 0,
	"selected" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"niche_id" uuid NOT NULL,
	"topic" text NOT NULL,
	"classification" text DEFAULT 'stable',
	"trend_score" real DEFAULT 0,
	"freshness" real DEFAULT 0,
	"audience_interest" real DEFAULT 0,
	"velocity" real DEFAULT 0,
	"competition" real DEFAULT 0,
	"content_gap" real DEFAULT 0,
	"signals" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"youtube_video_id" text DEFAULT '',
	"privacy" text DEFAULT 'private',
	"scheduled_at" timestamp,
	"playlist_id" text DEFAULT '',
	"status" text DEFAULT 'prepared',
	"progress" real DEFAULT 0,
	"attempt_count" integer DEFAULT 0,
	"last_error" text DEFAULT '',
	"upload_url" text DEFAULT '',
	"state_json" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text DEFAULT 'Creator' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "video_performances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"what_worked" jsonb DEFAULT '[]'::jsonb,
	"what_failed" jsonb DEFAULT '[]'::jsonb,
	"next_actions" jsonb DEFAULT '[]'::jsonb,
	"hook_strength" real DEFAULT 0,
	"topic_strength" real DEFAULT 0,
	"title_strength" real DEFAULT 0,
	"thumbnail_strength" real DEFAULT 0,
	"retention_score" real DEFAULT 0,
	"pacing_score" real DEFAULT 0,
	"cta_score" real DEFAULT 0,
	"vs_channel_avg" real DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "video_performances_project_id_unique" UNIQUE("project_id")
);
--> statement-breakpoint
CREATE TABLE "video_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"niche_id" uuid NOT NULL,
	"idea_id" uuid,
	"script_id" uuid,
	"title" text NOT NULL,
	"format" text DEFAULT 'long-form',
	"aspect_ratio" text DEFAULT '16:9',
	"resolution" text DEFAULT '1920x1080',
	"stage" text DEFAULT 'research',
	"status" text DEFAULT 'active',
	"error" text DEFAULT '',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"script_id" uuid,
	"scene_id" uuid,
	"provider" text DEFAULT 'local',
	"voice_name" text DEFAULT 'narrator',
	"language" text DEFAULT 'en',
	"tone" text DEFAULT 'neutral',
	"speed" real DEFAULT 1,
	"emotion" text DEFAULT 'neutral',
	"text" text DEFAULT '',
	"audio_path" text DEFAULT '',
	"duration_sec" real DEFAULT 0,
	"status" text DEFAULT 'pending',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "youtube_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"access_token" text DEFAULT '',
	"refresh_token" text DEFAULT '',
	"expires_at" timestamp,
	"scope" text DEFAULT '',
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "youtube_tokens_channel_id_unique" UNIQUE("channel_id")
);
--> statement-breakpoint
ALTER TABLE "analytics_snapshots" ADD CONSTRAINT "analytics_snapshots_project_id_video_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."video_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_snapshots" ADD CONSTRAINT "analytics_snapshots_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_niche_id_niches_id_fk" FOREIGN KEY ("niche_id") REFERENCES "public"."niches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_settings" ADD CONSTRAINT "automation_settings_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_memories" ADD CONSTRAINT "channel_memories_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_niche_id_niches_id_fk" FOREIGN KEY ("niche_id") REFERENCES "public"."niches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_calendars" ADD CONSTRAINT "content_calendars_niche_id_niches_id_fk" FOREIGN KEY ("niche_id") REFERENCES "public"."niches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_calendars" ADD CONSTRAINT "content_calendars_project_id_video_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."video_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_ideas" ADD CONSTRAINT "content_ideas_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_ideas" ADD CONSTRAINT "content_ideas_niche_id_niches_id_fk" FOREIGN KEY ("niche_id") REFERENCES "public"."niches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_records" ADD CONSTRAINT "cost_records_project_id_video_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."video_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_records" ADD CONSTRAINT "cost_records_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edit_decision_lists" ADD CONSTRAINT "edit_decision_lists_project_id_video_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."video_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "niche_profiles" ADD CONSTRAINT "niche_profiles_niche_id_niches_id_fk" FOREIGN KEY ("niche_id") REFERENCES "public"."niches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "niches" ADD CONSTRAINT "niches_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_niche_id_niches_id_fk" FOREIGN KEY ("niche_id") REFERENCES "public"."niches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_trend_id_trends_id_fk" FOREIGN KEY ("trend_id") REFERENCES "public"."trends"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_gates" ADD CONSTRAINT "quality_gates_project_id_video_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."video_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_videos" ADD CONSTRAINT "reference_videos_niche_id_niches_id_fk" FOREIGN KEY ("niche_id") REFERENCES "public"."niches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renders" ADD CONSTRAINT "renders_project_id_video_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."video_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_results" ADD CONSTRAINT "research_results_niche_id_niches_id_fk" FOREIGN KEY ("niche_id") REFERENCES "public"."niches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_facts" ADD CONSTRAINT "script_facts_script_id_scripts_id_fk" FOREIGN KEY ("script_id") REFERENCES "public"."scripts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scripts" ADD CONSTRAINT "scripts_idea_id_content_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."content_ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scripts" ADD CONSTRAINT "scripts_niche_id_niches_id_fk" FOREIGN KEY ("niche_id") REFERENCES "public"."niches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_metadata" ADD CONSTRAINT "seo_metadata_project_id_video_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."video_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storyboard_scenes" ADD CONSTRAINT "storyboard_scenes_storyboard_id_storyboards_id_fk" FOREIGN KEY ("storyboard_id") REFERENCES "public"."storyboards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storyboards" ADD CONSTRAINT "storyboards_script_id_scripts_id_fk" FOREIGN KEY ("script_id") REFERENCES "public"."scripts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategies" ADD CONSTRAINT "strategies_niche_id_niches_id_fk" FOREIGN KEY ("niche_id") REFERENCES "public"."niches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thumbnails" ADD CONSTRAINT "thumbnails_project_id_video_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."video_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title_options" ADD CONSTRAINT "title_options_project_id_video_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."video_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trends" ADD CONSTRAINT "trends_niche_id_niches_id_fk" FOREIGN KEY ("niche_id") REFERENCES "public"."niches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_project_id_video_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."video_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_performances" ADD CONSTRAINT "video_performances_project_id_video_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."video_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_projects" ADD CONSTRAINT "video_projects_niche_id_niches_id_fk" FOREIGN KEY ("niche_id") REFERENCES "public"."niches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_projects" ADD CONSTRAINT "video_projects_idea_id_content_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."content_ideas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_projects" ADD CONSTRAINT "video_projects_script_id_scripts_id_fk" FOREIGN KEY ("script_id") REFERENCES "public"."scripts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voices" ADD CONSTRAINT "voices_script_id_scripts_id_fk" FOREIGN KEY ("script_id") REFERENCES "public"."scripts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youtube_tokens" ADD CONSTRAINT "youtube_tokens_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cal_niche_date" ON "content_calendars" USING btree ("niche_id","scheduled_date");--> statement-breakpoint
CREATE INDEX "jobs_type_status" ON "jobs" USING btree ("type","status");--> statement-breakpoint
CREATE UNIQUE INDEX "quota_provider_date" ON "quota_usage" USING btree ("provider","date");--> statement-breakpoint
CREATE UNIQUE INDEX "refvid_niche_videoid" ON "reference_videos" USING btree ("niche_id","video_id");