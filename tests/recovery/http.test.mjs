import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createServer } from "node:net";
const root = fileURLToPath(new URL("../../", import.meta.url));
async function freePort() {
  const s = createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}
test("loopback API, real process exit/restart, ephemeral key, same snapshot and zero inference", async () => {
  const dir = mkdtempSync(join(root, ".test-http-")),
    port = await freePort(),
    base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ["apps/runtime/server.mjs"], {
      cwd: root,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        FLOWCREDIT_PORT: String(port),
        FLOWCREDIT_RUNTIME_DIR: dir,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error("server timeout")), 10000);
      child.stdout.on("data", (b) => {
        if (b.toString().includes("FlowCredit ready")) {
          clearTimeout(timer);
          resolve();
        }
      });
      child.stderr.on("data", (b) => {
        clearTimeout(timer);
        reject(Error(b.toString()));
      });
      child.on("exit", () => {
        clearTimeout(timer);
        reject(Error("server exited"));
      });
    });
  }
  async function stop() {
    const p = child;
    await new Promise((resolve) => {
      p.once("exit", resolve);
      p.kill("SIGTERM");
    });
    assert.throws(() => process.kill(p.pid, 0), { code: "ESRCH" });
    child = null;
  }
  const get = () => fetch(base + "/api/state").then((r) => r.json());
  const post = (path, data = {}, origin = base) =>
    fetch(base + "/api/" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify(data),
    });
  try {
    await start();
    assert.equal((await fetch(base)).status, 200);
    assert.equal((await get()).runtime.powerState, "DORMANT");
    assert.equal(
      (
        await post(
          "activate",
          { key: "never-send-this-fixture" },
          "https://example.invalid",
        )
      ).status,
      403,
    );
    await post("create-e");
    await post("test-v2");
    const before = await get();
    await post("activate", { key: "ephemeral-offline-sentinel" });
    assert.equal((await get()).runtime.modelOnline, true);
    assert.equal(
      JSON.stringify(await get()).includes("ephemeral-offline-sentinel"),
      false,
    );
    await post("stand-down");
    assert.equal((await get()).runtime.liveSessions, 0);
    await stop();
    await start();
    const after = await get();
    assert.equal(after.runtime.modelOnline, false);
    assert.deepEqual(after.snapshots, before.snapshots);
    assert.equal(after.tasks[0].context.baseRevisionId, "CLM-001:v1");
    assert.equal(after.knowledge.latestVersion, 2);
    assert.equal(after.budget.length, 0);
    assert.equal((await post("resume", { taskId: "E" })).status, 409);
    await stop();
  } finally {
    if (child) await stop();
    rmSync(dir, { recursive: true, force: true });
  }
});
