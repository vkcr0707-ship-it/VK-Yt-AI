import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";

export type StorageMode = "durable" | "local-temporary" | "unavailable";
export type MediaKind = "image" | "audio" | "video" | "document";

export type StoredMedia = {
  key: string;
  provider: "local" | "durable";
  mode: StorageMode;
  publicPath: string;
  mimeType: string;
  size: number;
  checksum: string;
};

export interface MediaStorageAdapter {
  readonly provider: string;
  readonly durable: boolean;
  put(key: string, data: string | Buffer): Promise<StoredMedia>;
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

class LocalStorageAdapter implements MediaStorageAdapter {
  readonly provider = "local-filesystem";
  readonly durable = false;
  async put(key: string, data: string | Buffer): Promise<StoredMedia> { return putLocalMedia(key, data); }
  async read(key: string): Promise<Buffer> { return readLocalMedia(key); }
  async delete(key: string): Promise<void> { deleteLocalMedia(key); }
}

class UnavailableDurableAdapter implements MediaStorageAdapter {
  readonly provider = "configured-adapter-not-installed";
  readonly durable = false;
  async put(): Promise<StoredMedia> { throw new Error("Durable media storage adapter is not installed"); }
  async read(): Promise<Buffer> { throw new Error("Durable media storage adapter is not installed"); }
  async delete(): Promise<void> { throw new Error("Durable media storage adapter is not installed"); }
}

const localRoot = resolve(process.cwd(), "public", "gen");
const durableEndpoint = process.env.MEDIA_STORAGE_ENDPOINT || "";
const durableToken = process.env.MEDIA_STORAGE_TOKEN || "";

export function getMediaStorage(): MediaStorageAdapter {
  return durableEndpoint && durableToken ? new UnavailableDurableAdapter() : new LocalStorageAdapter();
}

export function storageStatus(): { status: "ready" | "not_configured" | "error"; mode: StorageMode; provider: string; durable: boolean; detail: string } {
  if (durableEndpoint && durableToken) return { status: "error", mode: "unavailable", provider: "configured-adapter-not-installed", durable: false, detail: "A durable storage endpoint is configured, but no compatible adapter is installed." };
  if (process.env.NODE_ENV === "production") return { status: "not_configured", mode: "local-temporary", provider: "local-filesystem", durable: false, detail: "Generated media uses ephemeral local filesystem storage; durable storage is not configured." };
  return { status: "ready", mode: "local-temporary", provider: "local-filesystem", durable: false, detail: "Development local filesystem storage." };
}

export function safeMediaKey(key: string): string {
  const normalized = key.replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("..") || normalized.includes("\0")) throw new Error("Invalid media key");
  const resolved = resolve(localRoot, normalized);
  const rel = relative(localRoot, resolved);
  if (!rel || rel.startsWith("..") || resolve(localRoot, rel) !== resolved) throw new Error("Invalid media key");
  return rel.replace(/\\/g, "/");
}

export function mediaMimeType(key: string): string {
  const ext = key.toLowerCase().split(".").pop();
  return ({ svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", wav: "audio/wav", mp3: "audio/mpeg", ogg: "audio/ogg", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", html: "text/html" } as Record<string, string>)[ext ?? ""] ?? "application/octet-stream";
}

export function putLocalMedia(key: string, data: string | Buffer): StoredMedia {
  const safeKey = safeMediaKey(key);
  const absolute = join(localRoot, safeKey);
  mkdirSync(resolve(absolute, ".."), { recursive: true });
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  writeFileSync(absolute, buffer, { flag: "w" });
  return { key: safeKey, provider: "local", mode: storageStatus().mode, publicPath: `/gen/${safeKey}`, mimeType: mediaMimeType(safeKey), size: buffer.length, checksum: createHash("sha256").update(buffer).digest("hex") };
}

export function readLocalMedia(key: string): Buffer {
  return readFileSync(join(localRoot, safeMediaKey(key)));
}

export function localMediaPath(publicPath: string): string {
  const key = publicPath.replace(/^\/gen\//, "");
  return join(localRoot, safeMediaKey(key));
}

export function deleteLocalMedia(key: string): void {
  const absolute = join(localRoot, safeMediaKey(key));
  if (existsSync(absolute)) unlinkSync(absolute);
}

export function listLocalMedia(): string[] {
  const out: string[] = [];
  for (const sub of ["audio", "img", "video", "thumb"]) {
    const dir = join(localRoot, sub);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      const key = `${sub}/${basename(file)}`;
      try { if (statSync(join(localRoot, key)).isFile()) out.push(`/gen/${key}`); } catch { /* file disappeared */ }
    }
  }
  return out.slice(-100);
}
