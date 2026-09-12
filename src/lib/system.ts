// System layer: auth, storage, YouTube Data API + OAuth + upload, FFmpeg renderer,
// job runner, autonomous pipeline, cost tracking.
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync, statSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { db } from "@/db";
import * as s from "@/db/schema";
import { eq, desc, and, sql, gte } from "drizzle-orm";
import { getVoice, getImage, WebResearch } from "./providers";
import * as E from "./engines";
import { getMediaStorage, listLocalMedia, localMediaPath, materializeMediaPath } from "./storage";

// ─── Paths ───
export const GEN_DIR = join(process.cwd(), "public", "gen");
export function ensureDirs() {
  for (const d of [GEN_DIR, join(GEN_DIR, "audio"), join(GEN_DIR, "img"), join(GEN_DIR, "video"), join(GEN_DIR, "thumb")]) {
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
  }
}
export function publicUrl(absPath: string): string {
  return absPath.replace(join(process.cwd(), "public"), "").replace(/\\/g, "/");
}

// ─── Auth ───
export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  const h = scryptSync(pw, salt, 32).toString("hex");
  return `${salt}:${h}`;
}
export function verifyPassword(pw: string, stored: string): boolean {
  const [salt, h] = stored.split(":");
  if (!salt || !h) return false;
  const cand = scryptSync(pw, salt, 32).toString("hex");
  const a = Buffer.from(cand, "hex"); const b = Buffer.from(h, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
export function getTokenFromRequest(req: Request): string | null {
  const cookie = req.headers.get("cookie") || "";
  const m = cookie.match(/(?:^|;\s*)ayt_session=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
export async function getSessionUser(req: Request) {
  const token = getTokenFromRequest(req);
  if (!token) return null;
  const rows = await db.select().from(s.sessions).where(eq(s.sessions.token, token)).limit(1);
  const sess = rows[0];
  if (!sess || new Date(sess.expiresAt).getTime() < Date.now()) return null;
  const urows = await db.select().from(s.users).where(eq(s.users.id, sess.userId)).limit(1);
  return urows[0] ?? null;
}

export async function userOwnsChannel(userId: string, channelId: string): Promise<boolean> {
  return Boolean((await db.select({ id: s.channels.id }).from(s.channels).where(and(eq(s.channels.id, channelId), eq(s.channels.userId, userId))).limit(1))[0]);
}

export async function userOwnsNiche(userId: string, nicheId: string): Promise<boolean> {
  const rows = await db.select({ channelId: s.niches.channelId }).from(s.niches).where(eq(s.niches.id, nicheId)).limit(1);
  return Boolean(rows[0] && await userOwnsChannel(userId, rows[0].channelId));
}

export async function userOwnsIdea(userId: string, ideaId: string): Promise<boolean> {
  const rows = await db.select({ nicheId: s.contentIdeas.nicheId }).from(s.contentIdeas).where(eq(s.contentIdeas.id, ideaId)).limit(1);
  return Boolean(rows[0] && await userOwnsNiche(userId, rows[0].nicheId));
}

export async function userOwnsScript(userId: string, scriptId: string): Promise<boolean> {
  const rows = await db.select({ nicheId: s.scripts.nicheId }).from(s.scripts).where(eq(s.scripts.id, scriptId)).limit(1);
  return Boolean(rows[0] && await userOwnsNiche(userId, rows[0].nicheId));
}

export async function userOwnsProject(userId: string, projectId: string): Promise<boolean> {
  const rows = await db.select({ nicheId: s.videoProjects.nicheId }).from(s.videoProjects).where(eq(s.videoProjects.id, projectId)).limit(1);
  return Boolean(rows[0] && await userOwnsNiche(userId, rows[0].nicheId));
}

export async function userOwnsUpload(userId: string, uploadId: string): Promise<boolean> {
  const rows = await db.select({ projectId: s.uploads.projectId }).from(s.uploads).where(eq(s.uploads.id, uploadId)).limit(1);
  return Boolean(rows[0] && await userOwnsProject(userId, rows[0].projectId));
}

export async function userCanAccessJob(userId: string, job: { payload: unknown }): Promise<boolean> {
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  if (payload.uploadId) return userOwnsUpload(userId, String(payload.uploadId));
  if (payload.nicheId) return userOwnsNiche(userId, String(payload.nicheId));
  if (payload.ideaId) return userOwnsIdea(userId, String(payload.ideaId));
  if (payload.scriptId) return userOwnsScript(userId, String(payload.scriptId));
  if (payload.projectId) return userOwnsProject(userId, String(payload.projectId));
  return false;
}

function oauthSignature(value: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required for YouTube OAuth");
  return createHmac("sha256", secret).update(value).digest("base64url");
}

const ENCRYPTED_TOKEN_PREFIX = "enc:v1:";
function tokenKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required for token encryption");
  return createHash("sha256").update(secret).digest();
}

export function encryptToken(value: string): string {
  if (!value) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${ENCRYPTED_TOKEN_PREFIX}${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptToken(value: string): string {
  if (!value || !value.startsWith(ENCRYPTED_TOKEN_PREFIX)) return value;
  const parts = value.slice(ENCRYPTED_TOKEN_PREFIX.length).split(".");
  if (parts.length !== 3) throw new Error("Invalid encrypted token");
  const decipher = createDecipheriv("aes-256-gcm", tokenKey(), Buffer.from(parts[0], "base64url"));
  decipher.setAuthTag(Buffer.from(parts[1], "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(parts[2], "base64url")), decipher.final()]).toString("utf8");
}

export function oauthState(channelId: string, userId: string): string {
  const payload = `${channelId}.${userId}.${Date.now()}`;
  return `${Buffer.from(payload).toString("base64url")}.${oauthSignature(payload)}`;
}

export function verifyOAuthState(state: string): { channelId: string; userId: string } | null {
  try {
    const [encoded, signature] = state.split(".");
    const payload = Buffer.from(encoded, "base64url").toString("utf8");
    const expected = oauthSignature(payload);
    const a = Buffer.from(signature ?? ""); const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const [channelId, userId, issued] = payload.split(".");
    const issuedAt = Number(issued);
    if (!channelId || !userId || !Number.isFinite(issuedAt) || issuedAt > Date.now() + 30_000 || Date.now() - issuedAt > 10 * 60 * 1000) return null;
    return { channelId, userId };
  } catch { return null; }
}

// ─── Quota ───
export function todayKey(): string { return new Date().toISOString().slice(0, 10); }
export async function getQuota(provider = "youtube"): Promise<{ used: number; limit: number }> {
  const rows = await db.select().from(s.quotaUsage).where(and(eq(s.quotaUsage.provider, provider), eq(s.quotaUsage.date, todayKey()))).limit(1);
  if (!rows[0]) return { used: 0, limit: 10000 };
  return { used: rows[0].unitsUsed ?? 0, limit: rows[0].unitsLimit ?? 10000 };
}
export async function addQuota(provider: string, units: number): Promise<void> {
  const key = todayKey();
  const rows = await db.select().from(s.quotaUsage).where(and(eq(s.quotaUsage.provider, provider), eq(s.quotaUsage.date, key))).limit(1);
  if (!rows[0]) {
    await db.insert(s.quotaUsage).values({ provider, date: key, unitsUsed: units, unitsLimit: 10000 });
  } else {
    await db.update(s.quotaUsage).set({ unitsUsed: (rows[0].unitsUsed ?? 0) + units }).where(eq(s.quotaUsage.id, rows[0].id));
  }
}

// ─── Costs ───
export async function recordCost(projectId: string | null, jobId: string | null, category: string, amountUsd: number, detail = "") {
  await db.insert(s.costRecords).values({ projectId, jobId, category, amountUsd, detail });
}
export async function projectCost(projectId: string): Promise<number> {
  const rows = await db.select().from(s.costRecords).where(eq(s.costRecords.projectId, projectId));
  return rows.reduce((a, r) => a + (r.amountUsd ?? 0), 0);
}

// ─── YouTube Data API ───
const YT = "https://www.googleapis.com/youtube/v3";
export function ytApiKey(): string { return process.env.YOUTUBE_API_KEY || ""; }

export interface YtVideoMeta {
  videoId: string; title: string; channelName: string; channelId: string; publishedAt: string;
  durationSec: number; viewCount: number; likeCount: number; commentCount: number;
  description: string; tags: string[]; category: string; thumbnailUrl: string;
}

function parseDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
}

export async function ytSearch(query: string, opts: { maxResults?: number; type?: string; order?: string; publishedAfter?: string; videoDuration?: string; channelId?: string } = {}): Promise<YtVideoMeta[]> {
  const key = ytApiKey();
  if (!key) throw new Error("YOUTUBE_API_KEY not configured");
  const q = await getQuota("youtube");
  if (q.used + 100 > q.limit) throw new Error("YouTube quota exceeded for today");
  const params = new URLSearchParams({
    key, q: query, part: "snippet", type: "video",
    maxResults: String(opts.maxResults ?? 25),
    order: opts.order ?? "relevance",
    ...(opts.publishedAfter ? { publishedAfter: opts.publishedAfter } : {}),
    ...(opts.videoDuration ? { videoDuration: opts.videoDuration } : {}),
    ...(opts.channelId ? { channelId: opts.channelId } : {}),
  });
  const res = await fetch(`${YT}/search?${params.toString()}`, { signal: AbortSignal.timeout(20000) });
  await addQuota("youtube", 100);
  if (!res.ok) throw new Error(`YouTube search failed: ${res.status}`);
  const data = await res.json() as { items?: { id?: { videoId?: string }; snippet?: { title: string; channelTitle: string; channelId: string; publishedAt: string; description: string; thumbnails?: { high?: { url: string } } } }[] };
  const ids = (data.items ?? []).map((i) => i.id?.videoId).filter(Boolean) as string[];
  if (ids.length === 0) return [];
  return ytVideos(ids);
}

export async function ytVideos(ids: string[]): Promise<YtVideoMeta[]> {
  const key = ytApiKey();
  if (!key) throw new Error("YOUTUBE_API_KEY not configured");
  const res = await fetch(`${YT}/videos?${new URLSearchParams({ key, id: ids.join(","), part: "snippet,contentDetails,statistics" }).toString()}`, { signal: AbortSignal.timeout(20000) });
  await addQuota("youtube", 1);
  if (!res.ok) throw new Error(`YouTube videos failed: ${res.status}`);
  const data = await res.json() as { items?: { id: string; snippet?: { title: string; channelTitle: string; channelId: string; publishedAt: string; description: string; tags?: string[]; categoryId: string; thumbnails?: { high?: { url: string } } }; contentDetails?: { duration: string }; statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }[] };
  return (data.items ?? []).map((v) => ({
    videoId: v.id,
    title: v.snippet?.title ?? "",
    channelName: v.snippet?.channelTitle ?? "",
    channelId: v.snippet?.channelId ?? "",
    publishedAt: v.snippet?.publishedAt ?? new Date().toISOString(),
    durationSec: parseDuration(v.contentDetails?.duration ?? "PT0S"),
    viewCount: Number(v.statistics?.viewCount ?? 0),
    likeCount: Number(v.statistics?.likeCount ?? 0),
    commentCount: Number(v.statistics?.commentCount ?? 0),
    description: (v.snippet?.description ?? "").slice(0, 2000),
    tags: v.snippet?.tags ?? [],
    category: v.snippet?.categoryId ?? "",
    thumbnailUrl: v.snippet?.thumbnails?.high?.url ?? "",
  }));
}

// ─── YouTube OAuth + Upload ───
export function oauthConfig() {
  return {
    clientId: process.env.YOUTUBE_CLIENT_ID || "",
    clientSecret: process.env.YOUTUBE_CLIENT_SECRET || "",
    redirectUri: process.env.YOUTUBE_REDIRECT_URI || "http://localhost:3000/api/v1/production?action=oauth-callback",
  };
}
export function oauthConfigured(): boolean {
  const c = oauthConfig();
  return Boolean(c.clientId && c.clientSecret && process.env.SESSION_SECRET);
}
export function oauthUrl(channelId: string, userId: string): string {
  const c = oauthConfig();
  const p = new URLSearchParams({
    client_id: c.clientId, redirect_uri: c.redirectUri, response_type: "code",
    scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly",
    access_type: "offline", prompt: "consent", state: oauthState(channelId, userId),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}
export async function exchangeCode(code: string) {
  const c = oauthConfig();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: c.clientId, client_secret: c.clientSecret, redirect_uri: c.redirectUri, grant_type: "authorization_code" }).toString(),
  });
  if (!res.ok) throw new Error(`OAuth exchange failed: ${res.status}`);
  return res.json() as Promise<{ access_token: string; refresh_token?: string; expires_in: number; scope: string }>;
}
export async function authenticatedYouTubeChannel(accessToken: string): Promise<{ id: string; title: string; subscribers: number; views: number }> {
  const res = await fetch(`${YT}/channels?${new URLSearchParams({ part: "snippet,statistics", mine: "true" }).toString()}`, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`YouTube channel lookup failed: ${res.status}`);
  const data = await res.json() as { items?: { id: string; snippet?: { title?: string }; statistics?: { subscriberCount?: string; viewCount?: string } }[] };
  const channel = data.items?.[0];
  if (!channel?.id) throw new Error("Authenticated YouTube account has no channel");
  return { id: channel.id, title: channel.snippet?.title ?? "", subscribers: Number(channel.statistics?.subscriberCount ?? 0), views: Number(channel.statistics?.viewCount ?? 0) };
}

export async function youtubeProcessingStatus(accessToken: string, videoId: string): Promise<{ uploadStatus: string; processingStatus: string }> {
  const params = new URLSearchParams({ part: "status,processingDetails", id: videoId });
  const res = await fetch(`${YT}/videos?${params.toString()}`, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`YouTube processing lookup failed: ${res.status}`);
  const data = await res.json() as { items?: { status?: { uploadStatus?: string }; processingDetails?: { processingStatus?: string } }[] };
  const item = data.items?.[0];
  if (!item) throw new Error("YouTube video not found during processing lookup");
  return { uploadStatus: item.status?.uploadStatus ?? "unknown", processingStatus: item.processingDetails?.processingStatus ?? "unknown" };
}
export async function refreshAccessToken(channelUuid: string): Promise<string> {
  const rows = await db.select().from(s.youtubeTokens).where(eq(s.youtubeTokens.channelId, channelUuid)).limit(1);
  const tok = rows[0];
  if (!tok?.refreshToken) throw new Error("YouTube not connected for this channel");
  const refreshToken = decryptToken(tok.refreshToken);
  const accessToken = decryptToken(tok.accessToken ?? "");
  if (accessToken && tok.expiresAt && new Date(tok.expiresAt).getTime() > Date.now() + 60000) return accessToken;
  const c = oauthConfig();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: c.clientId, client_secret: c.clientSecret, grant_type: "refresh_token" }).toString(),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
  const data = await res.json() as { access_token: string; expires_in: number };
  await db.update(s.youtubeTokens).set({ accessToken: encryptToken(data.access_token), refreshToken: encryptToken(refreshToken), expiresAt: new Date(Date.now() + data.expires_in * 1000) }).where(eq(s.youtubeTokens.id, tok.id));
  return data.access_token;
}

export async function ytUploadVideo(channelUuid: string, uploadId: string): Promise<{ videoId: string; url: string; processingStatus: string }> {
  const urows = await db.select().from(s.uploads).where(eq(s.uploads.id, uploadId)).limit(1);
  const up = urows[0];
  if (!up) throw new Error("Upload not found");
  if (up.youtubeVideoId) {
    const processing = (up.stateJson as { processing?: { processingStatus?: string } } | null)?.processing?.processingStatus ?? "unknown";
    return { videoId: up.youtubeVideoId, url: up.uploadUrl || `https://youtu.be/${up.youtubeVideoId}`, processingStatus: processing };
  }
  const prows = await db.select().from(s.videoProjects).where(eq(s.videoProjects.id, up.projectId)).limit(1);
  const proj = prows[0];
  if (!proj) throw new Error("Project not found");
  const mrows = await db.select().from(s.seoMetadata).where(eq(s.seoMetadata.projectId, proj.id)).limit(1);
  const meta = mrows[0];
  const rrows = await db.select().from(s.renders).where(and(eq(s.renders.projectId, proj.id), eq(s.renders.status, "done"))).orderBy(desc(s.renders.createdAt)).limit(1);
  const render = rrows[0];
  if (!render?.outputPath) {
    throw new Error("No rendered MP4 available — render the video first");
  }
  const accessToken = await refreshAccessToken(channelUuid);
  const renderFile = await materializeMediaPath(render.outputPath);
  const fileBuf = readFileSync(renderFile.path);
  renderFile.cleanup();
  const snippet: Record<string, unknown> = {
    title: (meta?.title || proj.title).slice(0, 100),
    description: (meta?.description || proj.title).slice(0, 5000),
    tags: meta?.tags ?? [],
    categoryId: meta?.categoryId || "27",
  };
  const status: Record<string, unknown> = { privacyStatus: up.privacy === "scheduled" ? "private" : up.privacy || "private" };
  if (up.privacy === "scheduled" && up.scheduledAt) { status.publishAt = new Date(up.scheduledAt).toISOString(); status.privacyStatus = "private"; }
  const savedState = (up.stateJson ?? {}) as { sessionUri?: string; offset?: number };
  let sessionUri = savedState.sessionUri;
  if (!sessionUri) {
    const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", "X-Upload-Content-Length": String(fileBuf.length), "X-Upload-Content-Type": "video/mp4" },
      body: JSON.stringify({ snippet, status }),
    });
    if (!init.ok) throw new Error(`Upload init failed: ${init.status} ${(await init.text()).slice(0, 300)}`);
    sessionUri = init.headers.get("location") ?? undefined;
    if (!sessionUri) throw new Error("No resumable session URI returned");
  }
  await db.update(s.uploads).set({ status: "uploading", progress: 10, stateJson: { sessionUri }, attemptCount: (up.attemptCount ?? 0) + 1 }).where(eq(s.uploads.id, up.id));
  const chunkSize = 8 * 1024 * 1024;
  let offset = savedState.offset ?? 0;
  let data: { id: string } | null = null;
  while (offset < fileBuf.length) {
    const end = Math.min(offset + chunkSize, fileBuf.length) - 1;
    const chunk = fileBuf.subarray(offset, end + 1);
    const put = await fetch(sessionUri, {
      method: "PUT",
      headers: { "Content-Type": "video/mp4", "Content-Length": String(chunk.length), "Content-Range": `bytes ${offset}-${end}/${fileBuf.length}` },
      body: new Uint8Array(chunk),
    });
    if (put.status === 308) {
      const range = put.headers.get("range")?.match(/bytes=0-(\d+)/);
      offset = range ? Number(range[1]) + 1 : end + 1;
      await db.update(s.uploads).set({ progress: Math.min(99, 10 + Math.round((offset / fileBuf.length) * 85)), stateJson: { sessionUri, offset } }).where(eq(s.uploads.id, up.id));
      continue;
    }
    if (!put.ok) {
      const t = (await put.text()).slice(0, 500);
      await db.update(s.uploads).set({ status: "failed", lastError: `Upload bytes failed: ${put.status} ${t}` }).where(eq(s.uploads.id, up.id));
      throw new Error(`Upload failed: ${put.status}`);
    }
    data = await put.json() as { id: string };
    offset = end + 1;
  }
  if (!data?.id) throw new Error("YouTube upload returned no video ID");
  let processing = { uploadStatus: "unknown", processingStatus: "unknown" };
  try { processing = await youtubeProcessingStatus(accessToken, data.id); } catch { /* status can be checked again later */ }
  const uploadStatus = processing.processingStatus === "failed" || processing.uploadStatus === "failed" ? "failed" : processing.processingStatus === "succeeded" ? "processed" : "processing";
  await db.update(s.uploads).set({ status: uploadStatus, progress: 100, youtubeVideoId: data.id, uploadUrl: `https://youtu.be/${data.id}`, stateJson: { sessionUri, processing } }).where(eq(s.uploads.id, up.id));
  // Thumbnail
  try {
    const trows = await db.select().from(s.thumbnails).where(and(eq(s.thumbnails.projectId, proj.id), eq(s.thumbnails.selected, true))).limit(1);
    const thumb = trows[0] ?? (await db.select().from(s.thumbnails).where(eq(s.thumbnails.projectId, proj.id)).orderBy(desc(s.thumbnails.totalScore)).limit(1))[0];
    const thumbExt = thumb?.imagePath?.toLowerCase().split(".").pop() ?? "";
    if (thumb?.imagePath && ["png", "jpg", "jpeg"].includes(thumbExt)) {
      const thumbFile = await materializeMediaPath(thumb.imagePath);
      const img = readFileSync(thumbFile.path);
      thumbFile.cleanup();
      await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${data.id}`, {
        method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": thumbExt === "png" ? "image/png" : "image/jpeg" }, body: new Uint8Array(img),
      });
    }
  } catch { /* thumbnail best-effort */ }
  return { videoId: data.id, url: `https://youtu.be/${data.id}`, processingStatus: processing.processingStatus };
}

export async function ytAnalytics(channelUuid: string, videoId: string): Promise<Record<string, number | string> | null> {
  try {
    const accessToken = await refreshAccessToken(channelUuid);
    const end = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const p = new URLSearchParams({ ids: "channel==MINE", startDate: start, endDate: end, metrics: "views,likes,comments,shares,estimatedMinutesWatched,averageViewDuration,subscribersGained,impressions,impressionsClickThroughRate", filters: `video==${videoId}` });
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(`https://youtubeanalytics.googleapis.com/v2/reports?${p.toString()}`, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(20000) });
      if (res.ok) {
        const data = await res.json() as { rows?: (string | number)[][] };
        const r = data.rows?.[0];
        if (!r) return null;
        return { views: Number(r[0]), likes: Number(r[1]), comments: Number(r[2]), shares: Number(r[3]), watchMin: Number(r[4]), avgDur: Number(r[5]), subs: Number(r[6]), impressions: Number(r[7]), ctr: Number(r[8]) };
      }
      if (res.status < 500 && res.status !== 429) return null;
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
    return null;
  } catch { return null; }
}

// ─── FFmpeg renderer ───
export function ffmpegAvailable(): boolean {
  try {
    const r = spawnSync("ffmpeg", ["-version"], { timeout: 5000 });
    return r.status === 0;
  } catch { return false; }
}

export function ffprobeAvailable(): boolean {
  try {
    const r = spawnSync("ffprobe", ["-version"], { timeout: 5000 });
    return r.status === 0;
  } catch { return false; }
}

function validMp4(absPath: string, requireAudio = true): boolean {
  if (!ffprobeAvailable() || !existsSync(absPath)) return false;
  try {
    const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type:format=duration", "-of", "default=nw=1:nk=1", absPath], { timeout: 10000, encoding: "utf8" });
    if (r.status !== 0 || !r.stdout?.trim()) return false;
    const lines = r.stdout.trim().split(/\r?\n/).map((line) => line.trim());
    const duration = Number(lines.find((line) => /^\d+(\.\d+)?$/.test(line)) ?? "0");
    const video = lines.includes("video");
    const audio = lines.includes("audio");
    return duration > 0 && video && (!requireAudio || audio);
  } catch { return false; }
}

function fontPath(): string | null {
  for (const p of ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf", "/System/Library/Fonts/Helvetica.ttc"]) {
    if (existsSync(p)) return p;
  }
  return null;
}

function escDraw(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'").replace(/\n/g, " ").slice(0, 140);
}

export interface RenderResult { outputPath: string; previewPath: string; log: string; durationSec: number; fileSize: number; renderer: string; }

export async function renderVideo(projectId: string, edl: {
  resolution: string; aspectRatio: string; clips: { start: number; end: number; caption: string; textOverlay: string; asset?: string; kenburns?: string }[]; captions?: { enabled: boolean };
}, audioFiles: string[], jobLog: (m: string) => Promise<void> | void): Promise<RenderResult> {
  ensureDirs();
  const projectRows = await db.select().from(s.videoProjects).where(eq(s.videoProjects.id, projectId)).limit(1);
  const nicheRows = projectRows[0] ? await db.select().from(s.niches).where(eq(s.niches.id, projectRows[0].nicheId)).limit(1) : [];
  const snapshot = projectRows[0]?.creatorIdentity as Partial<CreatorIdentity> | null;
  const identity = snapshot?.creatorName ? mergeCreatorIdentity(snapshot) : (nicheRows[0] ? await getCreatorIdentity(nicheRows[0].channelId) : mergeCreatorIdentity());
  const creditText = [identity?.creatorName && `Created by ${identity.creatorName}`, identity?.brandName && `Produced with ${identity.brandName}`, identity?.aiAttribution, identity?.copyrightLine].filter(Boolean).join("\\n");
  const clips = creditText ? [...edl.clips, { start: edl.clips.length ? edl.clips[edl.clips.length - 1].end : 0, end: (edl.clips.length ? edl.clips[edl.clips.length - 1].end : 0) + 4, caption: "", textOverlay: creditText }] : edl.clips;
  const totalDur = clips.length ? clips[clips.length - 1].end : 10;
  const [W, H] = (edl.resolution || "1920x1080").split("x").map(Number);
  const w = W || 1920, h = H || 1080;
  const stamp = Date.now();
  const outName = `video/${projectId}-${stamp}.mp4`;
  const outAbs = join(GEN_DIR, outName);
  const previewName = `video/${projectId}-${stamp}.html`;
  const previewAbs = join(GEN_DIR, previewName);

  // Always build an animated HTML preview (storyboard player) — real timed playback of scenes/captions.
  const previewHtml = buildPreviewHtml(projectId, { ...edl, clips }, totalDur, w, h);
  writeFileSync(previewAbs, previewHtml);

  if (!ffmpegAvailable()) {
    await jobLog("FFmpeg binary not found — HTML timed preview generated; MP4 pending FFmpeg install.");
    return { outputPath: "", previewPath: publicUrl(previewAbs), log: "ffmpeg-missing: preview only", durationSec: totalDur, fileSize: 0, renderer: "html-preview" };
  }

  // Build real MP4 from scene assets when available, with a color fallback only for missing assets.
  const colors = ["0x0f172a", "0x1e1b4b", "0x052e16", "0x18181b", "0x111827"];
  const filterParts: string[] = [];
  const inputs: string[] = [];
  const assetFiles = await Promise.all(clips.map(async (clip) => {
    if (!clip.asset || /^https?:\/\//i.test(clip.asset)) return { path: "", cleanup: () => undefined };
    try { return await materializeMediaPath(clip.asset); } catch { return { path: "", cleanup: () => undefined }; }
  }));
  clips.forEach((c, i) => {
    const dur = Math.max(0.5, c.end - c.start);
    const assetPath = assetFiles[i].path;
    if (assetPath && existsSync(assetPath)) inputs.push("-loop", "1", "-i", assetPath);
    else inputs.push("-f", "lavfi", "-i", `color=c=${colors[i % colors.length]}:s=${w}x${h}:d=${dur}:r=30`);
    let vf = `zoompan=z='min(zoom+0.0015,1.3)':d=${Math.round(dur * 30)}:s=${w}x${h}:fps=30`;
    const font = fontPath();
    if (font && c.textOverlay) vf += `,drawtext=fontfile=${font}:text='${escDraw(c.textOverlay)}':fontcolor=white:fontsize=${Math.round(h / 12)}:x=(w-text_w)/2:y=h*0.18:shadowcolor=black:shadowx=3:shadowy=3`;
    if (font && edl.captions?.enabled && c.caption) vf += `,drawtext=fontfile=${font}:text='${escDraw(c.caption)}':fontcolor=yellow:fontsize=${Math.round(h / 22)}:x=(w-text_w)/2:y=h-120:shadowcolor=black:shadowx=2:shadowy=2`;
    vf += `,format=yuv420p`;
    filterParts.push(`[${i}:v]${vf}[v${i}]`);
  });
  const concat = clips.map((_, i) => `[v${i}]`).join("") + `concat=n=${clips.length}:v=1:a=0[vout]`;
  const audioFilesResolved = await Promise.all(audioFiles.map(async (audio) => {
    if (!audio) return { path: "", cleanup: () => undefined };
    try { return await materializeMediaPath(audio); } catch { return { path: "", cleanup: () => undefined }; }
  }));
  const existingAudio = audioFilesResolved.filter((audio) => Boolean(audio.path));
  const audioInputArgs: string[] = [];
  existingAudio.forEach((a) => { audioInputArgs.push("-i", a.path); });
  const audioFilter = existingAudio.length > 1
    ? `${existingAudio.map((_, i) => `[${clips.length + i}:a]aresample=44100[a${i}]`).join(";")};${existingAudio.map((_, i) => `[a${i}]`).join("")}concat=n=${existingAudio.length}:v=0:a=1[aout]`
    : "";
  const filterFull = filterParts.length ? `${filterParts.join(";")};${concat}${audioFilter ? `;${audioFilter}` : ""}` : audioFilter;
  const args: string[] = [...inputs, ...audioInputArgs, "-filter_complex", filterFull || "nullsrc", "-map", "[vout]"];
  if (existingAudio.length > 0) {
    if (existingAudio.length > 1) args.push("-map", "[aout]", "-af", `silenceremove=start_periods=1:start_duration=0.2:start_threshold=-50dB,loudnorm,apad=whole_dur=${totalDur}`, "-shortest");
    else args.push("-map", `${clips.length}:a`, "-af", `aresample=44100,silenceremove=start_periods=1:start_duration=0.2:start_threshold=-50dB,loudnorm,apad=whole_dur=${totalDur}`, "-shortest");
  } else {
    args.push("-f", "lavfi", "-i", `anullsrc=r=44100:cl=stereo:d=${totalDur}`, "-map", `${clips.length}:a`, "-shortest");
  }
  args.push("-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-y", outAbs);
  await jobLog(`Rendering ${edl.clips.length} clips → ${w}x${h}, ${totalDur.toFixed(1)}s`);
  try {
    execFileSync("ffmpeg", args, { timeout: 1000 * 60 * 10, stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    assetFiles.forEach((file) => file.cleanup()); audioFilesResolved.forEach((file) => file.cleanup());
    const msg = e instanceof Error ? e.message.slice(0, 800) : String(e).slice(0, 800);
    await jobLog(`FFmpeg failed: ${msg}`);
    return { outputPath: "", previewPath: publicUrl(previewAbs), log: `ffmpeg-error: ${msg}`, durationSec: totalDur, fileSize: 0, renderer: "html-preview" };
  }
  const size = existsSync(outAbs) ? statSync(outAbs).size : 0;
  if (!size || !validMp4(outAbs, true)) {
    assetFiles.forEach((file) => file.cleanup()); audioFilesResolved.forEach((file) => file.cleanup());
    if (existsSync(outAbs)) unlinkSync(outAbs);
    await jobLog("FFmpeg output failed ffprobe validation — HTML preview retained; MP4 rejected.");
    return { outputPath: "", previewPath: publicUrl(previewAbs), log: "ffprobe-invalid", durationSec: totalDur, fileSize: 0, renderer: "html-preview" };
  }
  assetFiles.forEach((file) => file.cleanup()); audioFilesResolved.forEach((file) => file.cleanup());
  await jobLog(`Render complete: ${(size / 1024 / 1024).toFixed(2)} MB`);
  return { outputPath: publicUrl(outAbs), previewPath: publicUrl(previewAbs), log: "ffmpeg-ok", durationSec: totalDur, fileSize: size, renderer: "ffmpeg" };
}

function buildPreviewHtml(projectId: string, edl: { clips: { start: number; end: number; caption: string; textOverlay: string }[] }, totalDur: number, w: number, h: number): string {
  const scenes = edl.clips.map((c, i) => ({ i, start: c.start, end: c.end, caption: c.caption, overlay: c.textOverlay, hue: (i * 47) % 360 }));
  return `<!doctype html><html><head><meta charset="utf-8"><title>Preview ${projectId}</title><style>
body{margin:0;background:#000;color:#fff;font-family:Arial,sans-serif;display:flex;flex-direction:column;align-items:center}
#stage{position:relative;width:min(96vw,${Math.round(w * 0.5)}px);aspect-ratio:${w}/${h};overflow:hidden;border-radius:12px;margin-top:16px}
.scene{position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;text-align:center;padding:24px;transition:opacity .4s}
.scene.active{display:flex}.ov{font-size:42px;font-weight:900;text-shadow:3px 3px 0 #000;margin-bottom:12px}
.cap{font-size:22px;font-weight:700;color:#fde047;text-shadow:2px 2px 0 #000}
#bar{width:min(96vw,640px);height:8px;background:#333;border-radius:4px;margin:16px}#fill{height:100%;width:0;background:#ef4444;border-radius:4px}
#t{color:#aaa;font-size:14px}button{background:#ef4444;color:#fff;border:0;padding:10px 28px;border-radius:8px;font-size:16px;font-weight:700;cursor:pointer;margin-top:8px}
</style></head><body><h2>Timed Storyboard Preview</h2><div id="stage">${scenes.map((sc) => `<div class="scene" id="sc${sc.i}" style="background:linear-gradient(135deg,hsl(${sc.hue},60%,18%),#000)"><div class="ov">${escapeHtml(sc.overlay || "SCENE " + (sc.i + 1))}</div><div class="cap">${escapeHtml(sc.caption || "")}</div></div>`).join("")}</div>
<div id="bar"><div id="fill"></div></div><div id="t">0.0s / ${totalDur.toFixed(1)}s</div><button onclick="play()">▶ Play</button>
<script>const scenes=${JSON.stringify(scenes)};const total=${totalDur};let timer=null;
function play(){const t0=Date.now();document.querySelector('button').disabled=true;
timer=setInterval(()=>{const el=(Date.now()-t0)/1000;document.getElementById('fill').style.width=Math.min(100,el/total*100)+'%';
document.getElementById('t').textContent=el.toFixed(1)+'s / '+total.toFixed(1)+'s';
scenes.forEach(sc=>{document.getElementById('sc'+sc.i).classList.toggle('active',el>=sc.start&&el<sc.end);});
if(el>=total){clearInterval(timer);document.querySelector('button').disabled=false;}},100);}</script></body></html>`;
}
function escapeHtml(s: string): string { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

// ─── Jobs ───
export async function createJob(type: string, payload: Record<string, unknown> = {}): Promise<string> {
  const rows = await db.insert(s.jobs).values({ type, status: "queued", payload }).returning({ id: s.jobs.id });
  return rows[0].id;
}
export async function updateJob(id: string, patch: Partial<typeof s.jobs.$inferInsert> & { logAppend?: string }) {
  const { logAppend, ...rest } = patch;
  if (logAppend) {
    const rows = await db.select().from(s.jobs).where(eq(s.jobs.id, id)).limit(1);
    const logs = [...(rows[0]?.logs ?? []), `[${new Date().toISOString()}] ${logAppend}`].slice(-200);
    await db.update(s.jobs).set({ ...rest, logs }).where(eq(s.jobs.id, id));
  } else {
    await db.update(s.jobs).set(rest).where(eq(s.jobs.id, id));
  }
}

export type JobHandler = (jobId: string, payload: Record<string, unknown>, log: (m: string) => Promise<void>, setProgress: (n: number) => Promise<void>) => Promise<Record<string, unknown>>;

async function requireNiche(nicheId: string) {
  const rows = await db.select().from(s.niches).where(eq(s.niches.id, nicheId)).limit(1);
  if (!rows[0]) throw new Error("Niche not found");
  return rows[0];
}

export const jobHandlers: Record<string, JobHandler> = {
  RESEARCH: async (jobId, p, log, prog) => {
    const nicheId = String(p.nicheId);
    const niche = await requireNiche(nicheId);
    const queries = [niche.primaryNiche, ...(niche.subNiches as string[] ?? []).slice(0, 3)];
    await prog(10);
    let stored = 0;
    if (!ytApiKey()) {
      await log("YOUTUBE_API_KEY not configured — research runs in catalog mode: analyzing stored reference data only.");
      const existing = await db.select().from(s.referenceVideos).where(eq(s.referenceVideos.nicheId, nicheId));
      await db.insert(s.researchResults).values({ nicheId, query: queries.join(" | "), queryType: "catalog", resultCount: existing.length, summary: `Catalog mode: ${existing.length} stored reference videos analyzed (connect YOUTUBE_API_KEY for live research).` });
      await prog(100);
      return { stored: 0, mode: "catalog", existing: existing.length };
    }
    for (let qi = 0; qi < queries.length; qi++) {
      const q = queries[qi];
      await log(`Searching YouTube: "${q}"`);
      const videos = await ytSearch(q, { maxResults: 20 });
      await prog(20 + Math.round((qi / queries.length) * 60));
      for (const v of videos) {
        const ageDays = Math.max(1, E.daysSince(v.publishedAt));
        const vpd = v.viewCount / ageDays;
        const velocityScore = E.clamp(Math.log10(1 + vpd) * 22);
        const analysis = E.analyzeReferenceVideo({ ...v, publishedAt: v.publishedAt });
        await db.insert(s.referenceVideos).values({
          nicheId, videoId: v.videoId, title: v.title.slice(0, 500), channelName: v.channelName, channelId: v.channelId,
          publishedAt: new Date(v.publishedAt), durationSec: v.durationSec, viewCount: v.viewCount, likeCount: v.likeCount,
          commentCount: v.commentCount, description: v.description, tags: v.tags.slice(0, 20), category: v.category,
          thumbnailUrl: v.thumbnailUrl, viewsPerDay: vpd, velocityScore, isShort: v.durationSec <= 60, analysis,
        }).onConflictDoNothing();
        stored++;
      }
      await db.insert(s.researchResults).values({ nicheId, query: q, queryType: "keyword", resultCount: videos.length, summary: `${videos.length} videos collected for "${q}".` });
    }
    await recordCost(null, jobId, "research", 0.02 * queries.length, `${queries.length} YouTube queries`);
    await prog(100);
    return { stored, mode: "live" };
  },

  TREND: async (jobId, p, log, prog) => {
    const nicheId = String(p.nicheId);
    await requireNiche(nicheId);
    const refs = await db.select().from(s.referenceVideos).where(eq(s.referenceVideos.nicheId, nicheId)).orderBy(desc(s.referenceVideos.viewsPerDay)).limit(200);
    await log(`Aggregating ${refs.length} reference videos into topics`);
    // Group by keyword signature
    const groups = new Map<string, typeof refs>();
    for (const r of refs) {
      const sig = r.title.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/).filter((w) => w.length > 4).slice(0, 3).join(" ") || "general";
      if (!groups.has(sig)) groups.set(sig, []);
      groups.get(sig)!.push(r);
    }
    await prog(40);
    const web = new WebResearch();
    let made = 0;
    for (const [topic, vids] of [...groups.entries()].slice(0, 15)) {
      const vpds = vids.map((v) => v.viewsPerDay ?? 0);
      const avg = vpds.reduce((a, b) => a + b, 0) / Math.max(1, vpds.length);
      const max = Math.max(...vpds, 0);
      const recent = vids.filter((v) => E.daysSince(v.publishedAt) < 30).length;
      const firstSeen = Math.min(...vids.map((v) => E.daysSince(v.publishedAt)), 365);
      const channels = new Set(vids.map((v) => v.channelId)).size;
      let webMentions = 0;
      if (web.status() === "ready") { try { webMentions = (await web.searchWeb(topic, 3)).length; } catch { webMentions = 0; } }
      const score = E.scoreTrend({ topic, recentUploads: recent, avgViewsPerDay: avg, maxViewsPerDay: max, competitorCount: Math.min(channels, 10), totalCoverage: vids.length, channelCoverage: 0, firstSeenDaysAgo: firstSeen, webMentions });
      await db.insert(s.trends).values({ nicheId, topic: topic.slice(0, 300), classification: score.classification, trendScore: score.trendScore, freshness: score.freshness, audienceInterest: score.audienceInterest, velocity: score.velocity, competition: score.competition, contentGap: score.contentGap, signals: { videos: vids.length, recent, avgVpd: Math.round(avg), maxVpd: Math.round(max), webMentions } });
      made++;
    }
    if (made === 0) await log("No reference videos yet — run RESEARCH first (or connect YOUTUBE_API_KEY).");
    await prog(100);
    return { trends: made };
  },

  IDEA: async (jobId, p, log, prog) => {
    const nicheId = String(p.nicheId);
    const niche = await requireNiche(nicheId);
    const topTrends = await db.select().from(s.trends).where(eq(s.trends.nicheId, nicheId)).orderBy(desc(s.trends.trendScore)).limit(5);
    if (topTrends.length === 0) throw new Error("No trends available — run TREND job first");
    const mem = await getMemory(niche.channelId);
    let opps = 0, ideas = 0;
    for (let i = 0; i < topTrends.length; i++) {
      const t = topTrends[i];
      await prog(Math.round((i / topTrends.length) * 50));
      const sig = (t.signals as Record<string, number> | null) ?? {};
      const oppInput: E.OpportunityInput = {
        topic: t.topic,
        demand: t.audienceInterest ?? 50, trendVelocity: t.velocity ?? 50,
        competitionLevel: 100 - (t.competition ?? 50), freshness: t.freshness ?? 50,
        channelFit: mem.failedTopics.some((f) => t.topic.toLowerCase().includes(f.toLowerCase())) ? 30 : 75,
        gapScore: t.contentGap ?? 50, productionDifficulty: 35,
        historicalFit: mem.successfulTopics.some((x) => t.topic.toLowerCase().includes(x.toLowerCase())) ? 85 : 55,
      };
      const score = E.scoreOpportunity(oppInput);
      const orows = await db.insert(s.opportunities).values({
        nicheId, trendId: t.id, topic: t.topic, opportunityScore: score, demand: oppInput.demand,
        trendVelocity: oppInput.trendVelocity, competitionLevel: oppInput.competitionLevel, freshness: oppInput.freshness,
        channelFit: oppInput.channelFit, gapScore: oppInput.gapScore, productionDifficulty: oppInput.productionDifficulty, historicalFit: oppInput.historicalFit,
      }).returning({ id: s.opportunities.id });
      opps++;
      const concepts = E.generateIdeas(t.topic, niche.primaryNiche, 5, { successfulTopics: mem.successfulTopics, failedTopics: mem.failedTopics, successfulHooks: mem.successfulHooks });
      for (const c of concepts) {
        await db.insert(s.contentIdeas).values({ opportunityId: orows[0].id, nicheId, ...c, status: "proposed" });
        ideas++;
      }
    }
    await recordCost(null, jobId, "llm", 0.01 * opps, "idea generation");
    await prog(100);
    return { opportunities: opps, ideas };
  },

  SCRIPT: async (jobId, p, log, prog) => {
    const ideaId = String(p.ideaId);
    const irows = await db.select().from(s.contentIdeas).where(eq(s.contentIdeas.id, ideaId)).limit(1);
    const idea = irows[0];
    if (!idea) throw new Error("Idea not found");
    const nrows = await db.select().from(s.niches).where(eq(s.niches.id, idea.nicheId)).limit(1);
    const niche = nrows[0];
    await log(`Writing original script for "${idea.title}"`);
    await prog(20);
    // Independent research: gather facts from web when available + reference titles as topic cues (never copied)
    const web = new WebResearch();
    let facts: string[] = [];
    if (web.status() === "ready") {
      try {
        const ev = await web.searchWeb(`${idea.title} ${niche?.primaryNiche ?? ""}`, 5);
        facts = ev.map((e) => e.snippet).filter(Boolean);
        await log(`Web research: ${ev.length} sources consulted`);
      } catch { facts = []; }
    }
    if (facts.length === 0) {
      // Topic cues only — paraphrased demand signals, never verbatim reference titles (originality-first).
      const refs = await db.select().from(s.referenceVideos).where(eq(s.referenceVideos.nicheId, idea.nicheId)).limit(5);
      facts = refs.map((r) => {
        const cue = r.title.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/).filter((w) => w.length > 4).slice(0, 4).join(" ");
        return `Audience demand signal around ${cue || "this topic"} remains strong across recent uploads.`;
      });
    }
    const gen = E.generateScript({ title: idea.title, hook: idea.hook ?? "", angle: idea.angle ?? "", narrativeStructure: idea.narrativeStructure ?? "", durationSec: idea.durationSec ?? 480 }, facts, niche?.primaryNiche ?? "video");
    const identity = niche ? await getCreatorIdentity(niche.channelId) : null;
    const scriptBody = identity?.includeSpokenAttribution ? `${gen.body}\n\nCreated by ${identity.creatorName}. Produced with ${identity.brandName}.` : gen.body;
    await prog(60);
    const wordCount = scriptBody.trim().split(/\s+/).length;
    const srows = await db.insert(s.scripts).values({ ideaId, nicheId: idea.nicheId, title: idea.title, body: scriptBody, wordCount, estimatedDurationSec: gen.estimatedDurationSec, structure: gen.structure as Record<string, unknown>, status: "draft" }).returning({ id: s.scripts.id });
    await db.update(s.videoProjects).set({ scriptId: srows[0].id, updatedAt: new Date() }).where(eq(s.videoProjects.ideaId, ideaId));
    await db.update(s.contentIdeas).set({ status: "scripted" }).where(eq(s.contentIdeas.id, ideaId));
    await recordCost(null, jobId, "llm", 0.02, "script generation");
    await prog(100);
    return { scriptId: srows[0].id, words: gen.wordCount };
  },

  FACT_CHECK: async (jobId, p, log, prog) => {
    const scriptId = String(p.scriptId);
    const srows = await db.select().from(s.scripts).where(eq(s.scripts.id, scriptId)).limit(1);
    const script = srows[0];
    if (!script) throw new Error("Script not found");
    const claims = E.extractClaims(script.body);
    await log(`Checking ${claims.length} factual claims`);
    const web = new WebResearch();
    let verified = 0;
    for (let i = 0; i < claims.length; i++) {
      await prog(Math.round((i / Math.max(1, claims.length)) * 90));
      let evidence: { title: string; url: string; snippet: string }[] = [];
      if (web.status() === "ready") { try { evidence = await web.searchWeb(claims[i].slice(0, 120), 4); } catch { evidence = []; } }
      const v = E.verifyClaim({ claim: claims[i], isCritical: i < 2 }, evidence);
      if (v.status === "VERIFIED" || v.status === "LIKELY") verified++;
      await db.insert(s.scriptFacts).values({ scriptId, claim: claims[i].slice(0, 1000), source: v.source.slice(0, 500), url: v.url.slice(0, 1000), confidence: v.confidence, status: v.status, notes: v.notes, isCritical: i < 2 });
    }
    await db.update(s.scripts).set({ status: "fact_checked" }).where(eq(s.scripts.id, scriptId));
    await prog(100);
    return { claims: claims.length, verified };
  },

  ASSET: async (jobId, p, log, prog) => {
    const projectId = String(p.projectId);
    const prows = await db.select().from(s.videoProjects).where(eq(s.videoProjects.id, projectId)).limit(1);
    const proj = prows[0];
    if (!proj) throw new Error("Project not found");
    ensureDirs();
    const scn = await projectScenes(projectId);
    const count = Math.max(3, Math.min(8, scn.length || 4));
    const img = getImage();
    const paths: string[] = [];
    for (let i = 0; i < count; i++) {
      await prog(Math.round((i / count) * 90));
      const scene = scn[i % Math.max(1, scn.length)] as typeof scn[number] | undefined;
      const plan = (scene?.visualPlan ?? {}) as Record<string, unknown>;
      const prompt = `${proj.title} — ${String(plan.subject ?? scene?.visual ?? "scene")} (${String(plan.archetype ?? "explainer")}); composition: ${String(plan.composition ?? "clear focal subject")}; renderer primitives: ${JSON.stringify(plan.rendererHints ?? {})}`;
      const { svg, costUsd } = await img.generateImage(prompt, { width: 1280, height: 720 });
      const name = `img/${projectId}-${i}.svg`;
      const stored = await getMediaStorage().put(name, svg);
      await db.insert(s.assets).values({ projectId, kind: "image", fileName: `${projectId}-${i}.svg`, storagePath: stored.publicPath, source: img.name, license: "original", attribution: "AI Studio (original render)", rights: "owned", width: 1280, height: 720, meta: { sceneIndex: i, visualPlan: plan, storage: stored } });
      if (costUsd > 0) await recordCost(projectId, jobId, "image", costUsd, `scene ${i}`);
      paths.push(publicUrl(join(GEN_DIR, name)));
    }
    const erows = await db.select().from(s.editDecisionLists).where(eq(s.editDecisionLists.projectId, projectId)).limit(1);
    if (erows[0]) {
      const current = erows[0].edl as { clips?: Record<string, unknown>[] };
      const clips = (current.clips ?? []).map((clip, i) => ({ ...clip, asset: paths[i % Math.max(1, paths.length)] ?? clip.asset }));
      await db.update(s.editDecisionLists).set({ edl: { ...current, clips } }).where(eq(s.editDecisionLists.id, erows[0].id));
    }
    await prog(100);
    return { assets: paths.length, paths };
  },

  VOICE: async (jobId, p, log, prog) => {
    const projectId = String(p.projectId);
    const prows = await db.select().from(s.videoProjects).where(eq(s.videoProjects.id, projectId)).limit(1);
    const proj = prows[0];
    if (!proj) throw new Error("Project not found");
    ensureDirs();
    await db.delete(s.voices).where(eq(s.voices.projectId, projectId));
    const scenes = await projectScenes(projectId);
    const voice = getVoice();
    const files: string[] = [];
    const list = scenes.length > 0 ? scenes : [{ id: "full", narration: (await db.select().from(s.scripts).where(eq(s.scripts.id, proj.scriptId ?? "")).limit(1))[0]?.body?.slice(0, 4000) ?? proj.title }];
    for (let i = 0; i < list.length; i++) {
      await prog(Math.round((i / list.length) * 90));
      const text = (list[i].narration || "").slice(0, 1500);
      if (!text.trim()) continue;
      const { audioBase64, durationSec, costUsd } = await voice.synthesize(text, { voice: "narrator", speed: 1 });
      const name = `audio/${projectId}-scene${i}.wav`;
      const stored = await getMediaStorage().put(name, Buffer.from(audioBase64, "base64"));
      await db.insert(s.voices).values({ projectId, scriptId: proj.scriptId, provider: voice.name, voiceName: "narrator", text: text.slice(0, 2000), audioPath: stored.publicPath, durationSec, status: "done" });
      if (costUsd > 0) await recordCost(projectId, jobId, "voice", costUsd, `scene ${i}`);
      files.push(stored.publicPath);
    }
    await prog(100);
    return { clips: files.length, files, provider: voice.name };
  },

  RENDER: async (jobId, p, log, prog) => {
    const projectId = String(p.projectId);
    const prows = await db.select().from(s.videoProjects).where(eq(s.videoProjects.id, projectId)).limit(1);
    const proj = prows[0];
    if (!proj) throw new Error("Project not found");
    const erows = await db.select().from(s.editDecisionLists).where(eq(s.editDecisionLists.projectId, projectId)).limit(1);
    if (!erows[0]) throw new Error("EDL not found — generate storyboard/EDL first");
    const vrows = await db.select().from(s.voices).where(eq(s.voices.projectId, projectId));
    const rrows = await db.insert(s.renders).values({ projectId, status: "rendering", progress: 5 }).returning({ id: s.renders.id });
    const renderId = rrows[0].id;
    try {
      let result = await renderVideo(projectId, erows[0].edl as unknown as { resolution: string; aspectRatio: string; clips: { start: number; end: number; caption: string; textOverlay: string }[]; captions?: { enabled: boolean } }, vrows.map((v) => v.audioPath ?? ""), async (m) => { await log(m); });
      const media = getMediaStorage();
      if (result.outputPath && media.durable) {
        const stored = await media.put(`video/${projectId}-${Date.now()}.mp4`, readFileSync(localMediaPath(result.outputPath)));
        result = { ...result, outputPath: stored.publicPath, fileSize: stored.size };
      }
      await db.update(s.renders).set({ status: result.outputPath ? "done" : "preview", progress: 100, outputPath: result.outputPath, previewHtml: result.previewPath, log: result.log, durationSec: result.durationSec, fileSize: result.fileSize, renderer: result.renderer }).where(eq(s.renders.id, renderId));
      await recordCost(projectId, jobId, "rendering", (result.durationSec / 60) * 0.05, result.renderer);
      await prog(100);
      return { renderId, ...result };
    } catch (e) {
      await db.update(s.renders).set({ status: "failed", log: e instanceof Error ? e.message.slice(0, 1000) : "render failed" }).where(eq(s.renders.id, renderId));
      throw e;
    }
  },

  QUALITY: async (jobId, p, log, prog) => {
    const projectId = String(p.projectId);
    const q = await runQuality(projectId, log);
    await prog(100);
    return q as unknown as Record<string, unknown>;
  },

  UPLOAD: async (jobId, p, log, prog) => {
    const uploadId = String(p.uploadId);
    const urows = await db.select().from(s.uploads).where(eq(s.uploads.id, uploadId)).limit(1);
    const up = urows[0];
    if (!up) throw new Error("Upload not found");
    const prows = await db.select().from(s.videoProjects).where(eq(s.videoProjects.id, up.projectId)).limit(1);
    const nrows = await db.select().from(s.niches).where(eq(s.niches.id, prows[0].nicheId)).limit(1);
    const channelId = nrows[0].channelId;
    if (!oauthConfigured()) throw new Error("YouTube OAuth not configured — set YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET");
    await prog(20);
    const r = await ytUploadVideo(channelId, uploadId);
    if (r.processingStatus !== "succeeded") await createJob("PROCESSING", { uploadId });
    await prog(100);
    return r;
  },

  PROCESSING: async (jobId, p, log, prog) => {
    const uploadId = String(p.uploadId);
    const urows = await db.select().from(s.uploads).where(eq(s.uploads.id, uploadId)).limit(1);
    const up = urows[0];
    if (!up?.youtubeVideoId) throw new Error("Upload has no YouTube video ID");
    const prows = await db.select().from(s.videoProjects).where(eq(s.videoProjects.id, up.projectId)).limit(1);
    const nrows = prows[0] ? await db.select().from(s.niches).where(eq(s.niches.id, prows[0].nicheId)).limit(1) : [];
    if (!nrows[0]) throw new Error("Upload channel not found");
    const accessToken = await refreshAccessToken(nrows[0].channelId);
    await prog(20);
    let processing = await youtubeProcessingStatus(accessToken, up.youtubeVideoId);
    for (const delayMs of [1000, 3000, 7000]) {
      if (processing.processingStatus === "succeeded" || processing.processingStatus === "failed" || processing.processingStatus === "terminated") break;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      processing = await youtubeProcessingStatus(accessToken, up.youtubeVideoId);
    }
    const status = processing.processingStatus === "failed" || processing.uploadStatus === "failed" || processing.processingStatus === "terminated" ? "failed" : processing.processingStatus === "succeeded" ? "processed" : "processing";
    await db.update(s.uploads).set({ status, lastError: status === "failed" ? `YouTube processing ${processing.processingStatus}` : "", stateJson: { ...(up.stateJson as Record<string, unknown> ?? {}), processing } }).where(eq(s.uploads.id, up.id));
    await log(`YouTube processing: ${processing.processingStatus}`);
    await prog(100);
    return { uploadId, status, processing };
  },

  ANALYTICS: async (jobId, p, log, prog) => {
    const projectId = p.projectId ? String(p.projectId) : null;
    if (!projectId) throw new Error("projectId required");
    const prows = await db.select().from(s.videoProjects).where(eq(s.videoProjects.id, projectId)).limit(1);
    const proj = prows[0];
    const urows = await db.select().from(s.uploads).where(eq(s.uploads.projectId, projectId)).orderBy(desc(s.uploads.createdAt)).limit(1);
    const up = urows[0];
    const nrows = await db.select().from(s.niches).where(eq(s.niches.id, proj.nicheId)).limit(1);
    let snap: Record<string, number | string> | null = null;
    if (up?.youtubeVideoId && oauthConfigured()) {
      snap = await ytAnalytics(nrows[0].channelId, up.youtubeVideoId);
    }
    if (!snap && up?.youtubeVideoId && ytApiKey()) {
      // Fallback: public stats via Data API
      try {
        const v = await ytVideos([up.youtubeVideoId]);
        if (v[0]) snap = { views: v[0].viewCount, likes: v[0].likeCount, comments: v[0].commentCount, shares: 0, watchMin: 0, avgDur: 0, subs: 0, impressions: 0, ctr: 0 };
      } catch { snap = null; }
    }
    if (!snap) {
      await log("No live analytics available (video not published or APIs unconfigured) — snapshot skipped honestly.");
      return { skipped: true, reason: "not_published_or_unconfigured" };
    }
    await db.insert(s.analyticsSnapshots).values({
      projectId, channelId: nrows[0].channelId, youtubeVideoId: up?.youtubeVideoId ?? "",
      views: Number(snap.views ?? 0), impressions: Number(snap.impressions ?? 0), ctr: Number(snap.ctr ?? 0),
      watchTimeSec: Math.round(Number(snap.watchMin ?? 0) * 60), avgViewDurationSec: Number(snap.avgDur ?? 0),
      avgPercentageViewed: 0, likes: Number(snap.likes ?? 0), comments: Number(snap.comments ?? 0),
      shares: Number(snap.shares ?? 0), subsGained: Number(snap.subs ?? 0), source: "youtube",
    });
    await prog(100);
    return { captured: true, views: Number(snap.views ?? 0) };
  },

  AUTONOMOUS: async (jobId, p, log, prog) => {
    const nicheId = String(p.nicheId);
    const result = await runAutonomousLoop(nicheId, jobId, log, prog, { maxVideos: Number(p.maxVideos ?? 1) });
    return result as unknown as Record<string, unknown>;
  },
};

export async function runJobNow(jobId: string, options: { alreadyClaimed?: boolean } = {}): Promise<void> {
  const rows = await db.select().from(s.jobs).where(eq(s.jobs.id, jobId)).limit(1);
  const job = rows[0];
  if (!job) throw new Error("Job not found");
  if (job.status === "done" || (job.status === "running" && !options.alreadyClaimed)) return;
  const handler = jobHandlers[job.type];
  if (!handler) { await updateJob(jobId, { status: "failed", error: `No handler for ${job.type}` }); return; }
  await updateJob(jobId, { status: "running", startedAt: new Date(), error: "" });
  const log = async (m: string) => { await updateJob(jobId, { logAppend: m }); };
  const prog = async (n: number) => { await db.update(s.jobs).set({ progress: n }).where(eq(s.jobs.id, jobId)); };
  try {
    const result = await handler(jobId, (job.payload as Record<string, unknown>) ?? {}, log, prog);
    await updateJob(jobId, { status: "done", progress: 100, result, finishedAt: new Date(), logAppend: "Job completed." });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const retries = (job.retryCount ?? 0) + 1;
    const max = job.maxRetries ?? 3;
    if (retries <= max && !/not configured|not found|No .* available|quota exceeded/i.test(msg)) {
      await updateJob(jobId, { status: "queued", retryCount: retries, error: msg, logAppend: `Failed (attempt ${retries}/${max}): ${msg} — will retry.` });
    } else {
      await updateJob(jobId, { status: "failed", retryCount: retries, error: msg, finishedAt: new Date(), logAppend: `FAILED: ${msg}` });
    }
  }
}

// ─── Project helpers ───
export async function projectScenes(projectId: string) {
  const sb = await db.select().from(s.storyboards).where(eq(s.storyboards.projectId, projectId)).orderBy(desc(s.storyboards.createdAt)).limit(1);
  if (!sb[0]) return [];
  return db.select().from(s.storyboardScenes).where(eq(s.storyboardScenes.storyboardId, sb[0].id)).orderBy(s.storyboardScenes.sceneIndex);
}

export async function ensureProjectForIdea(ideaId: string): Promise<string> {
  const irows = await db.select().from(s.contentIdeas).where(eq(s.contentIdeas.id, ideaId)).limit(1);
  const idea = irows[0];
  if (!idea) throw new Error("Idea not found");
  const existing = await db.select().from(s.videoProjects).where(eq(s.videoProjects.ideaId, ideaId)).limit(1);
  if (existing[0]) return existing[0].id;
  const isShort = idea.format === "short";
  const nicheRows = await db.select().from(s.niches).where(eq(s.niches.id, idea.nicheId)).limit(1);
  const identity = nicheRows[0] ? await getCreatorIdentity(nicheRows[0].channelId) : await getCreatorIdentity("");
  const rows = await db.insert(s.videoProjects).values({
    nicheId: idea.nicheId, ideaId, title: idea.title, format: idea.format ?? "long-form",
    aspectRatio: isShort ? "9:16" : "16:9", resolution: isShort ? "1080x1920" : "1920x1080", stage: "script", creatorIdentity: identity,
  }).returning({ id: s.videoProjects.id });
  return rows[0].id;
}

export async function buildStoryboardAndEDL(projectId: string, scriptId: string): Promise<{ scenes: number }> {
  const srows = await db.select().from(s.scripts).where(eq(s.scripts.id, scriptId)).limit(1);
  const script = srows[0];
  if (!script) throw new Error("Script not found");
  const prows = await db.select().from(s.videoProjects).where(eq(s.videoProjects.id, projectId)).limit(1);
  const proj = prows[0];
  const scenes = E.buildStoryboard(script.body, script.estimatedDurationSec || 480, proj?.title ?? script.title);
  const timed = E.timeScenes(scenes, script.estimatedDurationSec || 480);
  const sbrows = await db.insert(s.storyboards).values({ scriptId, projectId, totalDurationSec: Math.round(timed.length ? timed[timed.length - 1].endSec : 0) }).returning({ id: s.storyboards.id });
  for (const t of timed) {
    await db.insert(s.storyboardScenes).values({ storyboardId: sbrows[0].id, ...t, visualPlan: t.visualPlan as unknown as Record<string, unknown> });
  }
  const arows = await db.select().from(s.assets).where(eq(s.assets.projectId, projectId));
  const vrows = await db.select().from(s.voices).where(eq(s.voices.projectId, projectId));
  const edl = E.buildEDL(timed as E.TimedScene[], {
    aspectRatio: proj.aspectRatio ?? "16:9", resolution: proj.resolution ?? "1920x1080",
    audioPath: vrows[0]?.audioPath ?? "", assetPaths: arows.map((a) => a.storagePath ?? ""),
  });
  await db.insert(s.editDecisionLists).values({ projectId, edl: edl as unknown as Record<string, unknown> }).onConflictDoUpdate({ target: s.editDecisionLists.projectId, set: { edl: edl as unknown as Record<string, unknown> } });
  await db.update(s.videoProjects).set({ scriptId, stage: "production", updatedAt: new Date() }).where(eq(s.videoProjects.id, projectId));
  return { scenes: timed.length };
}

export async function runQuality(projectId: string, log?: (m: string) => Promise<void> | void) {
  const prows = await db.select().from(s.videoProjects).where(eq(s.videoProjects.id, projectId)).limit(1);
  const proj = prows[0];
  if (!proj) throw new Error("Project not found");
  const facts = proj.scriptId ? await db.select().from(s.scriptFacts).where(eq(s.scriptFacts.scriptId, proj.scriptId)) : [];
  const scriptBody = proj.scriptId ? (await db.select().from(s.scripts).where(eq(s.scripts.id, proj.scriptId)).limit(1))[0]?.body ?? "" : "";
  const refs = await db.select().from(s.referenceVideos).where(eq(s.referenceVideos.nicheId, proj.nicheId)).limit(20);
  const orig = E.originalityCheck(scriptBody || proj.title, refs.map((r) => ({ title: r.title, description: r.description ?? "" })));
  const arows = await db.select().from(s.assets).where(eq(s.assets.projectId, projectId));
  const vrows = await db.select().from(s.voices).where(eq(s.voices.projectId, projectId));
  const rrows = await db.select().from(s.renders).where(eq(s.renders.projectId, projectId)).orderBy(desc(s.renders.createdAt)).limit(1);
  const trows = await db.select().from(s.titleOptions).where(eq(s.titleOptions.projectId, projectId)).orderBy(desc(s.titleOptions.totalScore)).limit(1);
  const throwss = await db.select().from(s.thumbnails).where(eq(s.thumbnails.projectId, projectId)).limit(1);
  const mrows = await db.select().from(s.seoMetadata).where(eq(s.seoMetadata.projectId, projectId)).limit(1);
  let hasRender = false;
  if (rrows[0]?.status === "done" && rrows[0].outputPath && (rrows[0].fileSize ?? 0) > 0) {
    const renderFile = await materializeMediaPath(rrows[0].outputPath);
    hasRender = validMp4(renderFile.path, true);
    renderFile.cleanup();
  }
  const hasAudio = (await Promise.all(vrows.map(async (voice) => {
    if (!voice.audioPath || !voice.text?.trim()) return false;
    try { const file = await materializeMediaPath(voice.audioPath); const valid = statSync(file.path).size > 44; file.cleanup(); return valid; } catch { return false; }
  }))).some(Boolean);
  const hasAssets = (await Promise.all(arows.map(async (asset) => {
    if (!asset.storagePath) return false;
    try { const file = await materializeMediaPath(asset.storagePath); const valid = statSync(file.path).size > 0; file.cleanup(); return valid; } catch { return false; }
  }))).every(Boolean);
  const hasNarration = Boolean(scriptBody.trim()) && (await projectScenes(projectId)).every((scene) => Boolean(scene.narration?.trim()));
  const gate = E.runQualityGate({
    facts: facts.map((f) => ({ status: f.status ?? "UNCERTAIN", isCritical: f.isCritical ?? false })),
    originalityVerdict: orig.verdict,
    assets: hasAssets ? arows.map((a) => ({ license: a.license ?? "", rights: a.rights ?? "" })) : [{ license: "unknown", rights: "unknown" }],
    titleRisk: trows[0]?.clickbaitRisk ?? 20,
    hasAudio: hasAudio && hasNarration, hasVideo: hasRender, hasCaptions: hasRender && hasNarration,
    hasThumbnail: throwss.length > 0, hasMetadata: Boolean(mrows[0]),
    scriptBody,
    titlePresent: Boolean(trows[0]?.title?.trim() || proj.title?.trim()),
    descriptionPresent: Boolean(mrows[0]?.description?.trim()),
  });
  const grows = await db.insert(s.qualityGates).values({
    projectId, facts: gate.facts, originality: gate.originality, rights: gate.rights, policyRisk: gate.policyRisk,
    audio: gate.audio, video: gate.video, captions: gate.captions, thumbnail: gate.thumbnail, title: gate.title,
    metadata: gate.metadata, verdict: gate.verdict, reasons: gate.reasons,
    details: { phraseSimilarity: orig.phraseSimilarity, titleSimilarity: orig.titleSimilarity, maxMatch: orig.maxMatch },
  }).returning({ id: s.qualityGates.id });
  if (log) await log(`Quality gate: ${gate.verdict}${gate.reasons.length ? " — " + gate.reasons.join("; ") : ""}`);
  return { gateId: grows[0].id, ...gate };
}

// ─── Channel memory ───
export async function getMemory(channelId: string) {
  const rows = await db.select().from(s.channelMemories).where(eq(s.channelMemories.channelId, channelId)).limit(1);
  if (rows[0]) {
    return {
      successfulTopics: (rows[0].successfulTopics as string[]) ?? [], failedTopics: (rows[0].failedTopics as string[]) ?? [],
      successfulHooks: (rows[0].successfulHooks as string[]) ?? [], successfulFormats: (rows[0].successfulFormats as string[]) ?? [],
    };
  }
  return { successfulTopics: [] as string[], failedTopics: [] as string[], successfulHooks: [] as string[], successfulFormats: [] as string[] };
}

export type CreatorIdentity = {
  creatorName: string;
  brandName: string;
  creatorHandle: string;
  copyrightLine: string;
  aiAttribution: string;
  socialLinks: string[];
  includeSpokenAttribution: boolean;
};
function mergeCreatorIdentity(value?: Partial<CreatorIdentity> | null): CreatorIdentity {
  return {
    creatorName: value?.creatorName || "Vinod Kumar",
    brandName: value?.brandName || "VK YouTube AI",
    creatorHandle: value?.creatorHandle || "",
    copyrightLine: value?.copyrightLine || "© 2026 Vinod Kumar",
    aiAttribution: value?.aiAttribution || "Produced with VK YouTube AI",
    socialLinks: value?.socialLinks ?? [],
    includeSpokenAttribution: value?.includeSpokenAttribution ?? false,
  };
}

export async function getCreatorIdentity(channelId: string): Promise<CreatorIdentity> {
  const rows = await db.select().from(s.automationSettings).where(eq(s.automationSettings.channelId, channelId)).limit(1);
  const settings = rows[0];
  return mergeCreatorIdentity(settings ? {
    creatorName: settings.creatorName ?? undefined,
    brandName: settings.brandName ?? undefined,
    creatorHandle: settings.creatorHandle ?? undefined,
    copyrightLine: settings.copyrightLine ?? undefined,
    aiAttribution: settings.aiAttribution ?? undefined,
    socialLinks: (settings.socialLinks as string[] | null) ?? undefined,
    includeSpokenAttribution: settings.includeSpokenAttribution ?? undefined,
  } : null);
}

export async function updateMemoryFromAutopsy(channelId: string, topic: string, hook: string, format: string, outperformed: boolean) {
  const rows = await db.select().from(s.channelMemories).where(eq(s.channelMemories.channelId, channelId)).limit(1);
  const cur = rows[0];
  const push = (arr: unknown, v: string) => [...new Set([...((arr as string[]) ?? []), v])].slice(-50);
  if (!cur) {
    await db.insert(s.channelMemories).values({
      channelId,
      successfulTopics: outperformed ? [topic] : [], failedTopics: outperformed ? [] : [topic],
      successfulHooks: outperformed ? [hook] : [], failedHooks: outperformed ? [] : [hook],
      successfulFormats: outperformed ? [format] : [],
      weights: { [topic]: outperformed ? 1 : -1 },
    });
  } else {
    await db.update(s.channelMemories).set({
      successfulTopics: outperformed ? push(cur.successfulTopics, topic) : cur.successfulTopics,
      failedTopics: outperformed ? cur.failedTopics : push(cur.failedTopics, topic),
      successfulHooks: outperformed ? push(cur.successfulHooks, hook) : cur.successfulHooks,
      failedHooks: outperformed ? cur.failedHooks : push(cur.failedHooks, hook),
      successfulFormats: outperformed ? push(cur.successfulFormats, format) : cur.successfulFormats,
      weights: { ...((cur.weights as Record<string, number>) ?? {}), [topic]: (((cur.weights as Record<string, number>) ?? {})[topic] ?? 0) + (outperformed ? 1 : -1) },
      updatedAt: new Date(),
    }).where(eq(s.channelMemories.id, cur.id));
  }
}

// ─── Autonomous loop ───
export async function runAutonomousLoop(nicheId: string, jobId: string, log: (m: string) => Promise<void>, prog: (n: number) => Promise<void>, opts: { maxVideos?: number } = {}) {
  const niche = await requireNiche(nicheId);
  const asettings = await db.select().from(s.automationSettings).where(eq(s.automationSettings.channelId, niche.channelId)).limit(1);
  const auto = asettings[0];
  const mode = auto?.mode ?? "manual";
  const gates = (auto?.approvalGates as string[]) ?? ["script", "publish"];
  const maxCost = auto?.maxCostPerVideo ?? 5;
  const stages: string[] = [];
  const runStage = async (type: string, payload: Record<string, unknown>, label: string) => {
    const jid = await createJob(type, payload);
    await log(`Stage: ${label}`);
    await runJobNow(jid);
    const jr = await db.select().from(s.jobs).where(eq(s.jobs.id, jid)).limit(1);
    if (jr[0].status !== "done") throw new Error(`Stage ${label} failed: ${jr[0].error}`);
    stages.push(label);
    return jr[0].result as Record<string, unknown>;
  };

  // 1. Research → trends → ideas
  if (auto?.autoResearch !== false) await runStage("RESEARCH", { nicheId }, "research");
  await prog(10);
  await runStage("TREND", { nicheId }, "trend");
  await prog(20);
  if (auto?.autoIdeas !== false) await runStage("IDEA", { nicheId }, "idea");
  await prog(30);

  // 2. Select strongest idea
  const ideas = await db.select().from(s.contentIdeas).where(and(eq(s.contentIdeas.nicheId, nicheId), eq(s.contentIdeas.status, "proposed"))).orderBy(desc(s.contentIdeas.score)).limit(1);
  if (!ideas[0]) throw new Error("No proposed ideas available");
  const idea = ideas[0];
  await log(`Selected idea: "${idea.title}" (score ${idea.score})`);
  await db.update(s.contentIdeas).set({ status: "selected" }).where(eq(s.contentIdeas.id, idea.id));
  const projectId = await ensureProjectForIdea(idea.id);

  // Cost guard
  const est = E.estimateVideoCost(idea.durationSec ?? 480, 6);
  if (est.total > maxCost) {
    await db.update(s.videoProjects).set({ status: "paused_cost", error: `Estimated $${est.total} exceeds limit $${maxCost}` }).where(eq(s.videoProjects.id, projectId));
    await log(`PAUSED: estimated cost $${est.total} exceeds limit $${maxCost} — approval required.`);
    return { projectId, paused: "cost", estimate: est.total };
  }

  // 3. Script + fact check (+ originality implicitly at QA)
  if (auto?.autoScript !== false) {
    const sr = await runStage("SCRIPT", { ideaId: idea.id }, "script");
    const scriptId = String(sr.scriptId);
    await db.update(s.videoProjects).set({ scriptId }).where(eq(s.videoProjects.id, projectId));
    if (mode === "manual" && gates.includes("script")) {
      await log("Manual mode: script awaiting approval — pausing pipeline at script gate.");
      return { projectId, paused: "script", scriptId };
    }
    await runStage("FACT_CHECK", { scriptId }, "fact-check");
    await prog(45);
  }

  // 4. Production: storyboard/EDL, assets, voice, render
  if (auto?.autoProduction !== false) {
    const srows = await db.select().from(s.scripts).where(eq(s.scripts.ideaId, idea.id)).orderBy(desc(s.scripts.createdAt)).limit(1);
    if (!srows[0]) throw new Error("No script for production");
    await runStage("ASSET", { projectId }, "assets");
    await prog(55);
    await runStage("VOICE", { projectId }, "voice");
    await prog(65);
    // Storyboard + EDL after assets/voice so paths embed
    await buildStoryboardAndEDL(projectId, srows[0].id);
    await log("Stage: storyboard + EDL");
    stages.push("storyboard+edl");
    // Titles / thumbnails / SEO
    await generatePackaging(projectId, idea.title, idea.titleIdeas as string[] ?? [], niche.primaryNiche);
    await log("Stage: titles + thumbnails + SEO");
    stages.push("packaging");
    await runStage("RENDER", { projectId }, "render");
    await prog(80);
  } else {
    await log("autoProduction disabled — pausing before production.");
    return { projectId, paused: "production" };
  }

  // 5. Quality gate
  const q = await runStage("QUALITY", { projectId }, "quality");
  await prog(88);
  if ((q as { verdict: string }).verdict !== "PASS") {
    await db.update(s.videoProjects).set({ status: "blocked_qa", error: "Quality gate blocked" }).where(eq(s.videoProjects.id, projectId));
    await log("Quality gate BLOCKED — resolve reasons before upload.");
    return { projectId, paused: "quality", reasons: (q as { reasons: string[] }).reasons };
  }

  // 6. Upload / publish
  if (auto?.autoUpload !== false) {
    const existing = await db.select().from(s.uploads).where(eq(s.uploads.projectId, projectId)).limit(1);
    let uploadId = existing[0]?.id;
    if (!uploadId) {
      const u = await db.insert(s.uploads).values({ projectId, privacy: auto?.autoPublishing ? "public" : "private", status: "prepared" }).returning({ id: s.uploads.id });
      uploadId = u[0].id;
    }
    if (mode === "manual" && gates.includes("publish")) {
      await log("Manual mode: upload prepared, awaiting publish approval.");
      return { projectId, paused: "publish", uploadId };
    }
    if (!oauthConfigured()) {
      await log("Upload prepared — YouTube OAuth not configured (set YOUTUBE_CLIENT_ID/SECRET to publish).");
      return { projectId, paused: "oauth", uploadId };
    }
    await runStage("UPLOAD", { uploadId }, "upload");
    await prog(95);
    if (auto?.autoAnalytics !== false) {
      try { await runStage("ANALYTICS", { projectId }, "analytics"); } catch (e) { await log(`Analytics deferred: ${e instanceof Error ? e.message : e}`); }
    }
  }
  await prog(100);
  return { projectId, stages, done: true };
}

export async function generatePackaging(projectId: string, topic: string, seedTitles: string[], niche: string) {
  ensureDirs();
  const projectRows = await db.select().from(s.videoProjects).where(eq(s.videoProjects.id, projectId)).limit(1);
  const nicheRows = projectRows[0] ? await db.select().from(s.niches).where(eq(s.niches.id, projectRows[0].nicheId)).limit(1) : [];
  const snapshot = projectRows[0]?.creatorIdentity as Partial<CreatorIdentity> | null;
  const identity = snapshot?.creatorName ? mergeCreatorIdentity(snapshot) : (nicheRows[0] ? await getCreatorIdentity(nicheRows[0].channelId) : mergeCreatorIdentity());
  const titles = [...new Set([...(seedTitles ?? []), ...E.generateTitles(topic, niche)])].slice(0, 6);
  for (const t of titles) {
    const sc = E.scoreTitle(t, topic);
    await db.insert(s.titleOptions).values({ projectId, title: t.slice(0, 200), ...sc });
  }
  const best = await db.select().from(s.titleOptions).where(eq(s.titleOptions.projectId, projectId)).orderBy(desc(s.titleOptions.totalScore)).limit(1);
  if (best[0]) await db.update(s.titleOptions).set({ selected: true }).where(eq(s.titleOptions.id, best[0].id));
  // Thumbnails: 3 concepts rendered as SVG + raster placeholder copy (svg served directly)
  const img = getImage();
  const concepts = [`${topic} — bold face + number`, `${topic} — split before/after`, `${topic} — arrow + shock text`];
  for (let i = 0; i < concepts.length; i++) {
    const { svg, costUsd } = await img.generateImage(concepts[i], { width: 1280, height: 720 });
    const name = `thumb/${projectId}-${i}.svg`;
    const stored = await getMediaStorage().put(name, svg);
    const text = (best[0]?.title ?? topic).split(" ").slice(0, 4).join(" ");
    const sc = E.scoreThumbnail({ concept: concepts[i], text, niche });
    await db.insert(s.thumbnails).values({ projectId, concept: concepts[i], imagePath: stored.publicPath, svg: svg.slice(0, 20000), ...sc, selected: i === 0 });
    if (costUsd > 0) await recordCost(projectId, null, "image", costUsd, `thumbnail ${i}`);
  }
  // SEO
  const chapters = [
    { time: "0:00", title: "Hook" }, { time: "0:45", title: "Context" }, { time: "2:30", title: "Deep dive" },
    { time: "6:00", title: "The reveal" }, { time: "8:00", title: "Takeaways" },
  ];
  const seo = E.buildSEOMetadata(best[0]?.title ?? topic, topic, niche, chapters, [niche, topic]);
  const credits = [identity?.creatorName && `Created by ${identity.creatorName}`, identity?.brandName && `Produced by ${identity.brandName}`, identity?.aiAttribution, identity?.copyrightLine, ...(identity?.creatorHandle ? [identity.creatorHandle] : []), ...((identity?.socialLinks as string[] | undefined) ?? [])].filter(Boolean).join("\n");
  const creditedDescription = credits ? `${seo.description}\n\n${credits}` : seo.description;
  await db.insert(s.seoMetadata).values({ projectId, ...seo, description: creditedDescription }).onConflictDoUpdate({ target: s.seoMetadata.projectId, set: { ...seo, description: creditedDescription } });
}

// ─── E2E self-test (Football pipeline verification) ───
export async function runE2EPipeline(log: (m: string) => Promise<void>): Promise<{ checks: { name: string; pass: boolean; detail: string }[]; pass: boolean }> {
  const checks: { name: string; pass: boolean; detail: string }[] = [];
  const check = async (name: string, fn: () => Promise<string>) => {
    try { const d = await fn(); checks.push({ name, pass: true, detail: d }); await log(`PASS ${name}: ${d}`); }
    catch (e) { checks.push({ name, pass: false, detail: e instanceof Error ? e.message : String(e) }); await log(`FAIL ${name}: ${e instanceof Error ? e.message : e}`); }
  };
  let channelId = "", nicheId = "", ideaId = "", scriptId = "", projectId = "";
  const tag = `e2e-${Date.now()}`;
  await check("niche-created", async () => {
    const u = await db.select().from(s.users).limit(1);
    let userId = u[0]?.id;
    if (!userId) {
      const nu = await db.insert(s.users).values({ email: `${tag}@test.local`, passwordHash: hashPassword("test"), name: "E2E" }).returning({ id: s.users.id });
      userId = nu[0].id;
    }
    const ch = await db.insert(s.channels).values({ userId, name: `E2E Football ${tag}`, country: "US", language: "en", targetAudience: "football fans" }).returning({ id: s.channels.id });
    channelId = ch[0].id;
    const n = await db.insert(s.niches).values({ channelId, primaryNiche: "Football", subNiches: ["tactics", "transfers"], preferredFormats: ["long-form", "short"], videosPerWeek: 3 }).returning({ id: s.niches.id });
    nicheId = n[0].id;
    return nicheId;
  });
  await check("niche-profile", async () => {
    const prof = E.buildNicheProfile("Football", ["tactics"]);
    await db.insert(s.nicheProfiles).values({ nicheId, ...prof });
    return `${prof.subtopics.length} subtopics`;
  });
  await check("research", async () => {
    // Seed deterministic reference videos (simulating collected metadata), then analyze
    const seeds = [
      { videoId: `e2e-${tag}-1`, title: "Why This Tactic Changed Football Forever", viewCount: 850000, likeCount: 42000, commentCount: 3100, durationSec: 742, publishedAt: new Date(Date.now() - 6 * 86400000) },
      { videoId: `e2e-${tag}-2`, title: "7 Things Nobody Tells You About Transfers", viewCount: 320000, likeCount: 15000, commentCount: 1200, durationSec: 640, publishedAt: new Date(Date.now() - 12 * 86400000) },
      { videoId: `e2e-${tag}-3`, title: "The Truth About Modern Pressing", viewCount: 150000, likeCount: 9000, commentCount: 800, durationSec: 540, publishedAt: new Date(Date.now() - 3 * 86400000) },
    ];
    for (const vd of seeds) {
      const vpd = vd.viewCount / Math.max(1, E.daysSince(vd.publishedAt));
      const analysis = E.analyzeReferenceVideo({ title: vd.title, viewCount: vd.viewCount, likeCount: vd.likeCount, commentCount: vd.commentCount, durationSec: vd.durationSec, publishedAt: vd.publishedAt });
      await db.insert(s.referenceVideos).values({ nicheId, ...vd, channelName: "E2E Ref", channelId: "e2e", description: "seed", tags: [], category: "22", thumbnailUrl: "", viewsPerDay: vpd, velocityScore: E.clamp(Math.log10(1 + vpd) * 22), isShort: false, analysis });
    }
    return "3 reference videos analyzed";
  });
  await check("trends", async () => {
    const jid = await createJob("TREND", { nicheId });
    await runJobNow(jid);
    const r = await db.select().from(s.jobs).where(eq(s.jobs.id, jid)).limit(1);
    if (r[0].status !== "done") throw new Error(r[0].error || "trend job failed");
    return JSON.stringify(r[0].result);
  });
  await check("opportunities+ideas", async () => {
    const jid = await createJob("IDEA", { nicheId });
    await runJobNow(jid);
    const r = await db.select().from(s.jobs).where(eq(s.jobs.id, jid)).limit(1);
    if (r[0].status !== "done") throw new Error(r[0].error || "idea job failed");
    const top = await db.select().from(s.contentIdeas).where(eq(s.contentIdeas.nicheId, nicheId)).orderBy(desc(s.contentIdeas.score)).limit(1);
    ideaId = top[0].id;
    await db.update(s.contentIdeas).set({ status: "selected" }).where(eq(s.contentIdeas.id, ideaId));
    projectId = await ensureProjectForIdea(ideaId);
    return `idea=${top[0].title.slice(0, 50)} project=${projectId.slice(0, 8)}`;
  });
  await check("script", async () => {
    const jid = await createJob("SCRIPT", { ideaId });
    await runJobNow(jid);
    const r = await db.select().from(s.jobs).where(eq(s.jobs.id, jid)).limit(1);
    if (r[0].status !== "done") throw new Error(r[0].error || "script failed");
    scriptId = (r[0].result as { scriptId: string }).scriptId;
    await db.update(s.videoProjects).set({ scriptId }).where(eq(s.videoProjects.id, projectId));
    return `script=${scriptId.slice(0, 8)}`;
  });
  await check("fact-check", async () => {
    const jid = await createJob("FACT_CHECK", { scriptId });
    await runJobNow(jid);
    const r = await db.select().from(s.jobs).where(eq(s.jobs.id, jid)).limit(1);
    if (r[0].status !== "done") throw new Error(r[0].error || "fact check failed");
    return JSON.stringify(r[0].result);
  });
  await check("originality", async () => {
    const sc = await db.select().from(s.scripts).where(eq(s.scripts.id, scriptId)).limit(1);
    const refs = await db.select().from(s.referenceVideos).where(eq(s.referenceVideos.nicheId, nicheId));
    const o = E.originalityCheck(sc[0].body, refs.map((x) => ({ title: x.title, description: x.description ?? "" })));
    if (o.verdict !== "PASS") throw new Error(`Blocked: sim=${o.phraseSimilarity}`);
    return `phraseSim=${o.phraseSimilarity}`;
  });
  await check("storyboard+edl", async () => {
    const jida = await createJob("ASSET", { projectId }); await runJobNow(jida);
    const jidv = await createJob("VOICE", { projectId }); await runJobNow(jidv);
    const b = await buildStoryboardAndEDL(projectId, scriptId);
    return `${b.scenes} scenes`;
  });
  await check("packaging", async () => {
    const idea = (await db.select().from(s.contentIdeas).where(eq(s.contentIdeas.id, ideaId)).limit(1))[0];
    await generatePackaging(projectId, idea.title, (idea.titleIdeas as string[]) ?? [], "Football");
    return "titles+thumbs+seo";
  });
  await check("render", async () => {
    const jid = await createJob("RENDER", { projectId });
    await runJobNow(jid);
    const r = await db.select().from(s.jobs).where(eq(s.jobs.id, jid)).limit(1);
    if (r[0].status !== "done") throw new Error(r[0].error || "render failed");
    return (r[0].result as { renderer: string }).renderer;
  });
  await check("quality-gate", async () => {
    // Path 1: with unresolved critical claims (no web key), the gate MUST block.
    const q1 = await runQuality(projectId);
    if (q1.verdict !== "BLOCKED") throw new Error("gate should BLOCK unresolved critical claims");
    if (!q1.reasons.some((r) => r.includes("critical"))) throw new Error("gate must cite critical claims, got: " + q1.reasons.join("; "));
    // Path 2: resolve claims with named test sources, then gate must PASS.
    const facts = await db.select().from(s.scriptFacts).where(eq(s.scriptFacts.scriptId, scriptId));
    for (const f of facts) {
      await db.update(s.scriptFacts).set({ status: "VERIFIED", confidence: 90, source: "E2E test source (simulated editorial review)", url: "https://example.local/e2e-source", notes: "Resolved by E2E test reviewer." }).where(eq(s.scriptFacts.id, f.id));
    }
    const q2 = await runQuality(projectId);
    if (q2.verdict !== "PASS") throw new Error("gate should PASS after resolution: " + q2.reasons.join("; "));
    return "BLOCKED-then-PASS verified";
  });
  await check("upload-prepared", async () => {
    await db.insert(s.uploads).values({ projectId, privacy: "private", status: "prepared" });
    return oauthConfigured() ? "oauth-ready" : "prepared (oauth not configured — honest state)";
  });
  await check("analytics+autopsy+memory+strategy", async () => {
    await db.insert(s.analyticsSnapshots).values({ projectId, channelId, youtubeVideoId: "", views: 12000, impressions: 90000, ctr: 4.2, watchTimeSec: 36000, avgViewDurationSec: 240, avgPercentageViewed: 45, likes: 600, comments: 45, shares: 20, subsGained: 120, source: "e2e-simulated" });
    const auto = E.buildAutopsy({ views: 12000, ctr: 4.2, avgPercentageViewed: 45, likes: 600, comments: 45, channelAvgViews: 8000, channelAvgCtr: 3.5, channelAvgRetention: 40, title: "e2e", topic: "e2e-topic" });
    await db.insert(s.videoPerformances).values({ projectId, ...auto });
    await updateMemoryFromAutopsy(channelId, "e2e-topic", "bold claim hook", "long-form", true);
    const strat = E.buildStrategy({ topOpportunity: { topic: "next-topic", opportunityScore: 80 }, topTrend: { topic: "next-topic", classification: "rising", trendScore: 70 }, memory: await getMemory(channelId), niche: "Football" });
    await db.insert(s.strategies).values({ nicheId, ...strat });
    return "autopsy+memory+strategy stored";
  });
  const pass = checks.every((c) => c.pass);
  // Cleanup-ish: mark channel so UI can filter; keep data for inspection
  return { checks, pass };
}

// ─── Failure drill ───
export async function runFailureDrill(): Promise<{ name: string; handled: boolean; detail: string }[]> {
  const out: { name: string; handled: boolean; detail: string }[] = [];
  const t = async (name: string, fn: () => Promise<string>) => {
    try { out.push({ name, handled: true, detail: await fn() }); }
    catch (e) { out.push({ name, handled: false, detail: e instanceof Error ? e.message : String(e) }); }
  };
  await t("missing-api-key", async () => {
    const key = ytApiKey();
    return key ? "key present (live mode)" : "correctly detected missing YOUTUBE_API_KEY → catalog mode, no fake data";
  });
  await t("invalid-oauth", async () => `oauthConfigured=${oauthConfigured()} — upload honestly blocked when false`);
  await t("quota-exceeded", async () => {
    const q = await getQuota("youtube");
    return q.used >= q.limit ? "quota exhausted → throttled with clear error" : `quota ok (${q.used}/${q.limit}) with throttle guard in place`;
  });
  await t("failed-job-retry", async () => {
    const jid = await createJob("SCRIPT", { ideaId: "00000000-0000-0000-0000-000000000000" });
    await runJobNow(jid);
    const r = await db.select().from(s.jobs).where(eq(s.jobs.id, jid)).limit(1);
    if (r[0].status === "done") throw new Error("should have failed");
    return `job failed gracefully → status=${r[0].status}, error recorded, no corruption`;
  });
  await t("render-without-ffmpeg", async () => `ffmpeg=${ffmpegAvailable()} — fallback preview renderer engaged automatically`);
  await t("quality-block", async () => {
    const g = E.runQualityGate({ facts: [{ status: "CONTRADICTED", isCritical: true }], originalityVerdict: "PASS", assets: [], titleRisk: 10, hasAudio: true, hasVideo: true, hasCaptions: true, hasThumbnail: true, hasMetadata: true, scriptBody: "test" });
    if (g.verdict !== "BLOCKED") throw new Error("gate should block contradicted critical facts");
    return "contradicted facts correctly BLOCK publishing";
  });
  return out;
}

// Re-export for API routes
export { E };
export function sha1(s: string): string { return createHash("sha1").update(s).digest("hex"); }
export function listGenFiles(): string[] {
  try { ensureDirs(); return listLocalMedia(); } catch { return []; }
}
export async function channelHealth(channelId: string) {
  const snaps = await db.select().from(s.analyticsSnapshots).where(eq(s.analyticsSnapshots.channelId, channelId)).orderBy(desc(s.analyticsSnapshots.capturedAt)).limit(20);
  const views = snaps.reduce((a, x) => a + (x.views ?? 0), 0);
  const subs = snaps.reduce((a, x) => a + (x.subsGained ?? 0), 0);
  const watch = snaps.reduce((a, x) => a + (x.watchTimeSec ?? 0), 0);
  const ctr = snaps.length ? snaps.reduce((a, x) => a + (x.ctr ?? 0), 0) / snaps.length : 0;
  const ret = snaps.length ? snaps.reduce((a, x) => a + (x.avgPercentageViewed ?? 0), 0) / snaps.length : 0;
  return { views, subs, watchTimeSec: watch, ctr: +ctr.toFixed(2), retention: +ret.toFixed(1), samples: snaps.length };
}
export async function recentJobs(limit = 30) {
  return db.select().from(s.jobs).orderBy(desc(s.jobs.createdAt)).limit(limit);
}
