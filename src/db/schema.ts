import {
  pgTable, text, timestamp, integer, real, boolean, jsonb, uuid, index, uniqueIndex,
} from "drizzle-orm/pg-core";

// ─── Auth ─────────────────────────────────────────────
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull().default("Creator"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Channel / Niche ──────────────────────────────────
export const channels = pgTable("channels", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  youtubeChannelId: text("youtube_channel_id").default(""),
  channelUrl: text("channel_url").default(""),
  country: text("country").default("US"),
  language: text("language").default("en"),
  targetAudience: text("target_audience").default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const niches = pgTable("niches", {
  id: uuid("id").primaryKey().defaultRandom(),
  channelId: uuid("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
  primaryNiche: text("primary_niche").notNull(),
  subNiches: jsonb("sub_niches").$type<string[]>().default([]),
  topicsToAvoid: jsonb("topics_to_avoid").$type<string[]>().default([]),
  preferredFormats: jsonb("preferred_formats").$type<string[]>().default(["long-form"]),
  contentType: text("content_type").default("both"),
  targetDurationSec: integer("target_duration_sec").default(480),
  videosPerDay: integer("videos_per_day").default(1),
  videosPerWeek: integer("videos_per_week").default(3),
  tone: text("tone").default("energetic"),
  voiceStyle: text("voice_style").default("neutral"),
  editingStyle: text("editing_style").default("dynamic"),
  visualStyle: text("visual_style").default("cinematic"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const nicheProfiles = pgTable("niche_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  nicheId: uuid("niche_id").notNull().references(() => niches.id, { onDelete: "cascade" }).unique(),
  audience: text("audience").default(""),
  subtopics: jsonb("subtopics").$type<string[]>().default([]),
  evergreenTopics: jsonb("evergreen_topics").$type<string[]>().default([]),
  breakingTopics: jsonb("breaking_topics").$type<string[]>().default([]),
  seasonalTopics: jsonb("seasonal_topics").$type<string[]>().default([]),
  keywords: jsonb("keywords").$type<string[]>().default([]),
  contentGaps: jsonb("content_gaps").$type<string[]>().default([]),
  successfulFormats: jsonb("successful_formats").$type<string[]>().default([]),
  successfulHooks: jsonb("successful_hooks").$type<string[]>().default([]),
  titlePatterns: jsonb("title_patterns").$type<string[]>().default([]),
  thumbnailPatterns: jsonb("thumbnail_patterns").$type<string[]>().default([]),
  durationPatterns: text("duration_patterns").default(""),
  uploadPatterns: text("upload_patterns").default(""),
  rawProfile: jsonb("raw_profile").$type<Record<string, unknown>>().default({}),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const competitors = pgTable("competitors", {
  id: uuid("id").primaryKey().defaultRandom(),
  nicheId: uuid("niche_id").notNull().references(() => niches.id, { onDelete: "cascade" }),
  channelId: text("channel_id").default(""),
  channelName: text("channel_name").notNull(),
  channelUrl: text("channel_url").default(""),
  subscriberCount: integer("subscriber_count").default(0),
  avgViews: integer("avg_views").default(0),
  uploadFrequency: text("upload_frequency").default(""),
  notes: text("notes").default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Research ─────────────────────────────────────────
export const referenceVideos = pgTable("reference_videos", {
  id: uuid("id").primaryKey().defaultRandom(),
  nicheId: uuid("niche_id").notNull().references(() => niches.id, { onDelete: "cascade" }),
  videoId: text("video_id").notNull(),
  title: text("title").notNull(),
  channelName: text("channel_name").default(""),
  channelId: text("channel_id").default(""),
  publishedAt: timestamp("published_at"),
  durationSec: integer("duration_sec").default(0),
  viewCount: integer("view_count").default(0),
  likeCount: integer("like_count").default(0),
  commentCount: integer("comment_count").default(0),
  description: text("description").default(""),
  tags: jsonb("tags").$type<string[]>().default([]),
  category: text("category").default(""),
  thumbnailUrl: text("thumbnail_url").default(""),
  viewsPerDay: real("views_per_day").default(0),
  velocityScore: real("velocity_score").default(0),
  isShort: boolean("is_short").default(false),
  analysis: jsonb("analysis").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("refvid_niche_videoid").on(t.nicheId, t.videoId)]);

export const researchResults = pgTable("research_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  nicheId: uuid("niche_id").notNull().references(() => niches.id, { onDelete: "cascade" }),
  query: text("query").notNull(),
  queryType: text("query_type").default("keyword"),
  resultCount: integer("result_count").default(0),
  summary: text("summary").default(""),
  rawData: jsonb("raw_data").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const quotaUsage = pgTable("quota_usage", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull().default("youtube"),
  date: text("date").notNull(),
  unitsUsed: integer("units_used").default(0),
  unitsLimit: integer("units_limit").default(10000),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("quota_provider_date").on(t.provider, t.date)]);

// ─── Trends / Opportunities / Ideas ───────────────────
export const trends = pgTable("trends", {
  id: uuid("id").primaryKey().defaultRandom(),
  nicheId: uuid("niche_id").notNull().references(() => niches.id, { onDelete: "cascade" }),
  topic: text("topic").notNull(),
  classification: text("classification").default("stable"),
  trendScore: real("trend_score").default(0),
  freshness: real("freshness").default(0),
  audienceInterest: real("audience_interest").default(0),
  velocity: real("velocity").default(0),
  competition: real("competition").default(0),
  contentGap: real("content_gap").default(0),
  signals: jsonb("signals").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const opportunities = pgTable("opportunities", {
  id: uuid("id").primaryKey().defaultRandom(),
  nicheId: uuid("niche_id").notNull().references(() => niches.id, { onDelete: "cascade" }),
  trendId: uuid("trend_id").references(() => trends.id, { onDelete: "set null" }),
  topic: text("topic").notNull(),
  opportunityScore: real("opportunity_score").default(0),
  demand: real("demand").default(0),
  trendVelocity: real("trend_velocity").default(0),
  competitionLevel: real("competition_level").default(0),
  freshness: real("freshness").default(0),
  channelFit: real("channel_fit").default(0),
  gapScore: real("gap_score").default(0),
  productionDifficulty: real("production_difficulty").default(0),
  historicalFit: real("historical_fit").default(0),
  status: text("status").default("ranked"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const contentIdeas = pgTable("content_ideas", {
  id: uuid("id").primaryKey().defaultRandom(),
  opportunityId: uuid("opportunity_id").references(() => opportunities.id, { onDelete: "cascade" }),
  nicheId: uuid("niche_id").notNull().references(() => niches.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  titleIdeas: jsonb("title_ideas").$type<string[]>().default([]),
  hook: text("hook").default(""),
  angle: text("angle").default(""),
  audience: text("audience").default(""),
  format: text("format").default("long-form"),
  durationSec: integer("duration_sec").default(480),
  narrativeStructure: text("narrative_structure").default(""),
  visualConcept: text("visual_concept").default(""),
  thumbnailConcept: text("thumbnail_concept").default(""),
  whyItMayWork: text("why_it_may_work").default(""),
  risks: text("risks").default(""),
  researchRequirements: text("research_requirements").default(""),
  score: real("score").default(0),
  status: text("status").default("proposed"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Script / Facts / Storyboard ──────────────────────
export const scripts = pgTable("scripts", {
  id: uuid("id").primaryKey().defaultRandom(),
  ideaId: uuid("idea_id").references(() => contentIdeas.id, { onDelete: "cascade" }),
  nicheId: uuid("niche_id").notNull().references(() => niches.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body").notNull(),
  wordCount: integer("word_count").default(0),
  estimatedDurationSec: integer("estimated_duration_sec").default(0),
  structure: jsonb("structure").$type<Record<string, unknown>>().default({}),
  version: integer("version").default(1),
  status: text("status").default("draft"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const scriptFacts = pgTable("script_facts", {
  id: uuid("id").primaryKey().defaultRandom(),
  scriptId: uuid("script_id").notNull().references(() => scripts.id, { onDelete: "cascade" }),
  claim: text("claim").notNull(),
  source: text("source").default(""),
  url: text("url").default(""),
  confidence: real("confidence").default(0),
  status: text("status").default("UNCERTAIN"),
  notes: text("notes").default(""),
  isCritical: boolean("is_critical").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const storyboards = pgTable("storyboards", {
  id: uuid("id").primaryKey().defaultRandom(),
  scriptId: uuid("script_id").notNull().references(() => scripts.id, { onDelete: "cascade" }),
  projectId: uuid("project_id"),
  totalDurationSec: integer("total_duration_sec").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const storyboardScenes = pgTable("storyboard_scenes", {
  id: uuid("id").primaryKey().defaultRandom(),
  storyboardId: uuid("storyboard_id").notNull().references(() => storyboards.id, { onDelete: "cascade" }),
  sceneIndex: integer("scene_index").notNull(),
  startSec: real("start_sec").default(0),
  endSec: real("end_sec").default(0),
  narration: text("narration").default(""),
  visual: text("visual").default(""),
  visualPlan: jsonb("visual_plan").$type<Record<string, unknown>>().default({}),
  broll: text("broll").default(""),
  caption: text("caption").default(""),
  textOverlay: text("text_overlay").default(""),
  music: text("music").default(""),
  sfx: text("sfx").default(""),
  transition: text("transition").default("cut"),
  assetId: uuid("asset_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Assets / Voice ───────────────────────────────────
export const assets = pgTable("assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  nicheId: uuid("niche_id").references(() => niches.id, { onDelete: "set null" }),
  projectId: uuid("project_id"),
  kind: text("kind").notNull().default("image"),
  fileName: text("file_name").default(""),
  storagePath: text("storage_path").default(""),
  remoteUrl: text("remote_url").default(""),
  source: text("source").default("generated"),
  license: text("license").default("original"),
  attribution: text("attribution").default(""),
  rights: text("rights").default("owned"),
  width: integer("width").default(0),
  height: integer("height").default(0),
  durationSec: real("duration_sec").default(0),
  meta: jsonb("meta").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const voices = pgTable("voices", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id"),
  scriptId: uuid("script_id").references(() => scripts.id, { onDelete: "set null" }),
  sceneId: uuid("scene_id"),
  provider: text("provider").default("local"),
  voiceName: text("voice_name").default("narrator"),
  language: text("language").default("en"),
  tone: text("tone").default("neutral"),
  speed: real("speed").default(1.0),
  emotion: text("emotion").default("neutral"),
  text: text("text").default(""),
  audioPath: text("audio_path").default(""),
  durationSec: real("duration_sec").default(0),
  status: text("status").default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Video project / EDL / Render ─────────────────────
export const videoProjects = pgTable("video_projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  nicheId: uuid("niche_id").notNull().references(() => niches.id, { onDelete: "cascade" }),
  ideaId: uuid("idea_id").references(() => contentIdeas.id, { onDelete: "set null" }),
  scriptId: uuid("script_id").references(() => scripts.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  format: text("format").default("long-form"),
  aspectRatio: text("aspect_ratio").default("16:9"),
  resolution: text("resolution").default("1920x1080"),
  stage: text("stage").default("research"),
  status: text("status").default("active"),
  error: text("error").default(""),
  creatorIdentity: jsonb("creator_identity").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const editDecisionLists = pgTable("edit_decision_lists", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => videoProjects.id, { onDelete: "cascade" }).unique(),
  edl: jsonb("edl").$type<Record<string, unknown>>().default({}),
  version: integer("version").default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const renders = pgTable("renders", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => videoProjects.id, { onDelete: "cascade" }),
  outputPath: text("output_path").default(""),
  previewHtml: text("preview_html").default(""),
  status: text("status").default("queued"),
  progress: real("progress").default(0),
  log: text("log").default(""),
  durationSec: real("duration_sec").default(0),
  fileSize: integer("file_size").default(0),
  renderer: text("renderer").default("ffmpeg"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Thumbnails / Titles / SEO ────────────────────────
export const thumbnails = pgTable("thumbnails", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => videoProjects.id, { onDelete: "cascade" }),
  concept: text("concept").default(""),
  imagePath: text("image_path").default(""),
  svg: text("svg").default(""),
  clarity: real("clarity").default(0),
  curiosity: real("curiosity").default(0),
  emotion: real("emotion").default(0),
  composition: real("composition").default(0),
  mobileReadability: real("mobile_readability").default(0),
  nicheRelevance: real("niche_relevance").default(0),
  totalScore: real("total_score").default(0),
  selected: boolean("selected").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const titleOptions = pgTable("title_options", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => videoProjects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  curiosity: real("curiosity").default(0),
  clarity: real("clarity").default(0),
  relevance: real("relevance").default(0),
  freshness: real("freshness").default(0),
  searchUsefulness: real("search_usefulness").default(0),
  emotionalAppeal: real("emotional_appeal").default(0),
  clickbaitRisk: real("clickbait_risk").default(0),
  totalScore: real("total_score").default(0),
  selected: boolean("selected").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const seoMetadata = pgTable("seo_metadata", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => videoProjects.id, { onDelete: "cascade" }).unique(),
  title: text("title").default(""),
  description: text("description").default(""),
  chapters: jsonb("chapters").$type<{ time: string; title: string }[]>().default([]),
  tags: jsonb("tags").$type<string[]>().default([]),
  hashtags: jsonb("hashtags").$type<string[]>().default([]),
  category: text("category").default(""),
  categoryId: text("category_id").default("22"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Quality / Upload ─────────────────────────────────
export const qualityGates = pgTable("quality_gates", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => videoProjects.id, { onDelete: "cascade" }),
  facts: text("facts").default("pending"),
  originality: text("originality").default("pending"),
  rights: text("rights").default("pending"),
  policyRisk: text("policy_risk").default("pending"),
  audio: text("audio").default("pending"),
  video: text("video").default("pending"),
  captions: text("captions").default("pending"),
  thumbnail: text("thumbnail").default("pending"),
  title: text("title").default("pending"),
  metadata: text("metadata").default("pending"),
  verdict: text("verdict").default("PENDING"),
  reasons: jsonb("reasons").$type<string[]>().default([]),
  details: jsonb("details").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const uploads = pgTable("uploads", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => videoProjects.id, { onDelete: "cascade" }),
  youtubeVideoId: text("youtube_video_id").default(""),
  privacy: text("privacy").default("private"),
  scheduledAt: timestamp("scheduled_at"),
  playlistId: text("playlist_id").default(""),
  status: text("status").default("prepared"),
  progress: real("progress").default(0),
  attemptCount: integer("attempt_count").default(0),
  lastError: text("last_error").default(""),
  uploadUrl: text("upload_url").default(""),
  stateJson: jsonb("state_json").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const youtubeTokens = pgTable("youtube_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  channelId: uuid("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }).unique(),
  accessToken: text("access_token").default(""),
  refreshToken: text("refresh_token").default(""),
  expiresAt: timestamp("expires_at"),
  scope: text("scope").default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Analytics / Learning / Strategy ──────────────────
export const analyticsSnapshots = pgTable("analytics_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => videoProjects.id, { onDelete: "cascade" }),
  channelId: uuid("channel_id").references(() => channels.id, { onDelete: "cascade" }),
  youtubeVideoId: text("youtube_video_id").default(""),
  views: integer("views").default(0),
  impressions: integer("impressions").default(0),
  ctr: real("ctr").default(0),
  watchTimeSec: integer("watch_time_sec").default(0),
  avgViewDurationSec: real("avg_view_duration_sec").default(0),
  avgPercentageViewed: real("avg_percentage_viewed").default(0),
  likes: integer("likes").default(0),
  comments: integer("comments").default(0),
  shares: integer("shares").default(0),
  subsGained: integer("subs_gained").default(0),
  trafficSources: jsonb("traffic_sources").$type<Record<string, unknown>>().default({}),
  source: text("source").default("youtube"),
  capturedAt: timestamp("captured_at").defaultNow().notNull(),
});

export const videoPerformances = pgTable("video_performances", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => videoProjects.id, { onDelete: "cascade" }).unique(),
  whatWorked: jsonb("what_worked").$type<string[]>().default([]),
  whatFailed: jsonb("what_failed").$type<string[]>().default([]),
  nextActions: jsonb("next_actions").$type<string[]>().default([]),
  hookStrength: real("hook_strength").default(0),
  topicStrength: real("topic_strength").default(0),
  titleStrength: real("title_strength").default(0),
  thumbnailStrength: real("thumbnail_strength").default(0),
  retentionScore: real("retention_score").default(0),
  pacingScore: real("pacing_score").default(0),
  ctaScore: real("cta_score").default(0),
  vsChannelAvg: real("vs_channel_avg").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const channelMemories = pgTable("channel_memories", {
  id: uuid("id").primaryKey().defaultRandom(),
  channelId: uuid("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }).unique(),
  successfulTopics: jsonb("successful_topics").$type<string[]>().default([]),
  failedTopics: jsonb("failed_topics").$type<string[]>().default([]),
  successfulHooks: jsonb("successful_hooks").$type<string[]>().default([]),
  failedHooks: jsonb("failed_hooks").$type<string[]>().default([]),
  successfulLengths: jsonb("successful_lengths").$type<string[]>().default([]),
  successfulTitleStructures: jsonb("successful_title_structures").$type<string[]>().default([]),
  successfulThumbnails: jsonb("successful_thumbnails").$type<string[]>().default([]),
  successfulFormats: jsonb("successful_formats").$type<string[]>().default([]),
  successfulPostingPatterns: jsonb("successful_posting_patterns").$type<string[]>().default([]),
  weights: jsonb("weights").$type<Record<string, number>>().default({}),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const strategies = pgTable("strategies", {
  id: uuid("id").primaryKey().defaultRandom(),
  nicheId: uuid("niche_id").notNull().references(() => niches.id, { onDelete: "cascade" }),
  recommendation: text("recommendation").default(""),
  whyNow: text("why_now").default(""),
  whyTopic: text("why_topic").default(""),
  whyFormat: text("why_format").default(""),
  whyHook: text("why_hook").default(""),
  whyLength: text("why_length").default(""),
  plannedTopic: text("planned_topic").default(""),
  plannedFormat: text("planned_format").default(""),
  plannedHook: text("planned_hook").default(""),
  plannedLengthSec: integer("planned_length_sec").default(0),
  confidence: real("confidence").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const contentCalendars = pgTable("content_calendars", {
  id: uuid("id").primaryKey().defaultRandom(),
  nicheId: uuid("niche_id").notNull().references(() => niches.id, { onDelete: "cascade" }),
  scheduledDate: timestamp("scheduled_date").notNull(),
  topic: text("topic").notNull(),
  format: text("format").default("long-form"),
  projectId: uuid("project_id").references(() => videoProjects.id, { onDelete: "set null" }),
  status: text("status").default("planned"),
  rationale: text("rationale").default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("cal_niche_date").on(t.nicheId, t.scheduledDate)]);

// ─── Jobs / Automation / Costs ────────────────────────
export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull(),
  status: text("status").default("queued"),
  progress: real("progress").default(0),
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}),
  result: jsonb("result").$type<Record<string, unknown>>().default({}),
  logs: jsonb("logs").$type<string[]>().default([]),
  retryCount: integer("retry_count").default(0),
  maxRetries: integer("max_retries").default(3),
  error: text("error").default(""),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("jobs_type_status").on(t.type, t.status)]);

export const automationSettings = pgTable("automation_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  channelId: uuid("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }).unique(),
  mode: text("mode").default("manual"),
  autoResearch: boolean("auto_research").default(true),
  autoIdeas: boolean("auto_ideas").default(true),
  autoScript: boolean("auto_script").default(true),
  autoProduction: boolean("auto_production").default(false),
  autoUpload: boolean("auto_upload").default(false),
  autoPublishing: boolean("auto_publishing").default(false),
  autoAnalytics: boolean("auto_analytics").default(true),
  autoStrategy: boolean("auto_strategy").default(true),
  approvalGates: jsonb("approval_gates").$type<string[]>().default(["script", "publish"]),
  maxVideosPerDay: integer("max_videos_per_day").default(1),
  maxVideosPerWeek: integer("max_videos_per_week").default(3),
  maxCostPerVideo: real("max_cost_per_video").default(5.0),
  allowedNiches: jsonb("allowed_niches").$type<string[]>().default([]),
  creatorName: text("creator_name").default("Vinod Kumar").notNull(),
  brandName: text("brand_name").default("VK YouTube AI").notNull(),
  creatorHandle: text("creator_handle").default(""),
  copyrightLine: text("copyright_line").default("© 2026 Vinod Kumar").notNull(),
  aiAttribution: text("ai_attribution").default("Produced with VK YouTube AI").notNull(),
  socialLinks: jsonb("social_links").$type<string[]>().default([]),
  includeSpokenAttribution: boolean("include_spoken_attribution").default(false).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const costRecords = pgTable("cost_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => videoProjects.id, { onDelete: "cascade" }),
  jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
  category: text("category").notNull(),
  amountUsd: real("amount_usd").default(0),
  detail: text("detail").default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
