import assert from "node:assert/strict";
import { test } from "node:test";
import { buildStoryboard, timeScenes } from "../src/lib/engines";

test("visual planning changes with the actual topic", () => {
  const offside = buildStoryboard("\n\n[DEVELOPMENT]\nThe defensive line moves up and the ball travels beyond the last defender. [VISUAL: tactical board]", 30, "How the football offside rule works");
  const goals = buildStoryboard("\n\n[DEVELOPMENT]\nThe striker shoots from distance and the goalkeeper reacts to the ball's trajectory. [VISUAL: goal montage]", 30, "Top 10 football goals");

  assert.notEqual(offside[0].visualPlan.archetype, goals[0].visualPlan.archetype);
  assert.match(offside[0].visualPlan.composition, /field|map|position|path/i);
  assert.ok(offside[0].visualPlan.motion.length > 20);
  assert.ok(offside[0].visualPlan.assets.length > 0);
});

test("timed scenes preserve renderer-ready visual plans", () => {
  const scenes = buildStoryboard("\n\n[HOOK]\nThis is the opening claim for the video.", 8, "A new topic");
  const timed = timeScenes(scenes, 8);

  assert.equal(timed.length, scenes.length);
  assert.equal(timed[0].visualPlan.subject, "A new topic");
  assert.equal(timed[0].startSec, 0);
  assert.equal(timed[timed.length - 1].endSec, 8);
});

test("OAuth state is signed, user-bound, and rejects tampering", async () => {
  process.env.SESSION_SECRET = "test-session-secret";
  const { oauthState, verifyOAuthState, encryptToken, decryptToken } = await import("../src/lib/system");
  const state = oauthState("channel-1", "user-1");
  assert.deepEqual(verifyOAuthState(state), { channelId: "channel-1", userId: "user-1" });
  assert.equal(verifyOAuthState(`${state}tampered`), null);
  const encrypted = encryptToken("refresh-token-value");
  assert.notEqual(encrypted, "refresh-token-value");
  assert.equal(decryptToken(encrypted), "refresh-token-value");
  assert.equal(decryptToken("legacy-token-value"), "legacy-token-value");
});

test("storage keys reject traversal and rate limits return a bounded denial", async () => {
  const { safeMediaKey, storageStatus } = await import("../src/lib/storage");
  const { rateLimit } = await import("../src/lib/rate-limit");
  assert.equal(safeMediaKey("img/example.svg"), "img/example.svg");
  assert.throws(() => safeMediaKey("../secret.txt"));
  assert.throws(() => safeMediaKey("img/../../secret.txt"));
  assert.equal(storageStatus().durable, false);
  assert.equal(rateLimit("test-key", "test", { limit: 1, windowMs: 60_000 }).allowed, true);
  assert.equal(rateLimit("test-key", "test", { limit: 1, windowMs: 60_000 }).allowed, false);
});

test("database diagnostics redact connection URLs and expose safe PostgreSQL fields", async () => {
  const { formatDatabaseError } = await import("../src/db");
  const diagnostics = formatDatabaseError({ cause: { code: "28P01", message: "password authentication failed", detail: "role rejected", hint: "check credentials", connectionString: "postgresql://user:secret@example.invalid:5432/app" } });
  assert.match(diagnostics, /code=28P01/);
  assert.match(diagnostics, /detail=role rejected/);
  assert.match(diagnostics, /hint=check credentials/);
  assert.doesNotMatch(diagnostics, /secret|postgresql:\/\//i);
});

test("private S3 adapter supports mocked put, get, head, delete, and missing objects", async () => {
  const { S3StorageAdapter, safeMediaKey, storageStatus } = await import("../src/lib/storage");
  const objects = new Map<string, { body: Buffer; metadata: Record<string, string>; contentType: string }>();
  const client = { send: async (command: { input: Record<string, string>; constructor: { name: string } }) => {
    const key = `${command.input.Bucket}/${command.input.Key}`;
    if (command.constructor.name === "PutObjectCommand") { objects.set(key, { body: Buffer.from(command.input.Body as string), metadata: command.input.Metadata as unknown as Record<string, string>, contentType: command.input.ContentType }); return {}; }
    if (command.constructor.name === "GetObjectCommand") { const value = objects.get(key); if (!value) throw new Error("NoSuchKey"); return { Body: { transformToByteArray: async () => value.body } }; }
    if (command.constructor.name === "HeadObjectCommand") { const value = objects.get(key); if (!value) throw new Error("NotFound"); return { ContentLength: value.body.length, ContentType: value.contentType, Metadata: value.metadata }; }
    if (command.constructor.name === "DeleteObjectCommand") { objects.delete(key); return {}; }
    throw new Error("Unexpected command");
  } } as never;
  const adapter = new S3StorageAdapter({ endpoint: "https://s3.us-west-002.backblazeb2.com", region: "us-west-002", bucket: "private-test", accessKeyId: "test", secretAccessKey: "test" }, client);
  const stored = await adapter.put("project-1/test.txt", Buffer.from("hello"));
  assert.equal(stored.provider, "s3");
  assert.equal((await adapter.read("project-1/test.txt")).toString(), "hello");
  assert.equal((await adapter.head("project-1/test.txt")).size, 5);
  await adapter.delete("project-1/test.txt");
  await assert.rejects(() => adapter.read("project-1/test.txt"));
  assert.throws(() => safeMediaKey("project-1/../other.txt"));
  assert.equal(storageStatus().durable, false);
});

test("S3 provider reports unavailable without credentials and never falls back silently", async () => {
  const previous = process.env.MEDIA_STORAGE_PROVIDER;
  process.env.MEDIA_STORAGE_PROVIDER = "s3";
  const { getMediaStorage, storageStatus } = await import("../src/lib/storage");
  assert.equal(storageStatus().status, "not_configured");
  await assert.rejects(() => getMediaStorage().put("test.txt", Buffer.from("x")), /not configured/);
  if (previous === undefined) delete process.env.MEDIA_STORAGE_PROVIDER; else process.env.MEDIA_STORAGE_PROVIDER = previous;
});
