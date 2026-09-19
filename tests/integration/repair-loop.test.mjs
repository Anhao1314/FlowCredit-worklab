import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { seed } from "../../fixtures/northstar/seed.mjs";
import { ResearchAdapter } from "../../packages/research-adapter/adapter.mjs";
import { Store } from "../../packages/control-plane/store.mjs";
import { Runtime } from "../../packages/control-plane/runtime.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const sse = (choices) =>
  new Response(
    "data: " + JSON.stringify({ choices }) + "\n\ndata: [DONE]\n\n",
    { headers: { "content-type": "text/event-stream" } },
  );
const chunk = ({ delta, reason = "stop" }) =>
  sse([
    {
      index: 0,
      delta: { role: "assistant", ...delta },
      finish_reason: reason,
    },
  ]);
const pass = (input) => ({
  reviewedArtifactId: input.researchArtifact.id,
  decision: "PASS",
  issues: [],
  requestedCorrections: [],
  reviewLimitations: ["离线复核策略，非真实模型判断"],
});
function offlineFetch(reviewFor) {
  return async (url, options) => {
    assert.equal(String(url), "https://api.deepseek.com/v1/chat/completions");
    assert(!options.body.includes("sqlite"));
    const body = JSON.parse(options.body);
    const user = body.messages.findLast((m) => m.role === "user");
    const text =
      typeof user.content === "string"
        ? user.content
        : user.content.map((x) => x.text || "").join("");
    const input = JSON.parse(text.split("INPUT_JSON\n")[1]);
    if (input.researchArtifact)
      return chunk({ delta: { content: JSON.stringify(reviewFor(input)) } });
    if (!body.messages.some((m) => m.role === "tool"))
      return chunk({
        reason: "tool_calls",
        delta: {
          tool_calls: [
            {
              index: 0,
              id: "offline-repair-read",
              type: "function",
              function: {
                name: "get_authorized_records",
                arguments: JSON.stringify({
                  recordIds: input.authorizedRecords.map((r) => r.recordId),
                }),
              },
            },
          ],
        },
      });
    return chunk({
      delta: {
        content: JSON.stringify({
          observations: [
            {
              observation: input.originalResearchArtifact
                ? "修复稿：按复核意见在授权范围内改写结论表述。"
                : "初稿：客户集中度需要更保守的表述。",
              citations: [input.authorizedRecords[0].recordId],
              limitations: ["合成离线测试策略，非真实模型判断"],
            },
          ],
          unresolvedQuestions: [],
        }),
      },
    });
  };
}
const revise = (input, recordId) => ({
  reviewedArtifactId: input.researchArtifact.id,
  decision: "REQUEST_REVISION",
  issues: [
    {
      code: "SCOPE_WORDING",
      severity: "blocking",
      detail: "表述超出授权资料支持范围",
      recordIds: [recordId],
    },
  ],
  requestedCorrections: ["仅依据授权原文改写结论"],
  reviewLimitations: ["离线复核策略，非真实模型判断"],
});
function claudeQueryFixture(result) {
  return ({ prompt, options }) => {
    assert.deepEqual(options.tools, []);
    const input = JSON.parse(prompt.split("INPUT_JSON\n")[1]);
    return {
      close() {},
      async *[Symbol.asyncIterator]() {
        yield {
          type: "system",
          subtype: "init",
          tools: [],
          session_id: "offline-repair-claude-session",
        };
        yield {
          type: "result",
          subtype: "success",
          result: JSON.stringify(result(input)),
        };
      },
    };
  };
}
function offlineSetup(dir, fetchStub) {
  seed(join(dir, "knowledge"));
  const adapter = new ResearchAdapter(join(dir, "knowledge"));
  const store = new Store(join(dir, "data"));
  globalThis.fetch = fetchStub;
  return { adapter, store };
}

test("REQUEST_REVISION opens a same-snapshot Repair Task, a human starts it, and the revised work stops at the gate", async () => {
  const dir = mkdtempSync(join(process.cwd(), ".test-repair-"));
  const original = globalThis.fetch;
  let adapter, store, runtime;
  try {
    const setup = offlineSetup(
      dir,
      offlineFetch((input) =>
        input.task.repair ? pass(input) : revise(input, input.task.scope[0]),
      ),
    );
    adapter = setup.adapter;
    store = setup.store;
    const bound = store.createBound(
      adapter.snapshot("E", 1, ["R-01", "R-02", "R-03", "R-04"]),
    );
    assert.equal(bound.context.scope.length, 4);
    assert.deepEqual(bound.context.scope, bound.context.authorizedRecordIds);
    runtime = new Runtime(dir, store);
    await runtime.init();
    runtime.activate("offline-repair-sentinel");
    await runtime.execute("E");

    // The original Task, Research Artifact and Review Artifact are preserved.
    const e = store.task("E");
    assert.equal(e.state, "NEEDS_ATTENTION");
    assert.equal(e.kind, "RESEARCH");
    const originalResearchId = e.checkpoint.research,
      originalReviewId = e.checkpoint.review,
      originalResearch = store.artifact(originalResearchId);
    assert.match(originalResearch.content.observations[0].observation, /初稿/);
    assert.equal(
      store.artifact(originalReviewId).content.decision,
      "REQUEST_REVISION",
    );
    assert.equal(store.count(), 3, "only the first execution consumed budget");

    // REQUEST_REVISION created a Repair Task with explicit lineage.
    const repairId = store.openRepairTaskId("E");
    const repair = store.task(repairId);
    assert.ok(repair, "REPAIR_REVISION creates a Repair Task");
    assert.equal(repair.kind, "REPAIR");
    assert.equal(repair.state, "RESEARCH_PENDING");
    assert.equal(repair.lineage.parentTaskId, "E");
    assert.equal(repair.lineage.snapshotId, "S1");
    assert.equal(repair.lineage.inputArtifactId, originalResearchId);
    assert.equal(repair.lineage.reviewArtifactId, originalReviewId);
    assert.match(repair.lineage.reason, /表述超出授权资料支持范围/);
    assert.equal(repair.context.snapshotId, e.context.snapshotId);
    // Repair binds the SAME Snapshot: one snapshot row, identical digest.
    assert.equal(
      store.db.prepare("SELECT count(*) n FROM snapshots").get().n,
      1,
    );
    assert.equal(store.bound(repairId).snapshotId, "S1");
    assert.equal(
      store.bound(repairId).contentDigest,
      store.bound("E").contentDigest,
    );
    // It is never executed automatically.
    assert.equal(
      store.snapshot().runs.filter((r) => r.task === repairId).length,
      0,
    );
    assert.equal(store.count(), 3);
    assert.equal(store.snapshot().humanReviews.length, 0);

    // Deterministic exits are exposed; a second create is idempotent.
    let environment = runtime
      .status()
      .environment.find((x) => x.taskId === "E");
    assert.equal(environment.repairTaskId, repairId);
    assert.equal(environment.reviewProvider, "native-harness");
    assert.ok(environment.allowedActions.includes("ABANDON_TASK"));
    assert.ok(!environment.allowedActions.includes("CREATE_REPAIR_TASK"));
    assert.equal(store.createRepairTask("E", {}).id, repairId);

    // A human explicitly starts the Repair Task: a new AgentRun, new budget.
    const runsBefore = store.snapshot().runs.length;
    await runtime.execute(repairId);
    const done = store.task(repairId);
    assert.equal(done.state, "MEMO_READY");
    assert.equal(store.count(), 6);
    assert.equal(store.snapshot().runs.length, runsBefore + 2);
    const repairRuns = store.snapshot().runs.filter((r) => r.task === repairId);
    assert.deepEqual(
      repairRuns.map((r) => r.role),
      ["Researcher", "Reviewer"],
      "the repair used a new Researcher run, never the previous one",
    );
    assert.notEqual(
      repairRuns[0].id,
      store
        .snapshot()
        .runs.find((r) => r.task === "E" && r.role === "Researcher").id,
    );
    assert.equal(repairRuns[0].summary.repair.parentTaskId, "E");
    assert.equal(
      repairRuns[0].summary.repair.supersedesArtifactId,
      originalResearchId,
    );

    // The revised Artifact has a new identity and lineage; the original stays.
    const revised = store.artifact(done.checkpoint.research);
    assert.notEqual(revised.id, originalResearchId);
    assert.equal(revised.type, "RESEARCH");
    assert.equal(
      revised.content.lineage.supersedesArtifactId,
      originalResearchId,
    );
    assert.equal(revised.content.lineage.parentTaskId, "E");
    assert.equal(revised.content.lineage.repairTaskId, repairId);
    assert.equal(revised.content.lineage.reviewArtifactId, originalReviewId);
    assert.match(revised.content.observations[0].observation, /修复稿/);
    assert.deepEqual(store.artifact(originalResearchId), originalResearch);
    assert.equal(store.task("E").state, "NEEDS_ATTENTION");
    assert.equal(store.task("E").checkpoint.research, originalResearchId);

    // Reviewer PASS assembled a Candidate Memo that waits at the Human Gate.
    const memo = store.artifact(done.checkpoint.memo);
    assert.equal(memo.content.lineage.supersedesArtifactId, originalResearchId);
    assert.equal(memo.content.authority.humanApproved, false);
    assert.equal(memo.content.authority.revisionCreated, false);
    assert.equal(memo.content.authority.evidenceAdmitted, false);
    assert.equal(store.snapshot().humanReviews.length, 0);

    // Repeated resume does not duplicate committed paid work.
    const artifactsBefore = store.snapshot().artifacts.length;
    await runtime.execute(repairId);
    assert.equal(store.count(), 6);
    assert.equal(store.snapshot().runs.length, runsBefore + 2);
    assert.equal(store.snapshot().artifacts.length, artifactsBefore);

    // Stand Down preserves the Repair Task and every Artifact.
    await runtime.standDown();
    assert.equal(runtime.status().runtime.modelOnline, false);
    assert.equal(store.task(repairId).state, "MEMO_READY");
    assert.equal(store.artifact(done.checkpoint.memo).id, memo.id);

    // Restart preserves the Repair Task with the same lineage and budget.
    const saved = store.snapshot();
    await runtime.close();
    runtime = null;
    store.close();
    store = new Store(join(dir, "data"));
    store.recover();
    assert.deepEqual(store.snapshot().tasks, saved.tasks);
    assert.deepEqual(store.snapshot().artifacts, saved.artifacts);
    assert.deepEqual(store.snapshot().runs, saved.runs);
    assert.deepEqual(store.snapshot().budget, saved.budget);
    assert.deepEqual(store.task(repairId).lineage, repair.lineage);
    assert.equal(store.check(repairId).state, "MEMO_READY");

    // The gate only opens through an explicit human action, which still does
    // not admit evidence or revise the Claim.
    store.humanReview(
      repairId,
      "FOLLOW_UP",
      "离线测试：人工处理意见，不构成研究决定",
    );
    assert.equal(store.snapshot().humanReviews.length, 1);
    assert.equal(
      store.artifact(done.checkpoint.memo).content.authority.humanApproved,
      false,
    );
  } finally {
    if (runtime) await runtime.close().catch(() => {});
    if (store) store.close();
    if (adapter) adapter.close();
    globalThis.fetch = original;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("blocked work exposes only human exits: explicit repair creation and abandonment", async () => {
  const dir = mkdtempSync(join(process.cwd(), ".test-repair-exits-"));
  const original = globalThis.fetch;
  let adapter, store, runtime;
  try {
    const setup = offlineSetup(
      dir,
      offlineFetch((input) => ({
        reviewedArtifactId: input.researchArtifact.id,
        decision: "BLOCKED",
        issues: [
          {
            code: "MISSING_SOURCE",
            severity: "blocking",
            detail: "固定快照缺少所需原文",
            recordIds: [input.task.scope[0]],
          },
        ],
        requestedCorrections: [],
        reviewLimitations: ["离线复核策略，非真实模型判断"],
      })),
    );
    adapter = setup.adapter;
    store = setup.store;
    store.createBound(adapter.snapshot("E", 1, ["R-01", "R-02"]));
    runtime = new Runtime(dir, store);
    await runtime.init();
    runtime.activate("offline-repair-exits-sentinel");
    await runtime.execute("E");

    const e = store.task("E");
    assert.equal(e.state, "NEEDS_ATTENTION");
    assert.equal(
      store.openRepairTaskId("E"),
      null,
      "BLOCKED never creates a repair automatically",
    );
    const environment = runtime
      .status()
      .environment.find((x) => x.taskId === "E");
    assert.deepEqual(
      environment.allowedActions.filter((a) => a.endsWith("_TASK")),
      ["CREATE_REPAIR_TASK", "ABANDON_TASK"],
    );
    const budgetBefore = store.count(),
      artifactsBefore = store.snapshot().artifacts.length;
    const repair = store.createRepairTask("E");
    assert.equal(repair.kind, "REPAIR");
    assert.equal(repair.lineage.reviewArtifactId, e.checkpoint.review);
    assert.match(repair.lineage.reason, /固定快照缺少所需原文/);
    assert.equal(
      store.snapshot().runs.filter((r) => r.task === repair.id).length,
      0,
    );
    assert.equal(
      store.count(),
      budgetBefore,
      "creating a repair costs no budget",
    );
    assert.equal(store.createRepairTask("E").id, repair.id);
    assert.equal(
      store.snapshot().tasks.filter((t) => t.kind === "REPAIR").length,
      1,
    );

    const abandoned = store.abandon("E", "离线测试：人工放弃，不自动重试");
    assert.equal(abandoned.state, "ABANDONED");
    assert.equal(store.artifact(e.checkpoint.research).type, "RESEARCH");
    assert.equal(store.artifact(e.checkpoint.review).type, "REVIEW");
    assert.equal(store.snapshot().artifacts.length, artifactsBefore);
    assert.equal(store.count(), budgetBefore, "abandonment spends no budget");
    await assert.rejects(runtime.execute("E"), /TASK_NOT_RESUMABLE/);
    assert.equal(
      runtime
        .status()
        .environment.find((x) => x.taskId === "E")
        .allowedActions.includes("CREATE_REPAIR_TASK"),
      false,
    );
    assert.equal(store.task(repair.id).state, "RESEARCH_PENDING");
  } finally {
    if (runtime) await runtime.close().catch(() => {});
    if (store) store.close();
    if (adapter) adapter.close();
    globalThis.fetch = original;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resuming a repair with committed research never repeats the paid research work", async () => {
  const dir = mkdtempSync(join(process.cwd(), ".test-repair-resume-"));
  const original = globalThis.fetch;
  let adapter, store, runtime;
  try {
    const setup = offlineSetup(
      dir,
      offlineFetch((input) =>
        input.task.repair ? pass(input) : revise(input, input.task.scope[0]),
      ),
    );
    adapter = setup.adapter;
    store = setup.store;
    store.createBound(adapter.snapshot("E", 1, ["R-01", "R-02"]));
    runtime = new Runtime(dir, store);
    await runtime.init();
    runtime.activate("offline-repair-resume-sentinel");
    await runtime.execute("E");
    const repairId = store.openRepairTaskId("E");

    // Simulate an interruption after the repair research committed: the stage
    // is REVIEW_PENDING and the paid research must not run again.
    const review = runtime.review.bind(runtime);
    runtime.review = async () => {
      throw Error("TEST_INTERRUPT");
    };
    await assert.rejects(runtime.execute(repairId), /TEST_INTERRUPT/);
    const committed = store.task(repairId);
    assert.equal(committed.state, "REVIEW_PENDING");
    const researchId = committed.checkpoint.research;
    assert.equal(store.count(), 5, "repair research consumed two requests");
    assert.equal(
      store.snapshot().runs.filter((r) => r.task === repairId).length,
      1,
    );

    runtime.review = review;
    await runtime.execute(repairId);
    assert.equal(store.task(repairId).state, "MEMO_READY");
    assert.equal(store.count(), 6, "only the pending review was executed");
    assert.equal(store.task(repairId).checkpoint.research, researchId);
    assert.equal(
      store.snapshot().runs.filter((r) => r.task === repairId).length,
      2,
      "one Researcher run and one Reviewer run in total",
    );
    assert.equal(
      store
        .snapshot()
        .artifacts.filter((a) => a.taskId === repairId && a.type === "RESEARCH")
        .length,
      1,
    );
  } finally {
    if (runtime) await runtime.close().catch(() => {});
    if (store) store.close();
    if (adapter) adapter.close();
    globalThis.fetch = original;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("records outside the authorized snapshot scope reject the whole review before commit, for both providers", async () => {
  for (const reviewer of ["native-harness", "claude-code"]) {
    const dir = mkdtempSync(join(process.cwd(), ".test-review-scope-"));
    const original = globalThis.fetch;
    let adapter, store, runtime;
    try {
      const setup = offlineSetup(
        dir,
        offlineFetch((input) => ({
          reviewedArtifactId: input.researchArtifact.id,
          decision: "REQUEST_REVISION",
          issues: [
            {
              code: "UNAUTHORIZED_SUPPORT",
              severity: "blocking",
              detail: "引用了快照外的记录",
              recordIds: [setup.foreignRecordId],
            },
          ],
          requestedCorrections: ["删除越权引用"],
          reviewLimitations: [],
        })),
      );
      adapter = setup.adapter;
      store = setup.store;
      // R-04 is authorized in another snapshot of the same synthetic subject
      // but is not part of this Task's frozen scope.
      setup.foreignRecordId = adapter.snapshot("E", 1, [
        "R-01",
        "R-02",
        "R-03",
        "R-04",
      ]).records[3].id;
      store.createBound(adapter.snapshot("E", 1, ["R-01", "R-02", "R-03"]));
      if (reviewer === "claude-code") store.setReviewer("E", "claude-code");
      runtime = new Runtime(dir, store);
      await runtime.init();
      if (reviewer === "claude-code")
        runtime.claudeExecutor.queryFactory = claudeQueryFixture((input) => ({
          reviewedArtifactId: input.researchArtifact.id,
          decision: "REQUEST_REVISION",
          issues: [
            {
              code: "UNAUTHORIZED_SUPPORT",
              severity: "blocking",
              detail: "引用了快照外的记录",
              recordIds: [setup.foreignRecordId],
            },
          ],
          requestedCorrections: ["删除越权引用"],
          reviewLimitations: [],
        }));
      runtime.activate("offline-review-scope-sentinel");
      await assert.rejects(
        runtime.execute("E"),
        /REVIEW_RECORD_OUT_OF_SCOPE/,
        reviewer,
      );
      const t = store.task("E");
      assert.equal(t.state, "NEEDS_ATTENTION");
      assert.equal(t.checkpoint.failureCode, "REVIEW_RECORD_OUT_OF_SCOPE");
      assert.equal(t.checkpoint.review, null);
      assert.deepEqual(
        store.snapshot().artifacts.map((a) => a.type),
        ["RESEARCH"],
        "the rejected review commits no artifact",
      );
      const reviewRun = store
        .snapshot()
        .runs.find((r) => r.role === "Reviewer");
      assert.equal(reviewRun.state, "FAILED");
      assert.equal(reviewRun.summary.failureCode, "REVIEW_RECORD_OUT_OF_SCOPE");
      assert.equal(reviewRun.summary.workProvider, reviewer);
      assert.equal(store.openRepairTaskId("E"), null);
      if (reviewer === "claude-code") {
        // The delegated process itself finished; the review artifact was
        // rejected afterwards, so the delegation settles but the run fails.
        assert.equal(store.snapshot().delegations[0].state, "COMPLETED");
        assert.equal(store.delegationCount(), 1);
        assert.equal(store.count(), 2, "no native review request was reserved");
      } else {
        assert.equal(
          store.count(),
          3,
          "the rejected request still consumed budget",
        );
      }
    } finally {
      if (runtime) await runtime.close().catch(() => {});
      if (store) store.close();
      if (adapter) adapter.close();
      globalThis.fetch = original;
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("same-provider re-review is rejected or explicitly named Repeat Review; cross-provider comparison must differ", async () => {
  const dir = mkdtempSync(join(process.cwd(), ".test-comparison-"));
  const original = globalThis.fetch;
  let adapter, store, runtime;
  try {
    const setup = offlineSetup(
      dir,
      offlineFetch((input) => pass(input)),
    );
    adapter = setup.adapter;
    store = setup.store;
    store.createBound(adapter.snapshot("E", 1, ["R-01", "R-02"]));
    runtime = new Runtime(dir, store);
    await runtime.init();
    runtime.activate("offline-comparison-sentinel");
    await runtime.execute("E");
    const checkpoint = store.task("E").checkpoint;
    assert.equal(store.task("E").state, "MEMO_READY");
    assert.equal(
      store.artifact(checkpoint.review).content.workProvider,
      "native-harness",
    );

    await assert.rejects(
      runtime.compare("E", "native-harness"),
      /COMPARISON_PROVIDER_MUST_DIFFER/,
    );
    assert.equal(store.count(), 3, "a rejected comparison costs no budget");

    await runtime.compare("E", "native-harness", "REPEAT_REVIEW");
    assert.equal(store.count(), 4);
    const repeat = store
      .snapshot()
      .artifacts.find((a) => a.type === "REVIEW_REPEAT");
    assert.ok(
      repeat,
      "same-provider work is stored as an explicit repeat review",
    );
    assert.equal(repeat.content.workProvider, "native-harness");
    assert.equal(repeat.content.repeat, true);
    assert.equal(
      store.snapshot().artifacts.some((a) => a.type === "REVIEW_COMPARISON"),
      false,
    );
    assert.equal(
      store.snapshot().events.find((e) => e.kind === "REPEAT_REVIEW_COMPLETED")
        .detail.crossProvider,
      false,
    );
    assert.deepEqual(store.task("E").checkpoint, checkpoint);

    runtime.claudeExecutor.queryFactory = claudeQueryFixture((input) =>
      pass(input),
    );
    await runtime.compare("E", "claude-code");
    const comparison = store
      .snapshot()
      .artifacts.find((a) => a.type === "REVIEW_COMPARISON");
    assert.equal(comparison.content.workProvider, "claude-code");
    assert.equal(
      store
        .snapshot()
        .events.find((e) => e.kind === "REVIEW_COMPARISON_COMPLETED").detail
        .crossProvider,
      true,
    );
    assert.deepEqual(store.task("E").checkpoint, checkpoint);
    await assert.rejects(
      runtime.compare("E", "claude-code", "REPEAT_REVIEW"),
      /REPEAT_REVIEW_REQUIRES_ORIGINAL_PROVIDER/,
    );
  } finally {
    if (runtime) await runtime.close().catch(() => {});
    if (store) store.close();
    if (adapter) adapter.close();
    globalThis.fetch = original;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a release failure never overwrites the real execution error", async () => {
  const dir = mkdtempSync(join(process.cwd(), ".test-release-"));
  const original = globalThis.fetch;
  let adapter, store, runtime;
  try {
    const setup = offlineSetup(dir, async () => {
      throw Error("synthetic transport failure");
    });
    adapter = setup.adapter;
    store = setup.store;
    store.createBound(adapter.snapshot("E", 1, ["R-03"]));
    runtime = new Runtime(dir, store);
    await runtime.init();
    const start = runtime.ctx.subagents.start.bind(runtime.ctx.subagents);
    runtime.ctx.subagents.start = async (...args) => {
      const child = await start(...args);
      const dispose = child.dispose.bind(child);
      child.dispose = async () => {
        await dispose();
        throw Error("synthetic release failure");
      };
      return child;
    };
    runtime.activate("offline-release-sentinel");
    await assert.rejects(runtime.execute("E"), (error) => {
      assert.equal(error.message, "TURN_NOT_COMPLETED");
      return true;
    });
    const run = store.snapshot().runs[0];
    assert.equal(run.state, "FAILED");
    assert.equal(run.summary.failureCode, "TURN_NOT_COMPLETED");
    assert.equal(store.task("E").state, "NEEDS_ATTENTION");
    assert.equal(store.task("E").checkpoint.failureCode, "TURN_NOT_COMPLETED");
    assert(
      store.snapshot().events.some((e) => e.kind === "EXECUTOR_RELEASE_FAILED"),
      "the teardown failure is recorded separately, not as the root cause",
    );
    assert.equal(store.snapshot().artifacts.length, 0);
    assert.equal(runtime.status().runtime.liveSessions, 0);
  } finally {
    if (runtime) await runtime.close().catch(() => {});
    if (store) store.close();
    if (adapter) adapter.close();
    globalThis.fetch = original;
    rmSync(dir, { recursive: true, force: true });
  }
});

async function startServer(dir, port, stub) {
  const child = spawn(
    process.execPath,
    ["--import", stub, "apps/runtime/server.mjs"],
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
    const timer = setTimeout(() => reject(Error("server timeout")), 10000);
    child.stdout.on("data", (b) => {
      if (b.toString().includes("FlowCredit ready")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.stderr.on("data", (b) => reject(Error(b.toString())));
    child.once("exit", () => {
      clearTimeout(timer);
      reject(Error("server exited"));
    });
  });
  return child;
}
async function stopServer(child) {
  if (!child) return;
  await new Promise((r) => {
    child.once("exit", r);
    child.kill("SIGTERM");
  });
}
async function freePort() {
  const socket = createServer();
  await new Promise((r) => socket.listen(0, "127.0.0.1", r));
  const port = socket.address().port;
  await new Promise((r) => socket.close(r));
  return port;
}

test("HTTP repair loop: REQUEST_REVISION opens a Repair Task, the human starts it, and PASS stops at the gate", async () => {
  const dir = mkdtempSync(join(root, ".test-repair-http-"));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  let child;
  const get = (path) => fetch(base + path).then((r) => r.json());
  const post = async (name, body = {}) => {
    const r = await fetch(base + "/api/" + name, {
      method: "POST",
      headers: { Origin: base, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const value = await r.json();
    assert.equal(r.status, 200, JSON.stringify(value));
    return value;
  };
  try {
    child = await startServer(dir, port, "./tests/support/revision-stub.mjs");
    const memoryBefore = await get("/api/memory");
    await post("create-e");
    await post("activate", { key: "offline-repair-http-sentinel" });
    let state = await post("resume", { taskId: "E" });
    const original = state.tasks.find((t) => t.id === "E");
    assert.equal(original.state, "NEEDS_ATTENTION");
    const repair = state.tasks.find((t) => t.kind === "REPAIR");
    assert.ok(repair, "REQUEST_REVISION created a Repair Task over HTTP");
    assert.equal(repair.state, "RESEARCH_PENDING");
    assert.equal(repair.lineage.parentTaskId, "E");
    assert.equal(repair.lineage.snapshotId, "S1");
    assert.equal(repair.lineage.inputArtifactId, original.checkpoint.research);
    assert.equal(repair.lineage.reviewArtifactId, original.checkpoint.review);
    assert.equal(
      state.snapshots.length,
      1,
      "one frozen Snapshot, no expansion",
    );
    assert.equal(state.runs.filter((r) => r.task === repair.id).length, 0);
    assert.equal(state.budget.length, 3);
    const again = await post("create-repair", { taskId: "E" });
    assert.equal(again.tasks.filter((t) => t.kind === "REPAIR").length, 1);
    assert.equal(again.tasks.find((t) => t.kind === "REPAIR").id, repair.id);

    state = await post("resume", { taskId: repair.id });
    const done = state.tasks.find((t) => t.id === repair.id);
    assert.equal(done.state, "MEMO_READY");
    assert.equal(state.budget.length, 6);
    const revised = state.artifacts.find(
      (a) => a.taskId === repair.id && a.type === "RESEARCH",
    );
    const initial = state.artifacts.find(
      (a) => a.id === original.checkpoint.research,
    );
    assert.notEqual(revised.id, initial.id);
    assert.equal(revised.content.lineage.supersedesArtifactId, initial.id);
    assert.deepEqual(
      state.artifacts.find((a) => a.id === initial.id),
      initial,
      "the original Artifact is never overwritten",
    );
    assert.equal(
      state.tasks.find((t) => t.id === "E").checkpoint.review,
      original.checkpoint.review,
    );
    const memo = state.artifacts.find(
      (a) => a.taskId === repair.id && a.type === "MEMO",
    );
    assert.equal(memo.content.authority.humanApproved, false);
    assert.equal(state.humanReviews.length, 0, "the gate stays closed");
    assert(!JSON.stringify(state).includes("offline-repair-http-sentinel"));
    assert.deepEqual(await get("/api/memory"), memoryBefore);

    state = await post("abandon", {
      taskId: "E",
      note: "离线测试：人工放弃原任务，不自动重试",
    });
    assert.equal(state.tasks.find((t) => t.id === "E").state, "ABANDONED");
    assert.ok(state.artifacts.some((a) => a.id === initial.id));
    await post("stand-down");
  } finally {
    await stopServer(child);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a research-memory change never overwrites the real execution error", async () => {
  const dir = mkdtempSync(join(root, ".test-memory-guard-"));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  let child;
  const get = (path) => fetch(base + path).then((r) => r.json());
  const post = async (name, body = {}) => {
    const r = await fetch(base + "/api/" + name, {
      method: "POST",
      headers: { Origin: base, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const value = await r.json();
    assert.equal(r.status, 200, JSON.stringify(value));
    return value;
  };
  try {
    const stub = join(dir, "mutating-stub.mjs");
    writeFileSync(
      stub,
      `import { createV2 } from ${JSON.stringify(join(root, "fixtures/northstar/seed.mjs"))};\n` +
        `let mutated = false;\n` +
        `globalThis.fetch = async () => {\n` +
        `  if (!mutated) {\n` +
        `    mutated = true;\n` +
        `    createV2(${JSON.stringify(join(dir, "knowledge"))});\n` +
        `  }\n` +
        `  throw Error("synthetic transport failure");\n` +
        `};\n`,
    );
    child = await startServer(dir, port, stub);
    await post("create-e");
    await post("activate", { key: "offline-memory-guard-sentinel" });
    const response = await fetch(base + "/api/resume", {
      method: "POST",
      headers: { Origin: base, "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: "E" }),
    });
    assert.equal(response.status, 409);
    const failure = await response.json();
    assert.equal(failure.error, "TURN_NOT_COMPLETED");
    assert.deepEqual(failure.also, ["RESEARCH_MEMORY_CHANGED"]);
    const state = await get("/api/state");
    const task = state.tasks.find((t) => t.id === "E");
    assert.equal(task.state, "NEEDS_ATTENTION");
    assert.equal(task.checkpoint.reason, "EXECUTION_NOT_COMMITTED");
    assert.equal(task.checkpoint.failureCode, "TURN_NOT_COMPLETED");
    assert(
      state.events.some((e) => e.kind === "RESEARCH_MEMORY_CHANGED"),
      "the integrity condition is recorded distinctly",
    );
    assert.equal(state.artifacts.length, 0);
    assert.equal(state.budget.length, 1);
    assert.equal(state.budget[0].state, "FAILED_OR_CANCELED");
    assert.equal(
      state.events.find((e) => e.kind === "RESEARCH_MEMORY_CHANGED").detail
        .primaryError,
      "TURN_NOT_COMPLETED",
    );
    await post("stand-down");
  } finally {
    await stopServer(child);
    rmSync(dir, { recursive: true, force: true });
  }
});
