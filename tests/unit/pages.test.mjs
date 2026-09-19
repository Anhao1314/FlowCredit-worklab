import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
test("Pages artifact is credential-free, network-disabled and supports cancelable synthetic research", async () => {
  execFileSync(process.execPath, ["scripts/build-pages.mjs"], { cwd: root });
  const html = readFileSync(
    new URL("../../.pages/index.html", import.meta.url),
    "utf8",
  );
  assert(html.includes("公开演示 · 合成资料 · 无真实 AI 调用"));
  assert(html.includes('data-src="swarm-space/?embedded=1"'));
  assert(html.includes('id="sidebar-toggle"'));
  assert(html.includes('href="#research"'));
  const office = readFileSync(new URL("../../.pages/swarm-space/index.html", import.meta.url), "utf8");
  assert(office.includes("MOCK STATE"));
  assert(office.includes('href="../#overview"'));
  assert(readFileSync(new URL("../../.pages/swarm-space/vendor/munder-difflin/portrait-art.js", import.meta.url), "utf8").includes("sceneFrameBufs"));
  assert(!readdirSync(new URL("../../.pages/swarm-space/", import.meta.url)).includes("serve.mjs"));
  assert(html.includes("connect-src 'none'"));
  assert(!html.includes('type="password"'));
  assert(!html.includes('type="text"'));
  assert(!html.includes("真实运行时"));
  const names = readdirSync(new URL("../../.pages", import.meta.url));
  assert(!names.some((n) => /sqlite|\.env|server|runtime-data/.test(n)));
  const app = readFileSync(
    new URL("../../.pages/app.js", import.meta.url),
    "utf8",
  );
  assert(!/\bfetch\(/.test(app));
  assert(!app.includes('act("activate", { key })'));
  const { createDemo } = await import("../../.pages/demo-runtime.js");
  const demo = createDemo({ wait: async () => {} });
  const get = () => demo.request("/api/state");
  const post = (name, body = {}) =>
    demo.request("/api/" + name, { body: JSON.stringify(body) });
  await assert.rejects(
    post("activate", { key: "not-a-real-key" }),
    /DOES_NOT_ACCEPT/,
  );
  await post("activate");
  await post("create-e");
  const before = await demo.request("/api/memory");
  await post("resume", { taskId: "E" });
  let s = await get();
  assert.equal(s.tasks[0].state, "MEMO_READY");
  assert.equal(s.budget.length, 3);
  assert.deepEqual(await demo.request("/api/memory"), before);
  assert.equal(before.records[3].status, "candidate-not-admitted");
  await post("resume", { taskId: "E" });
  assert.equal((await get()).budget.length, 3);
  await post("test-v2");
  await post("create-f");
  await post("resume", { taskId: "F" });
  s = await get();
  assert.equal(s.tasks[0].context.claim.version, 1);
  assert.equal(s.tasks[1].context.claim.version, 2);
  assert(s.artifacts.every((a) => a.content.simulated));
  let release;
  const paused = createDemo({
    wait: () =>
      new Promise((r) => {
        release = r;
      }),
  });
  await paused.request("/api/activate", { body: "{}" });
  await paused.request("/api/create-e", { body: "{}" });
  const execution = paused.request("/api/resume", { body: '{"taskId":"E"}' });
  const stopped = assert.rejects(execution, /CANCELED/);
  await paused.request("/api/stand-down", { body: "{}" });
  release();
  await stopped;
  const final = await paused.request("/api/state");
  assert.equal(final.tasks[0].state, "NEEDS_ATTENTION");
  assert.equal(final.artifacts.length, 0);
  assert.equal(final.runtime.modelOnline, false);
});
