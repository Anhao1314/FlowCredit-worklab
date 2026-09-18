import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "node:http";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { ClaudeCodeExecutor } from "../../packages/agent-work/claude-code.mjs";
import { hash } from "../../packages/task-context/contracts.mjs";
import { resolve } from "node:path";
test("real bundled Claude process sends zero tools, returns structured review, exits and writes no credential", async () => {
  const root = mkdtempSync(join(process.cwd(), ".test-real-sdk-"));
  let requests = 0;
  const toolLists = [];
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const b of req) raw += b;
    let body = {};
    try {
      body = JSON.parse(raw);
    } catch {}
    if (!req.url.includes("messages")) {
      res.writeHead(404);
      res.end("{}");
      return;
    }
    requests++;
    toolLists.push((body.tools ?? []).map((t) => t.name));
    const text = JSON.stringify({
      reviewedArtifactId: "r1",
      decision: "PASS",
      issues: [],
      requestedCorrections: [],
      reviewLimitations: ["local wire fixture"],
    });
    res.writeHead(200, { "content-type": "text/event-stream" });
    const emit = (type, data) =>
      res.write(
        `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`,
      );
    emit("message_start", {
      message: {
        id: "msg_local",
        type: "message",
        role: "assistant",
        content: [],
        model: body.model,
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 20, output_tokens: 0 },
      },
    });
    emit("content_block_start", {
      index: 0,
      content_block: { type: "text", text: "" },
    });
    emit("content_block_delta", {
      index: 0,
      delta: { type: "text_delta", text },
    });
    emit("content_block_stop", { index: 0 });
    emit("message_delta", {
      delta: { stop_reason: "end_turn", stop_sequence: null },
      usage: { output_tokens: 30 },
    });
    emit("message_stop", {});
    res.end();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const events = [];
  const ex = new ClaudeCodeExecutor(root, {
    credentials: {
      resolve: async () => ({ value: "offline-sdk-sentinel" }),
      contains: (t) => t.includes("offline-sdk-sentinel"),
    },
    event: (kind, detail) => events.push({ kind, detail }),
    queryFactory: (args) =>
      query({
        ...args,
        options: {
          ...args.options,
          env: {
            ...args.options.env,
            ANTHROPIC_BASE_URL: `http://127.0.0.1:${server.address().port}`,
          },
        },
      }),
  });
  try {
    const context = { snapshotId: "S1" };
    const r = await ex.execute({
      task: { id: "E", context, digest: hash(context) },
      role: "Reviewer",
      input: { snapshotId: "S1", researchArtifact: { id: "r1" } },
      instructions: "Return a JSON review of r1. No tools.",
      onStarted() {},
    });
    assert.equal(JSON.parse(r.raw).decision, "PASS");
    assert.equal(requests, 1);
    assert.deepEqual(toolLists, [[]]);
    assert.equal(r.receipt.released, true);
    assert.equal(events.at(-1).detail.processCount, 1);
    assert.equal(ex.active, null);
    const scan = (dir) => {
      for (const item of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, item.name);
        if (item.isDirectory()) scan(path);
        else if (item.isFile())
          assert(
            !readFileSync(path).includes(Buffer.from("offline-sdk-sentinel")),
            "credential persisted",
          );
      }
    };
    scan(root);
  } finally {
    server.close();
    rmSync(root, { recursive: true, force: true });
  }
});
