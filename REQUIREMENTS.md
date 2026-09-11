# REQUIREMENTS TRACEABILITY — Autonomous YouTube AI

Stack: Next.js 16 (App Router) + TypeScript + PostgreSQL + Drizzle ORM + Tailwind.
Decision (per §36): existing repo is Next.js+Postgres; Python/FastAPI split was rejected to avoid
rewriting a working architecture — all backend runs as Next.js route handlers + job runner with the
same provider abstractions, FFmpeg renderer, and local-worker queue with resumable persisted jobs.

| ID | Requirement | Implementation | Test | Status |
|---|---|---|---|---|
| REQ-001 | Niche configuration (setup wizard) | `src/components/dashboard.tsx` SetupWizard → `POST /api/v1/content?action=setup-wizard` | E2E `niche-created` + UI wizard | PASS |
| REQ-002 | Niche intelligence system | `buildNicheProfile` in `src/lib/engines.ts`, `nicheProfiles` table | E2E `niche-profile` | PASS |
| REQ-003 | YouTube research (search, metadata, velocity) | `ytSearch`/`ytVideos` in `src/lib/system.ts`, RESEARCH job, quota tracking | E2E `research`, failure drill | PASS |
| REQ-004 | Reference video analysis (hook→CTA) | `analyzeReferenceVideo` in engines; stored per video | E2E `research` | PASS |
| REQ-005 | Originality-first (no cloning) | Reference→patterns→independent research→original script; `originalityCheck` gate | E2E `originality` | PASS |
| REQ-006 | Trend engine + TREND SCORE 0-100 | `scoreTrend` + TREND job + `trends` table | E2E `trends` | PASS |
| REQ-007 | Opportunity engine + ranking | `scoreOpportunity` + IDEA job + `opportunities` | E2E `opportunities+ideas` | PASS |
| REQ-008 | Idea engine (5+/opportunity, ranked) | `generateIdeas` + `contentIdeas` | E2E `opportunities+ideas` | PASS |
| REQ-009 | Script engine (retention structure) | `generateScript` + SCRIPT job + `scripts` | E2E `script` | PASS |
| REQ-010 | Fact checking (VERIFIED/LIKELY/UNCERTAIN/CONTRADICTED) | `verifyClaim` + FACT_CHECK job + `scriptFacts`; critical blocks | E2E `fact-check`, drill `quality-block` | PASS |
| REQ-011 | Originality check blocks Regen | `originalityCheck` + quality gate | E2E `originality` | PASS |
| REQ-012 | Storyboard (editable scenes) | `buildStoryboard`/`timeScenes` + `storyboards`/`storyboardScenes` + Studio UI editor | E2E `storyboard+edl`, UI | PASS |
| REQ-013 | Asset system + license/rights tracking | `assets` table, ASSET job, upload endpoint with license fields | E2E `storyboard+edl` | PASS |
| REQ-014 | Voice system (provider abstraction, per-scene) | `VoiceProvider` (local-synth + cloud-tts), VOICE job, `voices` | E2E `storyboard+edl` | PASS |
| REQ-015 | Real video pipeline (FFmpeg, 9:16/16:9, captions, overlays, normalize) | `renderVideo` in system.ts, RENDER job, `renders` | E2E `render` | PASS |
| REQ-016 | Automatic editing intelligence (pacing report) | `buildEDL` pacing analysis + auto-fixes | E2E `storyboard+edl` | PASS |
| REQ-017 | Thumbnail engine (multi-concept + scoring + select) | `scoreThumbnail`, `generatePackaging`, Packaging tab | E2E `packaging` | PASS |
| REQ-018 | Title engine (multi-title + scoring, anti-clickbait) | `scoreTitle`, `generateTitles`, select flow | E2E `packaging` | PASS |
| REQ-019 | SEO/metadata (desc, chapters, tags, hashtags, category) | `buildSEOMetadata` + `seoMetadata` + editor | E2E `packaging` | PASS |
| REQ-020 | Quality gate (10 checks, PASS/BLOCKED+reasons) | `runQualityGate`/`runQuality` + QUALITY job | E2E `quality-gate`, drill | PASS |
| REQ-021 | YouTube OAuth + upload (resumable, schedule, thumbnail, retry, state) | `oauthUrl`/`exchangeCode`/`refreshAccessToken`/`ytUploadVideo`, UPLOAD job, `uploads`+`youtubeTokens` | Failure drill (IMPLEMENTED — CREDENTIAL REQUIRED for live) | PASS* |
| REQ-022 | Content calendar | `planCalendar` + `contentCalendars` + Strategy tab | API plan-calendar | PASS |
| REQ-023 | Analytics collection | `ytAnalytics` + Data API fallback + ANALYTICS job + `analyticsSnapshots` | E2E analytics step (IMPLEMENTED — CREDENTIAL REQUIRED for live) | PASS* |
| REQ-024 | Video autopsy (worked/failed/actions) | `buildAutopsy` + autopsy endpoint + `videoPerformances` | E2E analytics step | PASS |
| REQ-025 | Channel memory (persistent learning) | `getMemory`/`updateMemoryFromAutopsy` + `channelMemories`, used by idea+strategy | E2E analytics step | PASS |
| REQ-026 | Strategy agent (WHY NOW/TOPIC/FORMAT/HOOK/LENGTH) | `buildStrategy` + strategy endpoint + `strategies` | E2E analytics step | PASS |
| REQ-027 | Autopilot (manual/semi/autopilot + limits + gates) | `runAutonomousLoop`, AUTONOMOUS job, `automationSettings` | Tests tab + Today run | PASS |
| REQ-028 | Job system (12 types, id/status/progress/logs/retry/error/timestamps) | `jobs` table + `jobHandlers` + `runJobNow` + Jobs tab | Drill `failed-job-retry` | PASS |
| REQ-029 | Cost control (per-video, cap, pause+approval) | `recordCost`/`estimateVideoCost`/`projectCost` + loop cost guard | E2E (cost rows written) | PASS |
| REQ-030 | SaaS dashboard (Today/health/recommendation/pipeline) | Today tab + dashboard endpoint | UI | PASS |
| REQ-031 | Database models (all 30+ entities) | `src/db/schema.ts` | `drizzle-kit push` + E2E | PASS |
| REQ-032 | Security (auth, hashed pw, sessions, server-side secrets) | `hashPassword`/`verifyPassword`, sessions, no keys in browser | login/signup flow | PASS |
| REQ-033 | Provider abstraction (LLM/Voice/Image/Storage/Research) | `src/lib/providers.ts` + providerOverview | Settings tab | PASS |
| REQ-034 | Works-locally vs credential-required distinction | `providerOverview` + honest "Integration not configured" states everywhere | Settings + drill | PASS |
| REQ-035 | Automated tests (unit-ish engines + E2E + failures) | `/api/v1/ops?action=e2e`, `failure-drill`, Tests tab | Tests tab | PASS |
| REQ-036 | Production readiness (typecheck/build/tests) | `npx next typegen`, `tsc --noEmit`, `npm run build`, `build_and_start` | Final validation | PASS |

PASS* = implemented and exercised; live external call requires user credentials (honestly reported).
