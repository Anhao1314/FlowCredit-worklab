import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createServer } from "node:net";
import { project } from "../../apps/web/view-model.js";
const root = fileURLToPath(new URL("../../", import.meta.url));
test("complete HTTP workspace: read offline, bind, activate, research, review, memo, stand down, restore", async () => {
  const dir = mkdtempSync(join(root, ".test-workflow-"));
  const socket = createServer();
  await new Promise((r) => socket.listen(0, "127.0.0.1", r));
  const port = socket.address().port;
  await new Promise((r) => socket.close(r));
  const base = `http://127.0.0.1:${port}`;
  let child;
  const start = async () => {
    child = spawn(
      process.execPath,
      ["--import", "./tests/support/model-stub.mjs", "apps/runtime/server.mjs"],
      {
        cwd: root,
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          FLOWCREDIT_PORT: String(port),
          FLOWCREDIT_RUNTIME_DIR: dir,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error("server timeout")), 10000);
      child.stdout.on("data", (b) => {
        if (b.toString().includes("FlowCredit ready")) {
          clearTimeout(timeout);
          resolve();
        }
      });
      child.once("exit", () => {
        clearTimeout(timeout);
        reject(Error("server exited"));
      });
    });
  };
  const stop = async () => {
    if (!child) return;
    const p = child;
    await new Promise((r) => {
      p.once("exit", r);
      p.kill("SIGTERM");
    });
    child = null;
  };
  const get = (path) => fetch(base + path).then((r) => r.json());
  const post = async (name, body = {}) => {
    const r = await fetch(base + "/api/" + name, {
      method: "POST",
      headers: { Origin: base, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const x = await r.json();
    assert.equal(r.status, 200, JSON.stringify(x));
    return x;
  };
  try {
    await start();
    const initial = await get("/api/state");
    const memory = await get("/api/memory");
    assert.equal(memory.records.length, 4);
    assert.equal(memory.records[3].status, "candidate-not-admitted");
    assert.equal(memory.claim.version, 1);
    assert.deepEqual(
      await get("/api/state"),
      initial,
      "reading memory must not mutate execution state",
    );
    await post("create-e");
    let state = await get("/api/state");
    assert(!project(state).tasks[0].canResume);
    await post("activate", { key: "offline-workflow-sentinel" });
    state = await get("/api/state");
    assert(project(state).tasks[0].canResume);
    state = await post("resume", { taskId: "E" });
    assert.equal(state.tasks[0].state, "MEMO_READY");
    assert.equal(state.budget.length, 3);
    assert(!project(state).tasks[0].canResume);
    assert.equal(new Set(state.runs.map((r) => r.session)).size, 2);
    assert.deepEqual(
      state.runs.map((r) => r.role),
      ["Researcher", "Reviewer"],
    );
    const memo = state.artifacts.find((a) => a.type === "MEMO");
    assert.equal(memo.content.authority.humanApproved, false);
    assert.equal(memo.content.unresolvedIssues.length, 1);
    assert(!JSON.stringify(state).includes("offline-workflow-sentinel"));
    assert.deepEqual(
      await get("/api/memory"),
      memory,
      "agent execution never alters research records",
    );
    state = await post("resume", { taskId: "E" });
    assert.equal(state.budget.length, 3);
    assert(!project(state).canCreateF);
    await post("test-v2");
    state = await get("/api/state");
    assert(project(state).canCreateF);
    await post("create-f");
    state = await post("resume", { taskId: "F" });
    assert.equal(state.budget.length, 6);
    assert.equal(state.tasks[0].context.claim.version, 1);
    assert.equal(state.tasks[1].context.claim.version, 2);
    await post("stand-down");
    await stop();
    await start();
    const restored = await get("/api/state");
    assert.equal(restored.runtime.modelOnline, false);
    assert.deepEqual(restored.artifacts, state.artifacts);
    assert.deepEqual(restored.snapshots, state.snapshots);
    assert.equal(restored.budget.length, 6);
    assert.equal(project(restored).readyMemos.length, 2);
  } finally {
    await stop();
    rmSync(dir, { recursive: true, force: true });
  }
});
