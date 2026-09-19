import fixtures from "./demo-fixture.js";
const clone = (x) => structuredClone(x);
export function createDemo({
  wait = (ms) => new Promise((r) => setTimeout(r, ms)),
} = {}) {
  let generation = 0;
  const state = {
    tasks: [],
    snapshots: [],
    artifacts: [],
    runs: [],
    budget: [],
    events: [],
    duty: {
      currentTask: null,
      responsibility:
        "围绕授权合成资料形成候选发现。此页面仅演示协作流程，刷新后重置。",
    },
    runtime: {
      modelOnline: false,
      providerValidated: false,
      busy: false,
      liveSessions: 0,
      restored: false,
      requestLimit: 6,
      simulated: true,
    },
    knowledge: { latestVersion: 1, synthetic: true },
  };
  const event = (kind, detail = {}) =>
    state.events.unshift({
      id: state.events.length + 1,
      created: new Date().toISOString(),
      kind,
      detail: { ...detail, simulated: true },
    });
  const change = (t, status) => {
    t.state = status;
    event("TASK_STATE", { task: t.id, state: status });
  };
  const artifact = (t, type, content) => {
    const a = {
      id: `demo-${t.id}-${type}`,
      taskId: t.id,
      type,
      content: { ...content, simulated: true },
      createdAt: new Date().toISOString(),
    };
    state.artifacts.push(a);
    t.checkpoint[
      type === "RESEARCH" ? "research" : type === "REVIEW" ? "review" : "memo"
    ] = a.id;
    return a;
  };
  event("BOOT");
  async function request(url, options) {
    if (!options)
      return clone(
        url === "/api/state"
          ? state
          : fixtures.memory[state.knowledge.latestVersion],
      );
    const body = JSON.parse(options.body || "{}");
    if (body.key) throw Error("DEMO_DOES_NOT_ACCEPT_KEYS");
    const name = url.split("/").at(-1);
    if (name === "stand-down") {
      generation++;
      state.runtime.modelOnline = false;
      state.runtime.liveSessions = 0;
      for (const t of state.tasks)
        if (t.state.endsWith("_RUNNING")) {
          change(t, "NEEDS_ATTENTION");
          t.checkpoint.reason = "CANCELED";
          t.checkpoint.nextAction = "本页演示已停止，可重置后重新体验";
        }
      event("STAND_DOWN");
      return clone(state);
    }
    if (state.runtime.busy) throw Error("BUSY");
    if (name === "activate") {
      state.runtime.modelOnline = true;
      event("CAPABILITY_ACTIVATED");
      return clone(state);
    }
    if (name === "test-v2") {
      if (!state.tasks.length) throw Error("TEST_BOUNDARY");
      state.knowledge.latestVersion = 2;
      event("TEST_ADMIN_REVISION_CREATED", { revision: "CLM-001:v2" });
      return clone(state);
    }
    if (name === "create-e" || name === "create-f") {
      const id = name === "create-e" ? "E" : "F";
      if (state.tasks.some((t) => t.id === id)) throw Error("TASK_EXISTS");
      if (
        id === "F" &&
        (state.knowledge.latestVersion !== 2 ||
          !state.tasks.some((t) => t.id === "E" && t.state === "MEMO_READY"))
      )
        throw Error("TASK_E_NOT_READY");
      const snapshot = clone(fixtures.snapshots[id]);
      state.snapshots.push(snapshot);
      state.tasks.push({
        id,
        state: "RESEARCH_PENDING",
        context: {
          claim: snapshot.claim,
          asOf: snapshot.asOf,
          snapshotId: snapshot.snapshotId,
          baseRevisionId: snapshot.baseRevisionId,
        },
        checkpoint: { nextAction: "Researcher", unresolvedIssues: [] },
      });
      state.duty.currentTask = id;
      event("TASK_BOUND", { task: id, revision: snapshot.baseRevisionId });
      return clone(state);
    }
    if (name === "abandon") {
      const t = state.tasks.find((t) => t.id === body.taskId);
      if (
        !t ||
        (t.state !== "NEEDS_ATTENTION" &&
          !(t.kind === "REPAIR" && t.state.endsWith("_PENDING")))
      )
        throw Error("TASK_NOT_ABANDONABLE");
      if (
        state.tasks.some(
          (x) =>
            x.kind === "REPAIR" &&
            x.lineage?.parentTaskId === t.id &&
            !["MEMO_READY", "ABANDONED"].includes(x.state),
        )
      )
        throw Error("ACTIVE_CHILD_TASK_EXISTS");
      t.checkpoint.reason = "ABANDONED_BY_HUMAN";
      change(t, "ABANDONED");
      event("TASK_ABANDONED", { task: t.id, simulated: true });
      return clone(state);
    }
    if (name === "create-repair") {
      const t = state.tasks.find((t) => t.id === body.taskId);
      if (
        !t ||
        t.state !== "NEEDS_ATTENTION" ||
        !t.checkpoint.research ||
        !t.checkpoint.review
      )
        throw Error("REPAIR_NOT_ALLOWED");
      const id = `demo-repair-${t.id}`;
      if (!state.tasks.some((x) => x.id === id)) {
        state.tasks.push({
          id,
          kind: "REPAIR",
          state: "RESEARCH_PENDING",
          context: { ...t.context },
          checkpoint: {
            nextAction: "Repair Researcher（演示）",
            unresolvedIssues: [],
          },
          lineage: {
            parentTaskId: t.id,
            snapshotId: t.context.snapshotId,
            inputArtifactId: t.checkpoint.research,
            reviewArtifactId: t.checkpoint.review,
            reason: "演示：按复核意见形成修复稿",
            reviewDecision: "REQUEST_REVISION",
          },
        });
        event("REPAIR_TASK_CREATED", { task: id, parentTask: t.id });
      }
      return clone(state);
    }
    if (name === "start-repair") {
      const t = state.tasks.find((t) => t.id === body.taskId),
        child = t
          ? state.tasks.find(
              (x) =>
                x.kind === "REPAIR" &&
                x.lineage?.parentTaskId === t.id &&
                !["MEMO_READY", "ABANDONED"].includes(x.state),
            )
          : null;
      if (!child) throw Error("REPAIR_TASK_MISSING");
      if (child.state !== "RESEARCH_PENDING")
        throw Error("REPAIR_NOT_STARTABLE");
      return request("/api/resume", {
        body: JSON.stringify({ taskId: child.id }),
      });
    }
    if (name !== "resume") throw Error("NOT_FOUND");
    if (!state.runtime.modelOnline) throw Error("MODEL_CAPABILITY_OFF");
    const t = state.tasks.find((t) => t.id === body.taskId);
    if (!t) throw Error("TASK_MISSING");
    if (t.state === "MEMO_READY") return clone(state);
    if (t.state !== "RESEARCH_PENDING") throw Error("TASK_NOT_RESUMABLE");
    if (state.budget.length + 3 > 6) throw Error("MODEL_BUDGET_EXHAUSTED");
    const token = generation,
      snap = state.snapshots.find(
        (s) =>
          s.taskId === (t.kind === "REPAIR" ? t.lineage.parentTaskId : t.id),
      );
    const check = () => {
      if (token !== generation || !state.runtime.modelOnline)
        throw Error("CANCELED");
    };
    state.runtime.busy = true;
    state.runtime.liveSessions = 1;
    try {
      change(t, "RESEARCH_RUNNING");
      state.budget.push({
        id: state.budget.length + 1,
        state: "SIMULATED",
        detail: { role: "Researcher", simulated: true },
      });
      await wait(900);
      check();
      event("HARNESS_RECORDS_READ", {
        task: t.id,
        snapshotId: snap.snapshotId,
        recordIds: snap.records.map((r) => r.id),
      });
      await wait(900);
      check();
      state.budget.push({
        id: state.budget.length + 1,
        state: "SIMULATED",
        detail: { role: "Researcher", simulated: true },
      });
      const ref = (label) => snap.records.find((r) => r.label === label).id;
      const observations = [
        {
          observation:
            "最大客户收入占比由上年同期 62% 降至 48%，下降 14 个百分点。",
          citations: [ref("R-02")],
          limitations: ["单一客户占比下降，不能独立证明整体集中风险已消失。"],
        },
        {
          observation: "2026 Q2 前三大客户收入占比为 76%，集中度仍需关注。",
          citations: [ref("R-03")],
          limitations: ["本轮没有前三大客户上年同期口径，无法判断其趋势。"],
        },
      ];
      const research = artifact(t, "RESEARCH", {
        observations,
        unresolvedQuestions: ["新增客户预期能否兑现，尚需后续已接纳资料。"],
        ...(t.kind === "REPAIR"
          ? {
              lineage: {
                supersedesArtifactId: t.lineage.inputArtifactId,
                parentTaskId: t.lineage.parentTaskId,
                repairTaskId: t.id,
                reviewArtifactId: t.lineage.reviewArtifactId,
              },
            }
          : {}),
      });
      state.runs.push({
        task: t.id,
        role: "Researcher",
        session: `demo-${t.id}-researcher`,
        state: "SIMULATED_COMPLETE",
      });
      t.checkpoint.unresolvedIssues = research.content.unresolvedQuestions;
      change(t, "REVIEW_RUNNING");
      t.checkpoint.nextAction = "Reviewer";
      await wait(1100);
      check();
      state.budget.push({
        id: state.budget.length + 1,
        state: "SIMULATED",
        detail: { role: "Reviewer", simulated: true },
      });
      artifact(t, "REVIEW", {
        decision: "PASS（预设演示）",
        issues: [],
        reviewLimitations: ["预设复核结果，不是真实模型判断；R-04 仍未接纳。"],
      });
      state.runs.push({
        task: t.id,
        role: "Reviewer",
        session: `demo-${t.id}-reviewer`,
        state: "SIMULATED_COMPLETE",
      });
      artifact(t, "MEMO", {
        observations,
        unresolvedIssues: t.checkpoint.unresolvedIssues,
        authority: {
          humanApproved: false,
          revisionCreated: false,
          evidenceAdmitted: false,
        },
      });
      t.checkpoint.nextAction = "等待人工判断（演示）";
      change(t, "MEMO_READY");
      return clone(state);
    } finally {
      state.runtime.busy = false;
      state.runtime.liveSessions = 0;
    }
  }
  return { request };
}
export const request = createDemo().request;
