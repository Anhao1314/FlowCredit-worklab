import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { seed, createV2 } from "../../fixtures/northstar/seed.mjs";
import {
  ResearchAdapter,
  readAuthorized,
  validateSnapshot,
} from "../../packages/research-adapter/adapter.mjs";
import { Store } from "../../packages/control-plane/store.mjs";
import { Runtime } from "../../packages/control-plane/runtime.mjs";
const root = fileURLToPath(new URL("../../", import.meta.url));
const sse = (x) =>
  new Response("data: " + JSON.stringify(x) + "\n\ndata: [DONE]\n\n", {
    headers: { "content-type": "text/event-stream" },
  });
test("actual FlowCredit services, read-only adapter, revision pinning, Harness tools and recovery", async () => {
  const dir = mkdtempSync(join(root, ".test-")),
    knowledge = join(dir, "knowledge");
  let a,
    s,
    r,
    calls = 0;
  const original = globalThis.fetch;
  try {
    const manifest = seed(knowledge);
    a = new ResearchAdapter(knowledge);
    s = new Store(join(dir, "control"));
    const s1 = a.snapshot("E", 1, ["R-01", "R-02", "R-03", "R-04"]);
    s.createBound(s1);
    assert.throws(() => s.createBound(s1), /TASK_EXISTS/);
    assert.equal(s1.records.at(-1).status, "candidate-not-admitted");
    assert.equal(s1.records.at(-1).evidenceId, null);
    assert.equal(a.denyWrite().code, "FORBIDDEN");
    assert.throws(
      () =>
        readAuthorized(s1, s.task("E"), {
          recordIds: [manifest.records["R-X"].recordId],
        }),
      /FORBIDDEN/,
    );
    assert.throws(
      () =>
        readAuthorized(s1, s.task("E"), {
          snapshotId: "S2",
          recordIds: [s1.records[0].id],
        }),
      /FORBIDDEN/,
    );
    createV2(knowledge);
    assert.equal(a.latestVersion(), 2);
    assert.equal(s.bound("E").claim.version, 1);
    s.createBound(a.snapshot("F", 2, ["R-01", "R-02", "R-03"]));
    assert.equal(s.bound("F").claim.version, 2);
    assert.throws(
      () => validateSnapshot(s.bound("F"), s.task("E")),
      /MISMATCH|BINDING/,
    );
    const fingerprint = a.fingerprints();
    s.close();
    s = new Store(join(dir, "control"));
    globalThis.fetch = async (url, opts) => {
      calls++;
      const body = JSON.parse(opts.body),
        m = body.messages.findLast((m) => m.role === "user"),
        text =
          typeof m.content === "string"
            ? m.content
            : m.content.map((x) => x.text ?? "").join(""),
        input = JSON.parse(text.split("INPUT_JSON\n")[1]);
      assert(!opts.body.includes("sqlite"));
      assert(!opts.body.includes(manifest.records["R-X"].recordId));
      if (input.researchArtifact) {
        assert.equal(
          body.tools?.length ?? 0,
          0,
          "Reviewer has no inherited read or delegation tools",
        );
        return sse({
          choices: [
            {
              index: 0,
              delta: {
                role: "assistant",
                content: JSON.stringify({
                  reviewedArtifactId: input.researchArtifact.id,
                  decision: "PASS",
                  issues: [],
                  requestedCorrections: [],
                  reviewLimitations: ["offline stub"],
                }),
              },
              finish_reason: "stop",
            },
          ],
        });
      }
      if (!body.messages.some((m) => m.role === "tool"))
        return sse({
          choices: [
            {
              index: 0,
              delta: {
                role: "assistant",
                tool_calls: [
                  {
                    index: 0,
                    id: "tool-" + calls,
                    type: "function",
                    function: {
                      name: "get_authorized_records",
                      arguments: JSON.stringify({
                        recordIds: input.authorizedRecords.map(
                          (x) => x.recordId,
                        ),
                      }),
                    },
                  },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
        });
      return sse({
        choices: [
          {
            index: 0,
            delta: {
              role: "assistant",
              content: JSON.stringify({
                observations: [
                  {
                    observation: "Synthetic authorized record observed",
                    citations: [input.authorizedRecords[0].recordId],
                    limitations: ["synthetic only"],
                  },
                ],
                unresolvedQuestions: [],
              }),
            },
            finish_reason: "stop",
          },
        ],
      });
    };
    r = new Runtime(dir, s);
    await r.init();
    assert(!r.credentials.hasPower());
    assert.equal(s.bound("E").contentDigest, s1.contentDigest);
    await assert.rejects(r.execute("E"), /MODEL_CAPABILITY_OFF/);
    r.activate("offline-fixture");
    await r.execute("E");
    assert.equal(s.task("E").state, "MEMO_READY");
    assert.equal(calls, 3);
    for (const run of s.snapshot().runs) {
      assert.equal(run.summary.executor, "harness-spawn");
      assert.equal(run.summary.provider, "spawn");
      assert.equal(run.summary.childSessionId, run.session);
      assert.notEqual(run.summary.parentSessionId, run.session);
      assert.equal(run.summary.parentModelRequests, 0);
      assert.equal(run.summary.freshSession, true);
      assert.equal(run.summary.inheritedConversation, false);
      assert.equal(run.summary.contextDigest, s.task("E").digest);
      assert.equal(run.summary.stopReason, "completed");
      assert.equal(run.summary.modelRoute.provider, "deepseek-official");
      assert(run.summary.eventTypes.includes("subagent/descriptor"));
    }
    assert.equal(
      r.status().runtime.liveSessions,
      0,
      "both children and coordinators released before task completion",
    );
    assert.equal(
      r.ctx.tools.schemas().length,
      0,
      "run-bound tools removed after delegation",
    );
    assert.equal(
      s.snapshot().events.filter((e) => e.kind === "HARNESS_DELEGATION_STARTED")
        .length,
      2,
    );
    assert.equal(
      s.snapshot().events.filter((e) => e.kind === "SESSION_RELEASED").length,
      4,
    );
    assert(s.snapshot().runs[0].summary.eventTypes.includes("tool/result"));
    assert.equal(s.snapshot().runs[0].summary.toolReads.length, 1);
    await r.execute("E");
    assert.equal(calls, 3);
    const artifactId = s.task("E").checkpoint.research;
    const row = s.db
      .prepare("SELECT * FROM artifacts WHERE id=?")
      .get(artifactId);
    s.db.prepare("DELETE FROM artifacts WHERE id=?").run(artifactId);
    assert.throws(() => s.check("E"), /ARTIFACT_MISSING/);
    s.db
      .prepare("INSERT INTO artifacts VALUES(?,?,?,?,?,?,?)")
      .run(...Object.values(row));
    s.db
      .prepare("UPDATE artifacts SET content=? WHERE id=?")
      .run("{}", artifactId);
    assert.throws(() => s.check("E"), /ARTIFACT_INTEGRITY/);
    s.db
      .prepare("UPDATE artifacts SET content=? WHERE id=?")
      .run(row.content, artifactId);
    assert.equal(s.check("E").state, "MEMO_READY");
    assert.equal((await r.scan()).hits, 0);
    await r.execute("F");
    assert.equal(calls, 6);
    assert.deepEqual(a.fingerprints(), fingerprint);
    assert.equal(s.task("F").state, "MEMO_READY");
    assert.equal(
      s.snapshot().artifacts.find((x) => x.type === "MEMO" && x.taskId === "F")
        .content.authority.claimVersion,
      2,
    );
    const before = calls;
    const originalSnapshot = s.db
      .prepare("SELECT content FROM snapshots WHERE id=?")
      .get("S1").content;
    s.db
      .prepare("UPDATE snapshots SET content=? WHERE id=?")
      .run(originalSnapshot.replace("持续关注", "全部改写"), "S1");
    await assert.rejects(r.execute("E"), /SNAPSHOT_MISMATCH/);
    assert.equal(s.task("E").state, "RECOVERY_BLOCKED");
    assert.equal(calls, before);
    s.db
      .prepare("UPDATE snapshots SET content=? WHERE id=?")
      .run(originalSnapshot, "S1");
    s.db.prepare("DELETE FROM snapshots WHERE id=?").run("S1");
    assert.throws(() => s.bound("E"), /SNAPSHOT_MISSING/);
    assert.equal(calls, 6);
    const unknown = await r.ctx.tools.execute({
      callId: "negative-write",
      name: "update_claim",
      arguments: {},
      signal: new AbortController().signal,
    });
    assert(unknown.isError);
    assert.throws(() => s.reserve("overflow"), /MODEL_BUDGET_EXHAUSTED/);
    await r.close();
    s.close();
    s = null;
    a.close();
    a = null;
  } finally {
    if (r) await r.close().catch(() => {});
    if (s) s.close();
    if (a) a.close();
    globalThis.fetch = original;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("stand down isolates a late model response and preserves the stopped reason", async () => {
  const dir = mkdtempSync(join(root, ".test-cancel-"));
  const original = globalThis.fetch;
  let adapter, store, runtime;
  try {
    seed(join(dir, "knowledge"));
    adapter = new ResearchAdapter(join(dir, "knowledge"));
    store = new Store(join(dir, "control"));
    store.createBound(adapter.snapshot("E", 1, ["R-03"]));
    runtime = new Runtime(dir, store);
    await runtime.init();
    let arrive, finish;
    const arrived = new Promise((resolve) => {
      arrive = resolve;
    });
    runtime.originalFetch = async () => {
      arrive();
      return new Promise((resolve) => {
        finish = resolve;
      });
    };
    runtime.activate("offline-cancel-sentinel");
    const execution = runtime.execute("E");
    const rejected = assert.rejects(execution, /CANCELED/);
    await arrived;
    const stopping = runtime.standDown();
    // This response ignores cancellation deliberately: the generation guard must isolate it.
    finish(
      sse({
        choices: [
          {
            index: 0,
            delta: { role: "assistant", content: "{}" },
            finish_reason: "stop",
          },
        ],
      }),
    );
    await stopping;
    await rejected;
    assert.equal(store.task("E").state, "NEEDS_ATTENTION");
    assert.equal(store.task("E").checkpoint.reason, "CANCELED");
    assert.equal(store.snapshot().artifacts.length, 0);
    assert.equal(runtime.status().runtime.modelOnline, false);
    assert.equal(runtime.status().runtime.providerValidated, false);
    assert.equal(runtime.status().runtime.liveSessions, 0);
    assert.equal(store.count(), 1);
    assert.equal(store.snapshot().runs[0].state, "FAILED");
    assert.equal(store.snapshot().runs[0].summary.stopReason, "aborted");
    assert.equal(runtime.ctx.tools.schemas().length, 0);
    assert.equal(runtime.executor.active, null);
  } finally {
    if (runtime) await runtime.close();
    if (store) store.close();
    if (adapter) adapter.close();
    globalThis.fetch = original;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("failed child transport consumes one reservation and releases the entire delegation", async () => {
  const dir = mkdtempSync(join(root, ".test-delegation-failure-"));
  const original = globalThis.fetch;
  let adapter,
    store,
    runtime,
    calls = 0;
  try {
    seed(join(dir, "knowledge"));
    adapter = new ResearchAdapter(join(dir, "knowledge"));
    store = new Store(join(dir, "control"));
    store.createBound(adapter.snapshot("E", 1, ["R-03"]));
    globalThis.fetch = async () => {
      calls++;
      throw Error("synthetic transport failure");
    };
    runtime = new Runtime(dir, store);
    await runtime.init();
    runtime.activate("offline-failure-sentinel");
    await assert.rejects(runtime.execute("E"), /TURN_NOT_COMPLETED/);
    assert.equal(calls, 1);
    assert.equal(store.count(), 1);
    assert.equal(store.snapshot().budget[0].state, "FAILED_OR_CANCELED");
    assert.equal(store.snapshot().runs[0].state, "FAILED");
    assert.equal(store.snapshot().runs[0].summary.stopReason, "error");
    assert.equal(store.snapshot().artifacts.length, 0);
    assert.equal(store.task("E").state, "NEEDS_ATTENTION");
    assert.equal(runtime.status().runtime.liveSessions, 0);
    assert.equal(runtime.ctx.tools.schemas().length, 0);
    await assert.rejects(runtime.execute("E"), /TASK_NOT_RESUMABLE/);
    assert.equal(calls, 1, "failed work must not be silently retried");
  } finally {
    if (runtime) await runtime.close();
    if (store) store.close();
    if (adapter) adapter.close();
    globalThis.fetch = original;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("stand down during child startup releases the coordinator without dispatching a request", async () => {
  const dir = mkdtempSync(join(root, ".test-startup-cancel-"));
  const original = globalThis.fetch;
  let adapter,
    store,
    runtime,
    calls = 0;
  try {
    seed(join(dir, "knowledge"));
    adapter = new ResearchAdapter(join(dir, "knowledge"));
    store = new Store(join(dir, "control"));
    store.createBound(adapter.snapshot("E", 1, ["R-03"]));
    globalThis.fetch = async () => {
      calls++;
      throw Error("unexpected request");
    };
    runtime = new Runtime(dir, store);
    await runtime.init();
    const start = runtime.ctx.subagents.start.bind(runtime.ctx.subagents);
    let arrive, release;
    const arrived = new Promise((resolve) => {
      arrive = resolve;
    });
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    runtime.ctx.subagents.start = async (...args) => {
      arrive();
      await gate;
      return start(...args);
    };
    runtime.activate("offline-startup-sentinel");
    const execution = runtime.execute("E");
    const rejected = assert.rejects(execution, /CANCELED/);
    await arrived;
    const stopping = runtime.standDown();
    release();
    await stopping;
    await rejected;
    assert.equal(calls, 0);
    assert.equal(store.count(), 0);
    assert.equal(runtime.status().runtime.liveSessions, 0);
    assert.equal(runtime.ctx.tools.schemas().length, 0);
    assert.equal(runtime.executor.active, null);
    assert.equal(store.task("E").checkpoint.reason, "CANCELED");
    assert.equal(store.snapshot().artifacts.length, 0);
  } finally {
    if (runtime) await runtime.close();
    if (store) store.close();
    if (adapter) adapter.close();
    globalThis.fetch = original;
    rmSync(dir, { recursive: true, force: true });
  }
});
