import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export type StorageMode = "durable" | "local-temporary" | "unavailable";
export type MediaKind = "image" | "audio" | "video" | "document";

export type StoredMedia = {
  key: string;
  provider: "local" | "s3";
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
  head(key: string): Promise<{ key: string; size: number; mimeType: string; checksum: string }>;
}

class LocalStorageAdapter implements MediaStorageAdapter {
  readonly provider = "local-filesystem";
  readonly durable = false;
  async put(key: string, data: string | Buffer): Promise<StoredMedia> { return putLocalMedia(key, data); }
  async read(key: string): Promise<Buffer> { return readLocalMedia(key); }
  async delete(key: string): Promise<void> { deleteLocalMedia(key); }
  async head(key: string) { const safeKey = safeMediaKey(key); const data = readLocalMedia(safeKey); return { key: safeKey, size: data.length, mimeType: mediaMimeType(safeKey), checksum: createHash("sha256").update(data).digest("hex") }; }
}

type S3Config = { endpoint: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string };

function s3Config(): S3Config | null {
  const endpoint = process.env.S3_ENDPOINT || "";
  const region = process.env.S3_REGION || "";
  const bucket = process.env.S3_BUCKET || "";
  const accessKeyId = process.env.S3_ACCESS_KEY_ID || "";
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || "";
  return endpoint && region && bucket && accessKeyId && secretAccessKey ? { endpoint, region, bucket, accessKeyId, secretAccessKey } : null;
}

export function validateS3Endpoint(endpoint: string, region: string): boolean {
  try { return new URL(endpoint).protocol === "https:" && new URL(endpoint).hostname === `s3.${region}.backblazeb2.com`; } catch { return false; }
}

export class S3StorageAdapter implements MediaStorageAdapter {
  readonly provider = "s3-compatible/backblaze";
  readonly durable = true;
  private readonly config: S3Config;
  private readonly client: S3Client;
  constructor(config: S3Config, client?: S3Client) {
    if (!validateS3Endpoint(config.endpoint, config.region)) throw new Error("S3_ENDPOINT must be https://s3.<region>.backblazeb2.com and match S3_REGION");
    this.config = config;
    this.client = client ?? new S3Client({ endpoint: config.endpoint, region: config.region, forcePathStyle: true, credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } });
  }
  async put(key: string, data: string | Buffer): Promise<StoredMedia> {
    const safeKey = safeMediaKey(key);
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const checksum = createHash("sha256").update(buffer).digest("hex");
    await this.client.send(new PutObjectCommand({ Bucket: this.config.bucket, Key: safeKey, Body: buffer, ContentType: mediaMimeType(safeKey), Metadata: { sha256: checksum } }));
    return { key: safeKey, provider: "s3", mode: "durable", publicPath: `s3://${this.config.bucket}/${safeKey}`, mimeType: mediaMimeType(safeKey), size: buffer.length, checksum };
  }
  async read(key: string): Promise<Buffer> {
    const safeKey = safeMediaKey(key);
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: safeKey }));
    if (!result.Body) throw new Error("Storage object has no body");
    return Buffer.from(await result.Body.transformToByteArray());
  }
  async delete(key: string): Promise<void> { await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: safeMediaKey(key) })); }
  async head(key: string) {
    const safeKey = safeMediaKey(key);
    const result = await this.client.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: safeKey }));
    return { key: safeKey, size: result.ContentLength ?? 0, mimeType: result.ContentType ?? mediaMimeType(safeKey), checksum: result.Metadata?.sha256 ?? result.ETag?.replaceAll('"', "") ?? "" };
  }
}

class UnavailableStorageAdapter implements MediaStorageAdapter {
  readonly provider = "s3-compatible/unavailable";
  readonly durable = false;
  async put(): Promise<StoredMedia> { throw new Error("S3 storage is not configured"); }
  async read(): Promise<Buffer> { throw new Error("S3 storage is not configured"); }
  async delete(): Promise<void> { throw new Error("S3 storage is not configured"); }
  async head(): Promise<{ key: string; size: number; mimeType: string; checksum: string }> { throw new Error("S3 storage is not configured"); }
}

const localRoot = resolve(process.cwd(), "public", "gen");
export function getMediaStorage(): MediaStorageAdapter {
  if ((process.env.MEDIA_STORAGE_PROVIDER || "local").toLowerCase() !== "s3") return new LocalStorageAdapter();
  const config = s3Config();
  return config ? new S3StorageAdapter(config) : new UnavailableStorageAdapter();
}

export function storageStatus(): { status: "ready" | "not_configured" | "error"; mode: StorageMode; provider: string; durable: boolean; detail: string } {
  if ((process.env.MEDIA_STORAGE_PROVIDER || "local").toLowerCase() === "s3") {
    const config = s3Config();
    if (!config) return { status: "not_configured", mode: "unavailable", provider: "s3-compatible/backblaze", durable: false, detail: "S3 storage selected but endpoint, region, bucket, or credentials are missing." };
    if (!validateS3Endpoint(config.endpoint, config.region)) return { status: "error", mode: "unavailable", provider: "s3-compatible/backblaze", durable: false, detail: "S3 endpoint does not match the configured region." };
    return { status: "ready", mode: "durable", provider: "s3-compatible/backblaze", durable: true, detail: `Private bucket configured: ${config.bucket}` };
  }
  if (process.env.NODE_ENV === "production") return { status: "not_configured", mode: "local-temporary", provider: "local-filesystem", durable: false, detail: "Generated media uses ephemeral local filesystem storage; durable storage is not configured." };
  return { status: "ready", mode: "local-temporary", provider: "local-filesystem", durable: false, detail: "Development local filesystem storage." };
}

export async function storageHealth(): Promise<{ ok: boolean; provider: string; bucket?: string; detail: string }> {
  const provider = getMediaStorage();
  if (!(provider instanceof S3StorageAdapter)) return { ok: true, provider: provider.provider, detail: "Local storage selected; no remote bucket check performed." };
  const config = s3Config()!;
  try {
    const client = (provider as unknown as { client: S3Client }).client;
    await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
    const listed = await client.send(new ListObjectsV2Command({ Bucket: config.bucket, MaxKeys: 1 }));
    const firstKey = listed.Contents?.[0]?.Key;
    if (firstKey) await provider.read(firstKey);
    return { ok: true, provider: provider.provider, bucket: config.bucket, detail: "Private S3-compatible bucket is reachable." };
  } catch { return { ok: false, provider: provider.provider, bucket: config.bucket, detail: "Configured private storage bucket is unavailable." }; }
}

export async function storageDevelopmentTest(): Promise<{ ok: boolean; detail: string }> {
  if (process.env.NODE_ENV === "production") return { ok: false, detail: "Development storage test is disabled in production." };
  const key = `test/storage-${Date.now()}.txt`;
  const expected = Buffer.from("vk-youtube-ai-storage-test");
  const provider = getMediaStorage();
  try {
    await provider.put(key, expected);
    const actual = await provider.read(key);
    const head = await provider.head(key);
    if (!actual.equals(expected) || head.checksum !== createHash("sha256").update(expected).digest("hex")) throw new Error("Storage round-trip checksum mismatch");
    await provider.delete(key);
    try { await provider.head(key); return { ok: false, detail: "Storage object remained after deletion." }; } catch { return { ok: true, detail: "Storage put, get, checksum, head, and delete passed." }; }
  } catch (error) { try { await provider.delete(key); } catch { /* best effort cleanup */ } return { ok: false, detail: error instanceof Error ? error.message : "Storage test failed" }; }
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

export function storageKeyFromPath(publicPath: string): string {
  if (publicPath.startsWith("s3://")) {
    const slash = publicPath.indexOf("/", 5);
    if (slash < 0) throw new Error("Invalid S3 media path");
    return safeMediaKey(publicPath.slice(slash + 1));
  }
  return safeMediaKey(publicPath.replace(/^\/gen\//, ""));
}

export async function materializeMediaPath(publicPath: string): Promise<{ path: string; cleanup: () => void }> {
  if (!publicPath.startsWith("s3://")) return { path: localMediaPath(publicPath), cleanup: () => undefined };
  const data = await getMediaStorage().read(storageKeyFromPath(publicPath));
  const key = createHash("sha256").update(publicPath).digest("hex");
  const path = join(tmpdir(), `vk-youtube-ai-${key}-${basename(storageKeyFromPath(publicPath))}`);
  writeFileSync(path, data, { flag: "w" });
  return { path, cleanup: () => { try { unlinkSync(path); } catch { /* best effort */ } } };
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
