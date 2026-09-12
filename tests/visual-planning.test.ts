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