// Ops API: dashboard, jobs, analytics, autopsy, costs, providers, quota,
// end-to-end pipeline test, failure drill.
import { db } from "@/db";
import * as s from "@/db/schema";
import { eq, desc, and, gte, inArray } from "drizzle-orm";
import { getSessionUser, userOwnsChannel, userOwnsProject, userOwnsNiche, userCanAccessJob, recentJobs, runJobNow, channelHealth, getQuota, runE2EPipeline, runFailureDrill, ffmpegAvailable, ffprobeAvailable, updateMemoryFromAutopsy, getCreatorIdentity } from "@/lib/system";
import { providerOverview } from "@/lib/providers";
import { buildAutopsy } from "@/lib/engines";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { storageDevelopmentTest, storageHealth } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}
async function body<T>(req: Request): Promise<T> {
  try { return (await req.json()) as T; } catch { return {} as T; }
}

async function visibleJobs(userId: string, jobs: Awaited<ReturnType<typeof recentJobs>>) {
  const visible = [];
  for (const job of jobs) if (await userCanAccessJob(userId, job)) visible.push(job);
  return visible;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "";
  const id = url.searchParams.get("id") || "";
  try {
    if (action === "providers") return json({ providers: providerOverview(), ffmpeg: ffmpegAvailable(), ffprobe: ffprobeAvailable() });
    const user = await getSessionUser(req);
    if (!user) return json({ error: "Unauthorized" }, 401);
    if (action === "quota") return json({ quota: await getQuota("youtube") });
    if (action === "storage-health") return json(await storageHealth());

    if (action === "dashboard") {
      // id = channelId (optional); aggregate across user channels otherwise
      const chans = await db.select().from(s.channels).where(eq(s.channels.userId, user.id));
      if (id && !chans.some((channelRow) => channelRow.id === id)) return json({ error: "Unauthorized" }, 401);
      const channel = id ? chans.find((c) => c.id === id) : chans[0];
      if (!channel) return json({ empty: true });
      const niches = await db.select().from(s.niches).where(eq(s.niches.channelId, channel.id));
      const niche = niches[0];
      const opps = niche ? await db.select().from(s.opportunities).where(eq(s.opportunities.nicheId, niche.id)).orderBy(desc(s.opportunities.opportunityScore)).limit(5) : [];
      const trends = niche ? await db.select().from(s.trends).where(eq(s.trends.nicheId, niche.id)).orderBy(desc(s.trends.trendScore)).limit(5) : [];
      const projects = niche ? await db.select().from(s.videoProjects).where(eq(s.videoProjects.nicheId, niche.id)).orderBy(desc(s.videoProjects.createdAt)).limit(20) : [];
      const ideas = niche ? await db.select().from(s.contentIdeas).where(eq(s.contentIdeas.nicheId, niche.id)).orderBy(desc(s.contentIdeas.score)).limit(20) : [];
      const strat = niche ? (await db.select().from(s.strategies).where(eq(s.strategies.nicheId, niche.id)).orderBy(desc(s.strategies.createdAt)).limit(1))[0] ?? null : null;
      const memory = channel ? await db.select().from(s.channelMemories).where(eq(s.channelMemories.channelId, channel.id)).limit(1) : [];
      const projectIds = projects.map((project) => project.id);
      const performances = projectIds.length ? await db.select().from(s.videoPerformances).where(inArray(s.videoPerformances.projectId, projectIds)).limit(10) : [];
      const cal = niche ? await db.select().from(s.contentCalendars).where(and(eq(s.contentCalendars.nicheId, niche.id), gte(s.contentCalendars.scheduledDate, new Date()))).orderBy(s.contentCalendars.scheduledDate).limit(10) : [];
      const health = await channelHealth(channel.id);
      const jobs = await visibleJobs(user.id, await recentJobs(50));
      const pipeline = {
        research: niche ? (await db.select().from(s.researchResults).where(eq(s.researchResults.nicheId, niche.id)).limit(1)).length : 0,
        ideas: ideas.length, scripts: niche ? (await db.select().from(s.scripts).where(eq(s.scripts.nicheId, niche.id)).limit(100)).length : 0,
        inProduction: projects.filter((p) => ["script", "production"].includes(p.stage ?? "")).length,
        inQA: projects.filter((p) => p.stage === "qa" || p.status === "blocked_qa").length,
        published: projects.filter((p) => p.stage === "published").length,
      };
      const creatorIdentity = channel ? await getCreatorIdentity(channel.id) : null;
      return json({ channels: chans, channel, niche, opportunities: opps, trends, projects, ideas, strategy: strat, memory: memory[0] ?? null, performances, creatorIdentity, calendar: cal, health, jobs, pipeline });
    }

    if (action === "jobs") return json({ jobs: await visibleJobs(user.id, await recentJobs(50)) });
    if (action === "job") {
      const rows = await db.select().from(s.jobs).where(eq(s.jobs.id, id)).limit(1);
      if (rows[0] && !await userCanAccessJob(user.id, rows[0])) return json({ error: "Unauthorized" }, 401);
      return json({ job: rows[0] ?? null });
    }
    if (action === "analytics") {
      if (!await userOwnsChannel(user.id, id)) return json({ error: "Unauthorized" }, 401);
      const snaps = await db.select().from(s.analyticsSnapshots).where(eq(s.analyticsSnapshots.channelId, id)).orderBy(desc(s.analyticsSnapshots.capturedAt)).limit(50);
      const niches = await db.select({ id: s.niches.id }).from(s.niches).where(eq(s.niches.channelId, id));
      const projects = niches.length ? await db.select({ id: s.videoProjects.id }).from(s.videoProjects).where(inArray(s.videoProjects.nicheId, niches.map((n) => n.id))) : [];
      const perfs = projects.length ? await db.select().from(s.videoPerformances).where(inArray(s.videoPerformances.projectId, projects.map((p) => p.id))).limit(50) : [];
      return json({ snapshots: snaps, performances: perfs });
    }
    if (action === "project-analytics") {
      if (!await userOwnsProject(user.id, id)) return json({ error: "Unauthorized" }, 401);
      const snaps = await db.select().from(s.analyticsSnapshots).where(eq(s.analyticsSnapshots.projectId, id)).orderBy(desc(s.analyticsSnapshots.capturedAt)).limit(20);
      const perf = await db.select().from(s.videoPerformances).where(eq(s.videoPerformances.projectId, id)).limit(1);
      return json({ snapshots: snaps, performance: perf[0] ?? null });
    }
    if (action === "costs") {
      const niches = await db.select({ id: s.niches.id }).from(s.niches).innerJoin(s.channels, eq(s.channels.id, s.niches.channelId)).where(eq(s.channels.userId, user.id));
      const projects = niches.length ? await db.select({ id: s.videoProjects.id }).from(s.videoProjects).where(inArray(s.videoProjects.nicheId, niches.map((n) => n.id))) : [];
      const rows = projects.length ? await db.select().from(s.costRecords).where(inArray(s.costRecords.projectId, projects.map((p) => p.id))).orderBy(desc(s.costRecords.createdAt)).limit(100) : [];
      const total = rows.reduce((a, r) => a + (r.amountUsd ?? 0), 0);
      return json({ costs: rows, total });
    }
    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "failed" }, 500);
  }
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "";
  try {
    const user = await getSessionUser(req);
    if (!user) return json({ error: "Unauthorized" }, 401);
    if (action === "e2e") {
      if (process.env.NODE_ENV === "production") return json({ error: "E2E data test is disabled in production" }, 403);
      const logs: string[] = [];
      const result = await runE2EPipeline(async (m) => { logs.push(m); });
      return json({ ...result, logs });
    }
    if (action === "failure-drill") {
      if (process.env.NODE_ENV === "production") return json({ error: "Failure drill is disabled in production" }, 403);
      const result = await runFailureDrill();
      return json({ drills: result });
    }
    if (action === "storage-test") {
      if (process.env.NODE_ENV === "production") return json({ error: "Storage test is disabled in production" }, 403);
      return json(await storageDevelopmentTest());
    }
    if (action === "retry-job") {
      const gate = rateLimit(user.id, "retry-job", { limit: 10, windowMs: 60_000 });
      if (!gate.allowed) return rateLimitResponse(gate.retryAfterSec);
      const b = await body<{ jobId: string }>(req);
      const rows = await db.select().from(s.jobs).where(eq(s.jobs.id, b.jobId)).limit(1);
      if (!rows[0]) return json({ error: "Job not found" }, 404);
      if (!await userCanAccessJob(user.id, rows[0])) return json({ error: "Unauthorized" }, 401);
      await db.update(s.jobs).set({ status: "queued", error: "" }).where(eq(s.jobs.id, b.jobId));
      await runJobNow(b.jobId);
      const updated = await db.select().from(s.jobs).where(eq(s.jobs.id, b.jobId)).limit(1);
      return json({ job: updated[0] });
    }
    if (action === "autopsy") {
      const b = await body<{ projectId: string }>(req);
      if (!await userOwnsProject(user.id, b.projectId)) return json({ error: "Unauthorized" }, 401);
      const prows = await db.select().from(s.videoProjects).where(eq(s.videoProjects.id, b.projectId)).limit(1);
      if (!prows[0]) return json({ error: "Project not found" }, 404);
      const snaps = await db.select().from(s.analyticsSnapshots).where(eq(s.analyticsSnapshots.projectId, b.projectId)).orderBy(desc(s.analyticsSnapshots.capturedAt)).limit(1);
      const snap = snaps[0];
      if (!snap) return json({ error: "No analytics snapshot yet — publish and collect analytics first" }, 400);
      const nrows = await db.select().from(s.niches).where(eq(s.niches.id, prows[0].nicheId)).limit(1);
      const health = await channelHealth(nrows[0].channelId);
      const auto = buildAutopsy({
        views: snap.views ?? 0, ctr: snap.ctr ?? 0, avgPercentageViewed: snap.avgPercentageViewed ?? 0,
        likes: snap.likes ?? 0, comments: snap.comments ?? 0,
        channelAvgViews: Math.max(1, Math.round(health.views / Math.max(1, health.samples))),
        channelAvgCtr: health.ctr || 3.5, channelAvgRetention: health.retention || 40,
        title: prows[0].title, topic: prows[0].title,
      });
      const existing = await db.select().from(s.videoPerformances).where(eq(s.videoPerformances.projectId, b.projectId)).limit(1);
      if (existing[0]) await db.update(s.videoPerformances).set({ ...auto }).where(eq(s.videoPerformances.id, existing[0].id));
      else await db.insert(s.videoPerformances).values({ projectId: b.projectId, ...auto });
      const outperformed = auto.vsChannelAvg >= 100;
      const idea = prows[0].ideaId ? (await db.select().from(s.contentIdeas).where(eq(s.contentIdeas.id, prows[0].ideaId)).limit(1))[0] : null;
      await updateMemoryFromAutopsy(nrows[0].channelId, idea?.angle ?? prows[0].title, idea?.hook?.slice(0, 200) ?? "hook", prows[0].format ?? "long-form", outperformed);
      return json({ autopsy: auto, outperformed });
    }
    if (action === "quick-research-seed") {
      // Deterministic seed of reference videos for demo/testing when no YouTube key exists.
      // Clearly labeled as seed data (source: seed) — never presented as live research.
      const b = await body<{ nicheId: string }>(req);
      if (!await userOwnsNiche(user.id, b.nicheId)) return json({ error: "Unauthorized" }, 401);
      const nrows = await db.select().from(s.niches).where(eq(s.niches.id, b.nicheId)).limit(1);
      if (!nrows[0]) return json({ error: "Niche not found" }, 404);
      const niche = nrows[0].primaryNiche;
      const { analyzeReferenceVideo, daysSince, clamp } = await import("@/lib/engines");
      const seeds = [
        { title: `Why This ${niche} Tactic Changed Everything`, views: 850000, age: 6, dur: 742 },
        { title: `7 Things Nobody Tells You About ${niche}`, views: 320000, age: 12, dur: 640 },
        { title: `The Truth About Modern ${niche}`, views: 150000, age: 3, dur: 540 },
        { title: `${niche} Explained in 12 Minutes`, views: 480000, age: 20, dur: 730 },
        { title: `I Studied ${niche} for 30 Days`, views: 210000, age: 9, dur: 690 },
        { title: `Top 10 ${niche} Moments of All Time`, views: 1200000, age: 45, dur: 810 },
      ];
      let n = 0;
      for (const sd of seeds) {
        const pub = new Date(Date.now() - sd.age * 86400000);
        const vpd = sd.views / Math.max(1, daysSince(pub));
        const analysis = analyzeReferenceVideo({ title: sd.title, viewCount: sd.views, likeCount: Math.round(sd.views * 0.05), commentCount: Math.round(sd.views * 0.004), durationSec: sd.dur, publishedAt: pub });
        await db.insert(s.referenceVideos).values({
          nicheId: b.nicheId, videoId: `seed-${Date.now()}-${n}`, title: sd.title, channelName: "Seed reference (sample)", channelId: "seed",
          publishedAt: pub, durationSec: sd.dur, viewCount: sd.views, likeCount: Math.round(sd.views * 0.05), commentCount: Math.round(sd.views * 0.004),
          description: "Sample reference for pipeline testing. Connect YOUTUBE_API_KEY for live research.", tags: [], category: "22",
          thumbnailUrl: "", viewsPerDay: vpd, velocityScore: clamp(Math.log10(1 + vpd) * 22), isShort: false, analysis: { ...analysis, seed: true },
        }).onConflictDoNothing();
        n++;
      }
      await db.insert(s.researchResults).values({ nicheId: b.nicheId, query: niche, queryType: "seed", resultCount: n, summary: `${n} clearly-labeled sample references seeded for pipeline testing.` });
      return json({ seeded: n });
    }
    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "failed" }, 500);
  }
}
