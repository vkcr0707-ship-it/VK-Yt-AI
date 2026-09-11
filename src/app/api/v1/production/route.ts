// Production API: projects, storyboard scenes, EDL, assets, voice, renders,
// thumbnails, titles, SEO, quality gates, uploads + YouTube OAuth, files, costs.
import { db } from "@/db";
import * as s from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { getSessionUser, projectScenes, generatePackaging, oauthConfigured, oauthUrl, exchangeCode, runQuality, projectCost, listGenFiles, ensureDirs } from "@/lib/system";
import { writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { GEN_DIR } from "@/lib/system";

export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}
async function body<T>(req: Request): Promise<T> {
  try { return (await req.json()) as T; } catch { return {} as T; }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "";
  const id = url.searchParams.get("id") || "";
  // OAuth callback must work without session (Google redirects here)
  if (action === "oauth-callback") {
    const code = url.searchParams.get("code") || "";
    const state = url.searchParams.get("state") || "";
    const err = url.searchParams.get("error") || "";
    if (err) return Response.redirect(new URL("/?tab=publish&oauth=error", req.url));
    if (!code || !state) return Response.redirect(new URL("/?tab=publish&oauth=missing", req.url));
    try {
      const tok = await exchangeCode(code);
      const existing = await db.select().from(s.youtubeTokens).where(eq(s.youtubeTokens.channelId, state)).limit(1);
      if (existing[0]) {
        await db.update(s.youtubeTokens).set({ accessToken: tok.access_token, ...(tok.refresh_token ? { refreshToken: tok.refresh_token } : {}), expiresAt: new Date(Date.now() + tok.expires_in * 1000), scope: tok.scope }).where(eq(s.youtubeTokens.id, existing[0].id));
      } else {
        await db.insert(s.youtubeTokens).values({ channelId: state, accessToken: tok.access_token, refreshToken: tok.refresh_token ?? "", expiresAt: new Date(Date.now() + tok.expires_in * 1000), scope: tok.scope });
      }
      return Response.redirect(new URL("/?tab=publish&oauth=ok", req.url));
    } catch {
      return Response.redirect(new URL("/?tab=publish&oauth=failed", req.url));
    }
  }
  try {
    if (action === "projects") {
      const rows = await db.select().from(s.videoProjects).where(eq(s.videoProjects.nicheId, id)).orderBy(desc(s.videoProjects.createdAt)).limit(50);
      return json({ projects: rows });
    }
    if (action === "project") {
      const rows = await db.select().from(s.videoProjects).where(eq(s.videoProjects.id, id)).limit(1);
      if (!rows[0]) return json({ error: "Not found" }, 404);
      const scenes = await projectScenes(id);
      const edl = await db.select().from(s.editDecisionLists).where(eq(s.editDecisionLists.projectId, id)).limit(1);
      const assets = await db.select().from(s.assets).where(eq(s.assets.projectId, id));
      const voiceClips = await db.select().from(s.voices).where(eq(s.voices.projectId, id));
      const renders = await db.select().from(s.renders).where(eq(s.renders.projectId, id)).orderBy(desc(s.renders.createdAt)).limit(5);
      const thumbs = await db.select().from(s.thumbnails).where(eq(s.thumbnails.projectId, id)).orderBy(desc(s.thumbnails.totalScore));
      const titles = await db.select().from(s.titleOptions).where(eq(s.titleOptions.projectId, id)).orderBy(desc(s.titleOptions.totalScore));
      const seo = await db.select().from(s.seoMetadata).where(eq(s.seoMetadata.projectId, id)).limit(1);
      const gates = await db.select().from(s.qualityGates).where(eq(s.qualityGates.projectId, id)).orderBy(desc(s.qualityGates.createdAt)).limit(3);
      const uploads = await db.select().from(s.uploads).where(eq(s.uploads.projectId, id)).orderBy(desc(s.uploads.createdAt)).limit(3);
      const costs = await db.select().from(s.costRecords).where(eq(s.costRecords.projectId, id));
      const script = rows[0].scriptId ? (await db.select().from(s.scripts).where(eq(s.scripts.id, rows[0].scriptId)).limit(1))[0] ?? null : null;
      const totalCost = costs.reduce((a, c) => a + (c.amountUsd ?? 0), 0);
      return json({ project: rows[0], scenes, edl: edl[0] ?? null, assets, voiceClips, renders, thumbs, titles, seo: seo[0] ?? null, gates, uploads, costs, script, totalCost });
    }
    if (action === "oauth-status") {
      const rows = await db.select().from(s.youtubeTokens).where(eq(s.youtubeTokens.channelId, id)).limit(1);
      return json({ configured: oauthConfigured(), connected: Boolean(rows[0]?.refreshToken || rows[0]?.accessToken) });
    }
    if (action === "oauth-url") {
      if (!oauthConfigured()) return json({ error: "Integration not configured — set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REDIRECT_URI" }, 400);
      return json({ url: oauthUrl(id) });
    }
    if (action === "files") {
      return json({ files: listGenFiles() });
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

    if (action === "packaging") {
      const b = await body<{ projectId: string }>(req);
      const prows = await db.select().from(s.videoProjects).where(eq(s.videoProjects.id, b.projectId)).limit(1);
      if (!prows[0]) return json({ error: "Project not found" }, 404);
      const nrows = await db.select().from(s.niches).where(eq(s.niches.id, prows[0].nicheId)).limit(1);
      await generatePackaging(b.projectId, prows[0].title, [], nrows[0]?.primaryNiche ?? "video");
      return json({ ok: true });
    }
    if (action === "select-title") {
      const b = await body<{ projectId: string; titleId: string }>(req);
      await db.update(s.titleOptions).set({ selected: false }).where(eq(s.titleOptions.projectId, b.projectId));
      await db.update(s.titleOptions).set({ selected: true }).where(eq(s.titleOptions.id, b.titleId));
      const t = await db.select().from(s.titleOptions).where(eq(s.titleOptions.id, b.titleId)).limit(1);
      if (t[0]) {
        await db.update(s.videoProjects).set({ title: t[0].title }).where(eq(s.videoProjects.id, b.projectId));
        const seo = await db.select().from(s.seoMetadata).where(eq(s.seoMetadata.projectId, b.projectId)).limit(1);
        if (seo[0]) await db.update(s.seoMetadata).set({ title: t[0].title }).where(eq(s.seoMetadata.id, seo[0].id));
      }
      return json({ ok: true });
    }
    if (action === "select-thumbnail") {
      const b = await body<{ projectId: string; thumbId: string }>(req);
      await db.update(s.thumbnails).set({ selected: false }).where(eq(s.thumbnails.projectId, b.projectId));
      await db.update(s.thumbnails).set({ selected: true }).where(eq(s.thumbnails.id, b.thumbId));
      return json({ ok: true });
    }
    if (action === "update-seo") {
      const b = await body<{ projectId: string; title?: string; description?: string; tags?: string[]; categoryId?: string }>(req);
      const patch: Record<string, unknown> = {};
      if (b.title !== undefined) patch.title = b.title.slice(0, 200);
      if (b.description !== undefined) patch.description = b.description.slice(0, 5000);
      if (b.tags !== undefined) patch.tags = b.tags;
      if (b.categoryId !== undefined) patch.categoryId = b.categoryId;
      await db.update(s.seoMetadata).set(patch).where(eq(s.seoMetadata.projectId, b.projectId));
      return json({ ok: true });
    }
    if (action === "prepare-upload") {
      const b = await body<{ projectId: string; privacy?: string; scheduledAt?: string; playlistId?: string }>(req);
      const q = await runQuality(b.projectId);
      if (q.verdict !== "PASS") {
        const override = (b as Record<string, unknown>).overrideGates === true;
        if (!override) return json({ error: "Quality gate BLOCKED", reasons: q.reasons, gateId: q.gateId }, 409);
      }
      const existing = await db.select().from(s.uploads).where(and(eq(s.uploads.projectId, b.projectId), eq(s.uploads.status, "prepared"))).limit(1);
      if (existing[0]) return json({ upload: existing[0] });
      const rows = await db.insert(s.uploads).values({
        projectId: b.projectId, privacy: (b.privacy ?? "private").slice(0, 20),
        scheduledAt: b.scheduledAt ? new Date(b.scheduledAt) : undefined,
        playlistId: (b.playlistId ?? "").slice(0, 200), status: "prepared",
      }).returning();
      await db.update(s.videoProjects).set({ stage: "upload", updatedAt: new Date() }).where(eq(s.videoProjects.id, b.projectId));
      return json({ upload: rows[0] });
    }
    if (action === "upload-asset") {
      const b = await body<{ projectId?: string; nicheId?: string; fileName: string; dataBase64: string; license?: string; attribution?: string; source?: string }>(req);
      if (!b.fileName || !b.dataBase64) return json({ error: "fileName and dataBase64 required" }, 400);
      if (b.dataBase64.length > 15_000_000) return json({ error: "File too large (max ~10MB)" }, 400);
      ensureDirs();
      const safe = b.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
      const name = `img/upload-${Date.now()}-${safe}`;
      writeFileSync(join(GEN_DIR, name), Buffer.from(b.dataBase64, "base64"));
      const kind = /\.(mp4|mov|webm)$/i.test(safe) ? "video" : /\.(mp3|wav|ogg)$/i.test(safe) ? "audio" : "image";
      const rows = await db.insert(s.assets).values({
        projectId: b.projectId || undefined, nicheId: b.nicheId || undefined, kind, fileName: safe,
        storagePath: `/gen/${name}`, source: (b.source ?? "user-upload").slice(0, 100),
        license: (b.license ?? "user-provided").slice(0, 100), attribution: (b.attribution ?? "").slice(0, 500), rights: "user-provided",
      }).returning();
      return json({ asset: rows[0] });
    }
    if (action === "disconnect-oauth") {
      const b = await body<{ channelId: string }>(req);
      await db.delete(s.youtubeTokens).where(eq(s.youtubeTokens.channelId, b.channelId));
      return json({ ok: true });
    }
    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "failed" }, 500);
  }
}
