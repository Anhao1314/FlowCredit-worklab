import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { seed } from "../../fixtures/northstar/seed.mjs";
import { ResearchAdapter } from "../../packages/research-adapter/adapter.mjs";
import { Store } from "../../packages/control-plane/store.mjs";
import { Runtime } from "../../packages/control-plane/runtime.mjs";
import { AgentWork } from "../../packages/agent-work/providers.mjs";
import { ClaudeCodeExecutor } from "../../packages/agent-work/claude-code.mjs";
import { hash } from "../../packages/task-context/contracts.mjs";

const pass = (id) => ({
  reviewedArtifactId: id,
  decision: "PASS",
  issues: [],
  requestedCorrections: [],
  reviewLimitations: ["offline fixture"],
});
function queryFixture({ prompt, options }) {
  assert.deepEqual(options.tools, []);
  assert.deepEqual(options.disallowedTools, ["*"]);
  assert.deepEqual(options.settingSources, []);
  assert.deepEqual(options.mcpServers, {});
  assert.equal(options.strictMcpConfig, true);
  assert.equal(options.persistSession, false);
  assert.equal(options.permissionMode, "dontAsk");
  assert.equal(options.maxTurns, 1);
  assert.equal(options.env.ANTHROPIC_AUTH_TOKEN, "offline-agent-work-sentinel");
  assert.equal(options.env.DEEPSEEK_API_KEY, undefined);
  const input = JSON.parse(prompt.split("INPUT_JSON\n")[1]);
  return {
    close() {},
    async *[Symbol.asyncIterator]() {
      yield {
        type: "system",
        subtype: "init",
        tools: [],
        session_id: "offline-claude-session",
      };
      yield {
        type: "result",
        subtype: "success",
        result: JSON.stringify(pass(input.researchArtifact.id)),
      };
    },
  };
}
test("replaceable Reviewer uses exact Artifact, separate budget and preserves authority/checkpoint on comparison", async () => {
  const root = mkdtempSync(join(process.cwd(), ".test-agent-work-"));
  const original = globalThis.fetch;
  let adapter, store, runtime;
  try {
    seed(join(root, "knowledge"));
    adapter = new ResearchAdapter(join(root, "knowledge"));
    store = new Store(join(root, "data"));
    store.createBound(
      adapter.snapshot("E", 1, ["R-01", "R-02", "R-03", "R-04"]),
    );
    store.setReviewer("E", "claude-code");
    await import("../support/model-stub.mjs");
    runtime = new Runtime(root, store);
    await runtime.init();
    runtime.claudeExecutor.queryFactory = queryFixture;
    runtime.activate("offline-agent-work-sentinel");
    const fingerprints = adapter.fingerprints();
    await runtime.execute("E");
    assert.equal(store.task("E").state, "MEMO_READY");
    assert.equal(store.count(), 2);
    assert.equal(store.delegationCount(), 1);
    const state = runtime.status(),
      cp = store.task("E").checkpoint;
    assert.equal(state.runs[1].summary.workProvider, "claude-code");
    assert.equal(state.runs[1].summary.modelRequestCount, null);
    assert.equal(state.runs[1].summary.researchArtifactId, cp.research);
    assert.equal(state.runs[1].summary.tools.length, 0);
    assert.throws(
      () => store.setReviewer("E", "native-harness"),
      /POLICY_FROZEN/,
    );
    await runtime.compare("E", "native-harness");
    assert.deepEqual(store.task("E").checkpoint, cp);
    assert.equal(store.count(), 3);
    assert.equal(
      store.snapshot().artifacts.filter((a) => a.type === "REVIEW_COMPARISON")
        .length,
      1,
    );
    store.humanReview("E", "FOLLOW_UP", "Keep as candidate");
    assert.equal(store.snapshot().humanReviews.length, 1);
    assert.deepEqual(adapter.fingerprints(), fingerprints);
    assert.equal(
      store.artifact(cp.memo).content.authority.humanApproved,
      false,
    );
    const scan = await runtime.scan();
    assert.equal(scan.hits, 0);
    await runtime.standDown();
    assert.equal(runtime.status().runtime.liveExternalRuns, 0);
    await runtime.execute("E");
    assert.equal(
      store.count(),
      3,
      "completed work needs no key and no inference",
    );
    const saved = store.snapshot();
    await runtime.close();
    runtime = null;
    store.close();
    store = new Store(join(root, "data"));
    store.recover();
    for (const key of [
      "tasks",
      "artifacts",
      "runs",
      "policies",
      "delegations",
      "humanReviews",
    ])
      assert.deepEqual(store.snapshot()[key], saved[key]);
  } finally {
    if (runtime) await runtime.close();
    store?.close();
    adapter?.close();
    globalThis.fetch = original;
    rmSync(root, { recursive: true, force: true });
  }
});
test("external reviewer refuses tools, scrubs errors and responds to cancellation", async () => {
  const root = mkdtempSync(join(process.cwd(), ".test-external-"));
  const events = [];
  const context = { snapshotId: "S1" },
    task = { id: "E", context, digest: hash(context) };
  const request = {
    task,
    role: "Reviewer",
    input: { snapshotId: "S1", researchArtifact: { id: "r" } },
    instructions: "review",
    onStarted() {},
  };
  const credentials = {
    resolve: async () => ({ value: "offline-agent-work-sentinel" }),
    contains: (t) => t.includes("offline-agent-work-sentinel"),
  };
  const executor = new ClaudeCodeExecutor(root, {
    credentials,
    event: (kind, detail) => events.push({ kind, detail }),
  });
  try {
    executor.queryFactory = () => ({
      close() {},
      async *[Symbol.asyncIterator]() {
        yield { type: "system", subtype: "init", tools: ["Bash"] };
      },
    });
    await assert.rejects(executor.execute(request), /EXTERNAL_TOOLS_NOT_EMPTY/);
    assert.equal(executor.active, null);
    executor.queryFactory = () => {
      throw Error("error containing offline-agent-work-sentinel");
    };
    await assert.rejects(
      executor.execute(request),
      /^Error: EXTERNAL_REVIEW_FAILED$/,
    );
    executor.queryFactory = ({ options }) => ({
      close() {},
      async *[Symbol.asyncIterator]() {
        yield { type: "system", subtype: "init", tools: [] };
        executor.cancel();
        yield {
          type: "result",
          subtype: "success",
          result: JSON.stringify(pass("r")),
        };
      },
    });
    await assert.rejects(executor.execute(request), /CANCELED/);
    assert.equal(executor.active, null);
    assert(!JSON.stringify(events).includes("offline-agent-work-sentinel"));
    const service = new AgentWork({ "claude-code": executor });
    await assert.rejects(
      service.execute("claude-code", { ...request, role: "Researcher" }),
      /PROVIDER_ROLE_UNSUPPORTED/,
    );
    await assert.rejects(
      service.execute("claude-code", {
        ...request,
        input: { snapshotId: "S2" },
      }),
      /EXECUTION_CONTRACT_INVALID/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("restart marks unfinished comparison/delegation uncertain without overwriting ready memo task", () => {
  const root = mkdtempSync(join(process.cwd(), ".test-external-recovery-"));
  const s = new Store(root);
  try {
    s.db
      .prepare("INSERT INTO runs VALUES(?,?,?,?,?,?,?)")
      .run("lost", "E", "Reviewer", null, "old", "RUNNING", "{}");
    const a = s.reserveDelegation("lost", "claude-code");
    s.recover();
    assert.equal(s.snapshot().runs[0].state, "INTERRUPTED");
    assert.equal(s.snapshot().delegations[0].state, "INTERRUPTED_COST_UNKNOWN");
    s.reserveDelegation("second", "claude-code");
    assert.throws(
      () => s.reserveDelegation("third", "claude-code"),
      /DELEGATION_BUDGET_EXHAUSTED/,
    );
  } finally {
    s.close();
    rmSync(root, { recursive: true, force: true });
  }
});
