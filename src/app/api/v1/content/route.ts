// Content API: auth, setup wizard, niche intelligence, research, trends,
// opportunities, ideas, scripts, facts, storyboard, calendar, strategy, memory.
import { db } from "@/db";
import * as s from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { z } from "zod";
import { hashPassword, verifyPassword, getSessionUser, createJob, runJobNow, ensureProjectForIdea, buildStoryboardAndEDL, getMemory } from "@/lib/system";
import { buildNicheProfile, planCalendar, buildStrategy } from "@/lib/engines";

export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}
async function body<T>(req: Request): Promise<T> {
  try { return (await req.json()) as T; } catch { return {} as T; }
}

// ─── GET ───
export async function GET(req: Request) {
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "";
  const id = url.searchParams.get("id") || "";
  try {
    if (action === "me") {
      const u = await getSessionUser(req);
      return json({ user: u ? { id: u.id, email: u.email, name: u.name } : null });
    }
    if (action === "channels") {
      const u = await getSessionUser(req);
      if (!u) return json({ channels: [] });
      const rows = await db.select().from(s.channels).where(eq(s.channels.userId, u.id)).orderBy(desc(s.channels.createdAt));
      return json({ channels: rows });
    }
    if (action === "channel") {
      const rows = await db.select().from(s.channels).where(eq(s.channels.id, id)).limit(1);
      if (!rows[0]) return json({ error: "Not found" }, 404);
      const niches = await db.select().from(s.niches).where(eq(s.niches.channelId, id));
      const auto = await db.select().from(s.automationSettings).where(eq(s.automationSettings.channelId, id)).limit(1);
      const mem = await db.select().from(s.channelMemories).where(eq(s.channelMemories.channelId, id)).limit(1);
      return json({ channel: rows[0], niches, automation: auto[0] ?? null, memory: mem[0] ?? null });
    }
    if (action === "niche") {
      const rows = await db.select().from(s.niches).where(eq(s.niches.id, id)).limit(1);
      if (!rows[0]) return json({ error: "Not found" }, 404);
      const profile = await db.select().from(s.nicheProfiles).where(eq(s.nicheProfiles.nicheId, id)).limit(1);
      const competitors = await db.select().from(s.competitors).where(eq(s.competitors.nicheId, id));
      return json({ niche: rows[0], profile: profile[0] ?? null, competitors });
    }
    if (action === "references") {
      const rows = await db.select().from(s.referenceVideos).where(eq(s.referenceVideos.nicheId, id)).orderBy(desc(s.referenceVideos.viewsPerDay)).limit(100);
      const research = await db.select().from(s.researchResults).where(eq(s.researchResults.nicheId, id)).orderBy(desc(s.researchResults.createdAt)).limit(20);
      return json({ references: rows, research });
    }
    if (action === "trends") {
      const rows = await db.select().from(s.trends).where(eq(s.trends.nicheId, id)).orderBy(desc(s.trends.trendScore)).limit(50);
      return json({ trends: rows });
    }
    if (action === "opportunities") {
      const rows = await db.select().from(s.opportunities).where(eq(s.opportunities.nicheId, id)).orderBy(desc(s.opportunities.opportunityScore)).limit(50);
      return json({ opportunities: rows });
    }
    if (action === "ideas") {
      const rows = await db.select().from(s.contentIdeas).where(eq(s.contentIdeas.nicheId, id)).orderBy(desc(s.contentIdeas.score)).limit(100);
      return json({ ideas: rows });
    }
    if (action === "idea") {
      const rows = await db.select().from(s.contentIdeas).where(eq(s.contentIdeas.id, id)).limit(1);
      return json({ idea: rows[0] ?? null });
    }
    if (action === "scripts") {
      const rows = await db.select().from(s.scripts).where(eq(s.scripts.nicheId, id)).orderBy(desc(s.scripts.createdAt)).limit(30);
      return json({ scripts: rows });
    }
    if (action === "script") {
      const rows = await db.select().from(s.scripts).where(eq(s.scripts.id, id)).limit(1);
      const facts = id ? await db.select().from(s.scriptFacts).where(eq(s.scriptFacts.scriptId, id)) : [];
      return json({ script: rows[0] ?? null, facts });
    }
    if (action === "calendar") {
      const rows = await db.select().from(s.contentCalendars).where(eq(s.contentCalendars.nicheId, id)).orderBy(s.contentCalendars.scheduledDate).limit(60);
      return json({ calendar: rows });
    }
    if (action === "strategies") {
      const rows = await db.select().from(s.strategies).where(eq(s.strategies.nicheId, id)).orderBy(desc(s.strategies.createdAt)).limit(10);
      return json({ strategies: rows });
    }
    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "failed" }, 500);
  }
}

// ─── POST ───
const signupSchema = z.object({ email: z.string().email(), password: z.string().min(6), name: z.string().min(1).max(80) });
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(req: Request) {
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "";
  try {
    if (action === "signup") {
      const p = signupSchema.safeParse(await body(req));
      if (!p.success) return json({ error: "Invalid signup data", issues: p.error.issues }, 400);
      const existing = await db.select().from(s.users).where(eq(s.users.email, p.data.email)).limit(1);
      if (existing[0]) return json({ error: "Email already registered" }, 409);
      const rows = await db.insert(s.users).values({ email: p.data.email, passwordHash: hashPassword(p.data.password), name: p.data.name }).returning({ id: s.users.id, email: s.users.email, name: s.users.name });
      const token = crypto.randomUUID() + crypto.randomUUID();
      await db.insert(s.sessions).values({ userId: rows[0].id, token, expiresAt: new Date(Date.now() + 30 * 86400000) });
      const res = Response.json({ user: rows[0] });
      res.headers.set("Set-Cookie", `ayt_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
      return res;
    }
    if (action === "login") {
      const p = loginSchema.safeParse(await body(req));
      if (!p.success) return json({ error: "Invalid login data" }, 400);
      const rows = await db.select().from(s.users).where(eq(s.users.email, p.data.email)).limit(1);
      if (!rows[0] || !verifyPassword(p.data.password, rows[0].passwordHash)) return json({ error: "Invalid email or password" }, 401);
      const token = crypto.randomUUID() + crypto.randomUUID();
      await db.insert(s.sessions).values({ userId: rows[0].id, token, expiresAt: new Date(Date.now() + 30 * 86400000) });
      const res = Response.json({ user: { id: rows[0].id, email: rows[0].email, name: rows[0].name } });
      res.headers.set("Set-Cookie", `ayt_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
      return res;
    }
    if (action === "logout") {
      const res = Response.json({ ok: true });
      res.headers.set("Set-Cookie", "ayt_session=; Path=/; HttpOnly; Max-Age=0");
      return res;
    }
    const user = await getSessionUser(req);
    if (!user) return json({ error: "Unauthorized" }, 401);

    if (action === "setup-wizard") {
      const b = await body<Record<string, unknown>>(req);
      const ch = b.channel as Record<string, string>;
      const ni = b.niche as Record<string, unknown>;
      const auto = (b.automation as Record<string, unknown>) ?? {};
      if (!ch?.name || !ni?.primaryNiche) return json({ error: "Channel name and primary niche are required" }, 400);
      const crows = await db.insert(s.channels).values({
        userId: user.id, name: String(ch.name).slice(0, 200),
        youtubeChannelId: String(ch.youtubeChannelId ?? "").slice(0, 200),
        channelUrl: String(ch.channelUrl ?? "").slice(0, 500),
        country: String(ch.country ?? "US").slice(0, 10), language: String(ch.language ?? "en").slice(0, 10),
        targetAudience: String(ch.targetAudience ?? "").slice(0, 1000),
      }).returning({ id: s.channels.id });
      const channelId = crows[0].id;
      const nrows = await db.insert(s.niches).values({
        channelId, primaryNiche: String(ni.primaryNiche).slice(0, 200),
        subNiches: (Array.isArray(ni.subNiches) ? ni.subNiches : []) as string[],
        topicsToAvoid: (Array.isArray(ni.topicsToAvoid) ? ni.topicsToAvoid : []) as string[],
        preferredFormats: (Array.isArray(ni.preferredFormats) ? ni.preferredFormats : ["long-form"]) as string[],
        contentType: String(ni.contentType ?? "both").slice(0, 20),
        targetDurationSec: Number(ni.targetDurationSec ?? 480),
        videosPerDay: Number(ni.videosPerDay ?? 1), videosPerWeek: Number(ni.videosPerWeek ?? 3),
        tone: String(ni.tone ?? "energetic").slice(0, 50), voiceStyle: String(ni.voiceStyle ?? "neutral").slice(0, 50),
        editingStyle: String(ni.editingStyle ?? "dynamic").slice(0, 50), visualStyle: String(ni.visualStyle ?? "cinematic").slice(0, 50),
      }).returning({ id: s.niches.id });
      const nicheId = nrows[0].id;
      const comps = Array.isArray(ni.competitors) ? (ni.competitors as string[]) : [];
      for (const c of comps.slice(0, 20)) {
        if (String(c).trim()) await db.insert(s.competitors).values({ nicheId, channelName: String(c).slice(0, 300) });
      }
      const prof = buildNicheProfile(String(ni.primaryNiche), (ni.subNiches as string[]) ?? [], (ni.topicsToAvoid as string[]) ?? []);
      await db.insert(s.nicheProfiles).values({ nicheId, ...prof });
      await db.insert(s.automationSettings).values({
        channelId, mode: String(auto.mode ?? "manual").slice(0, 20),
        autoResearch: auto.autoResearch !== false, autoIdeas: auto.autoIdeas !== false,
        autoScript: auto.autoScript !== false, autoProduction: auto.autoProduction === true,
        autoUpload: auto.autoUpload === true, autoPublishing: auto.autoPublishing === true,
        autoAnalytics: auto.autoAnalytics !== false, autoStrategy: auto.autoStrategy !== false,
        approvalGates: (Array.isArray(auto.approvalGates) ? auto.approvalGates : ["script", "publish"]) as string[],
        maxVideosPerDay: Number(auto.maxVideosPerDay ?? 1), maxVideosPerWeek: Number(auto.maxVideosPerWeek ?? 3),
        maxCostPerVideo: Number(auto.maxCostPerVideo ?? 5),
      });
      return json({ channelId, nicheId });
    }

    if (action === "niche-profile-refresh") {
      const b = await body<{ nicheId: string }>(req);
      const nrows = await db.select().from(s.niches).where(eq(s.niches.id, b.nicheId)).limit(1);
      if (!nrows[0]) return json({ error: "Niche not found" }, 404);
      const prof = buildNicheProfile(nrows[0].primaryNiche, (nrows[0].subNiches as string[]) ?? [], (nrows[0].topicsToAvoid as string[]) ?? []);
      // Enrich breaking topics + gaps from live trend data
      const trs = await db.select().from(s.trends).where(eq(s.trends.nicheId, b.nicheId)).orderBy(desc(s.trends.trendScore)).limit(10);
      prof.breakingTopics = trs.filter((t) => t.classification === "breaking" || t.classification === "rising").map((t) => t.topic);
      prof.contentGaps = trs.filter((t) => (t.contentGap ?? 0) > 60).map((t) => t.topic);
      const existing = await db.select().from(s.nicheProfiles).where(eq(s.nicheProfiles.nicheId, b.nicheId)).limit(1);
      if (existing[0]) await db.update(s.nicheProfiles).set({ ...prof, updatedAt: new Date() }).where(eq(s.nicheProfiles.id, existing[0].id));
      else await db.insert(s.nicheProfiles).values({ nicheId: b.nicheId, ...prof });
      return json({ ok: true, profile: prof });
    }

    if (action === "run-job") {
      const b = await body<{ type: string; nicheId?: string; ideaId?: string; scriptId?: string; projectId?: string; uploadId?: string; maxVideos?: number }>(req);
      const allowed = ["RESEARCH", "TREND", "IDEA", "SCRIPT", "FACT_CHECK", "ASSET", "VOICE", "RENDER", "QUALITY", "UPLOAD", "ANALYTICS", "AUTONOMOUS"];
      if (!allowed.includes(b.type)) return json({ error: "Unknown job type" }, 400);
      const payload: Record<string, unknown> = {};
      for (const k of ["nicheId", "ideaId", "scriptId", "projectId", "uploadId", "maxVideos"] as const) {
        const v = (b as Record<string, unknown>)[k];
        if (v) payload[k] = v;
      }
      const jobId = await createJob(b.type, payload);
      await runJobNow(jobId);
      const rows = await db.select().from(s.jobs).where(eq(s.jobs.id, jobId)).limit(1);
      return json({ job: rows[0] });
    }

    if (action === "select-idea") {
      const b = await body<{ ideaId: string }>(req);
      await db.update(s.contentIdeas).set({ status: "selected" }).where(eq(s.contentIdeas.id, b.ideaId));
      const projectId = await ensureProjectForIdea(b.ideaId);
      return json({ projectId });
    }

    if (action === "update-script") {
      const b = await body<{ scriptId: string; body: string; title?: string }>(req);
      if (!b.scriptId || !b.body) return json({ error: "scriptId and body required" }, 400);
      const words = b.body.split(/\s+/).filter(Boolean).length;
      await db.update(s.scripts).set({ body: b.body, wordCount: words, estimatedDurationSec: Math.round((words / 150) * 60), ...(b.title ? { title: b.title.slice(0, 300) } : {}) }).where(eq(s.scripts.id, b.scriptId));
      return json({ ok: true, words });
    }

    if (action === "update-scene") {
      const b = await body<{ sceneId: string; narration?: string; visual?: string; caption?: string; textOverlay?: string }>(req);
      const patch: Record<string, unknown> = {};
      for (const k of ["narration", "visual", "caption", "textOverlay"] as const) if (b[k] !== undefined) patch[k] = b[k];
      await db.update(s.storyboardScenes).set(patch).where(eq(s.storyboardScenes.id, b.sceneId));
      return json({ ok: true });
    }

    if (action === "build-storyboard") {
      const b = await body<{ projectId: string; scriptId: string }>(req);
      const r = await buildStoryboardAndEDL(b.projectId, b.scriptId);
      return json(r);
    }

    if (action === "plan-calendar") {
      const b = await body<{ nicheId: string; weeks?: number }>(req);
      const nrows = await db.select().from(s.niches).where(eq(s.niches.id, b.nicheId)).limit(1);
      if (!nrows[0]) return json({ error: "Niche not found" }, 404);
      const opps = await db.select().from(s.opportunities).where(eq(s.opportunities.nicheId, b.nicheId)).orderBy(desc(s.opportunities.opportunityScore)).limit(20);
      const topics = opps.map((o) => ({ topic: o.topic, score: o.opportunityScore ?? 0 }));
      if (topics.length === 0) return json({ error: "No opportunities yet — run IDEA job first" }, 400);
      const plan = planCalendar(topics, nrows[0].videosPerWeek ?? 3, b.weeks ?? 2, ((nrows[0].preferredFormats as string[]) ?? ["long-form"])[0]);
      for (const p of plan) {
        await db.insert(s.contentCalendars).values({ nicheId: b.nicheId, scheduledDate: new Date(p.date), topic: p.topic.slice(0, 400), format: p.format, status: "planned", rationale: p.rationale });
      }
      return json({ planned: plan.length });
    }

    if (action === "strategy") {
      const b = await body<{ nicheId: string }>(req);
      const nrows = await db.select().from(s.niches).where(eq(s.niches.id, b.nicheId)).limit(1);
      if (!nrows[0]) return json({ error: "Niche not found" }, 404);
      const topOpp = await db.select().from(s.opportunities).where(eq(s.opportunities.nicheId, b.nicheId)).orderBy(desc(s.opportunities.opportunityScore)).limit(1);
      const topTrend = await db.select().from(s.trends).where(eq(s.trends.nicheId, b.nicheId)).orderBy(desc(s.trends.trendScore)).limit(1);
      const mem = await getMemory(nrows[0].channelId);
      const strat = buildStrategy({
        topOpportunity: topOpp[0] ? { topic: topOpp[0].topic, opportunityScore: topOpp[0].opportunityScore ?? 0 } : null,
        topTrend: topTrend[0] ? { topic: topTrend[0].topic, classification: topTrend[0].classification ?? "stable", trendScore: topTrend[0].trendScore ?? 0 } : null,
        memory: mem, niche: nrows[0].primaryNiche,
      });
      const rows = await db.insert(s.strategies).values({ nicheId: b.nicheId, ...strat }).returning();
      return json({ strategy: rows[0] });
    }

    if (action === "automation") {
      const b = await body<Record<string, unknown> & { channelId: string }>(req);
      const patch: Record<string, unknown> = {};
      for (const k of ["mode", "autoResearch", "autoIdeas", "autoScript", "autoProduction", "autoUpload", "autoPublishing", "autoAnalytics", "autoStrategy", "approvalGates", "maxVideosPerDay", "maxVideosPerWeek", "maxCostPerVideo"] as const) {
        if (b[k] !== undefined) patch[k] = b[k];
      }
      patch.updatedAt = new Date();
      await db.update(s.automationSettings).set(patch).where(eq(s.automationSettings.channelId, b.channelId));
      return json({ ok: true });
    }

    if (action === "add-competitor") {
      const b = await body<{ nicheId: string; channelName: string; channelUrl?: string }>(req);
      if (!b.nicheId || !b.channelName) return json({ error: "Missing fields" }, 400);
      await db.insert(s.competitors).values({ nicheId: b.nicheId, channelName: b.channelName.slice(0, 300), channelUrl: (b.channelUrl ?? "").slice(0, 500) });
      return json({ ok: true });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "failed" }, 500);
  }
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "";
  const id = url.searchParams.get("id") || "";
  const user = await getSessionUser(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  try {
    if (action === "competitor" && id) {
      await db.delete(s.competitors).where(eq(s.competitors.id, id));
      return json({ ok: true });
    }
    return json({ error: "Unknown delete" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "failed" }, 500);
  }
}
