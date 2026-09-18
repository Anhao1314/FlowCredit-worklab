import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
test("HTTP provider selection, independent comparison and human disposition preserve research authority", async () => {
  const root = mkdtempSync(join(process.cwd(), ".test-workspace-actions-"));
  const socket = createServer();
  await new Promise((r) => socket.listen(0, "127.0.0.1", r));
  const port = socket.address().port;
  await new Promise((r) => socket.close(r));
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(
    process.execPath,
    ["--import", "./tests/support/model-stub.mjs", "apps/runtime/server.mjs"],
    {
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        FLOWCREDIT_RUNTIME_DIR: root,
        FLOWCREDIT_PORT: String(port),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const post = async (name, body = {}, code = 200) => {
    const r = await fetch(base + "/api/" + name, {
      method: "POST",
      headers: { Origin: base, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const s = await r.json();
    assert.equal(r.status, code, JSON.stringify(s));
    return s;
  };
  try {
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(Error("start timeout")), 10000);
      child.stdout.on("data", (b) => {
        if (b.toString().includes("FlowCredit ready")) {
          clearTimeout(t);
          resolve();
        }
      });
      child.once("exit", () => {
        clearTimeout(t);
        reject(Error("server exited"));
      });
    });
    const memory = await (await fetch(base + "/api/memory")).json();
    await post("create-e");
    await post("select-reviewer", { taskId: "E", provider: "claude-code" });
    let s = await post("select-reviewer", {
      taskId: "E",
      provider: "native-harness",
    });
    assert.equal(s.environment[0].reviewer, "native-harness");
    await post("select-reviewer", { taskId: "E", provider: "invalid" }, 409);
    await post("activate", { key: "offline-actions-sentinel" });
    s = await post("resume", { taskId: "E" });
    const cp = s.tasks[0].checkpoint;
    await post(
      "select-reviewer",
      { taskId: "E", provider: "claude-code" },
      409,
    );
    s = await post("compare-reviewer", {
      taskId: "E",
      provider: "native-harness",
    });
    assert.deepEqual(s.tasks[0].checkpoint, cp);
    assert.equal(s.budget.length, 4);
    s = await post("human-review", {
      taskId: "E",
      decision: "NEEDS_WORK",
      note: "Automated synthetic UI workflow test; not a research decision.",
    });
    assert.equal(s.humanReviews.length, 1);
    assert.equal(
      s.artifacts.find((a) => a.type === "MEMO").content.authority
        .humanApproved,
      false,
    );
    assert.deepEqual(await (await fetch(base + "/api/memory")).json(), memory);
    await post("stand-down");
    s = await post("resume", { taskId: "E" });
    assert.equal(s.budget.length, 4);
    assert.equal(s.runtime.modelOnline, false);
    await post(
      "compare-reviewer",
      { taskId: "E", provider: "native-harness" },
      409,
    );
  } finally {
    await new Promise((r) => {
      child.once("exit", r);
      child.kill("SIGTERM");
    });
    rmSync(root, { recursive: true, force: true });
  }
});
