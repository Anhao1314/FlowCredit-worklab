// Hand-written projection fixtures for Swarm Space.
//
// Nothing here is read from the runtime, a model, or a network call: every
// scene is copied by hand from states the platform already has words for. The
// office renders what this file says and nothing else.
//
// SYSTEM STATE DRIVES THE WORLD. THE WORLD NEVER INVENTS SYSTEM STATE.

export const BANNER = "MOCK STATE · READ-ONLY";

/** Scene order is the reading order of the story: idle, work, handover, rest. */
export const SCENE_ORDER = [
  "DORMANT",
  "RESEARCH_RUNNING",
  "RESEARCH_COMPLETE",
  "REVIEW_RUNNING",
  "NEEDS_ATTENTION",
  "MEMO_READY",
  "STAND_DOWN",
  "INTERRUPTED",
];

export const PROJECTION_KEYS = ["power", "task", "agents", "artifacts", "humanGate"];

const TASK_ID = "T-2026-0918-A";
const SNAPSHOT_ID = "S-F-2";
const NATIVE = "native-harness";
const CLAUDE = "claude-code";

// Mock digests. The office shows a prefix and never claims these are real hashes.
const D_RESEARCH = "9f3c1a7d0b45e6218ac4d7f0e1b2935c";
const D_SNAPSHOT = "1d70e4cb93af5820d6e19b7c04f38a2e";
const D_REVIEW = "c40b7f1e8d25a396f0b4e7c19d58203a";
const D_MEMO = "5a2e9c0174fb3d68e0a19c47b28305df";

const task = (state) => ({ id: TASK_ID, title: "北辰算力 · 证据复核", state, snapshot: SNAPSHOT_ID });
const agent = (id, role, provider, pose) => ({ id, role, provider, pose });
const closedGate = (label) => ({ state: "closed", label });

/** One artifact shape: everything the inspector is allowed to show. */
const artifact = (id, kind, state, slot, provider, digest) => ({
  id,
  kind,
  state,
  slot,
  taskId: TASK_ID,
  snapshot: SNAPSHOT_ID,
  provider,
  digest,
});

const dossier = (state, slot) => artifact("A-1", "research", state, slot, NATIVE, D_RESEARCH);
const capsule = (state, slot) => artifact("S-1", "snapshot", state, slot, NATIVE, D_SNAPSHOT);
const report = (state, slot) => artifact("R-1", "review", state, slot, CLAUDE, D_REVIEW);
const memo = (state, slot) => artifact("M-1", "memo", state, slot, NATIVE, D_MEMO);

/**
 * Each entry is `{ label, caption, projection }`.
 * `projection` always carries exactly the five mock fields — nothing more, so
 * the renderer has nothing else it could draw.
 */
export const SCENES = {
  DORMANT: {
    label: "IDLE",
    caption: "办公室空闲：没有任务在运行，没有执行器，也没有产物。",
    projection: {
      power: "dormant",
      task: null,
      agents: [],
      artifacts: [],
      humanGate: closedGate("人工门关闭：没有待决事项"),
    },
  },
  RESEARCH_RUNNING: {
    label: "RESEARCH_RUNNING",
    caption: "Researcher 在实验台整理材料；Research artifact 还在成形——这还不是结论。",
    projection: {
      power: "active",
      task: task("RESEARCH_RUNNING"),
      agents: [agent("E-1", "researcher", NATIVE, "working")],
      artifacts: [dossier("forming", "research-tray"), capsule("bound", "vault-snapshot")],
      humanGate: closedGate("人工门关闭：还没有候选备忘"),
    },
  },
  RESEARCH_COMPLETE: {
    label: "RESEARCH_COMPLETE",
    caption: "Research artifact 已就绪并绑定固定快照，等待移交给 Reviewer。",
    projection: {
      power: "active",
      task: task("REVIEW_PENDING"),
      agents: [agent("E-1", "researcher", NATIVE, "idle")],
      artifacts: [dossier("ready", "research-tray"), capsule("bound", "vault-snapshot")],
      humanGate: closedGate("人工门关闭：复核尚未开始"),
    },
  },
  REVIEW_RUNNING: {
    label: "REVIEW_RUNNING",
    caption: "Artifact 已沿工作流移交复核位；Reviewer 是独立执行器，不是权威。",
    projection: {
      power: "active",
      task: task("REVIEW_RUNNING"),
      agents: [agent("E-1", "researcher", NATIVE, "idle"), agent("E-2", "reviewer", CLAUDE, "working")],
      artifacts: [dossier("under-review", "review-tray"), capsule("bound", "vault-snapshot")],
      humanGate: closedGate("人工门关闭：还没有候选备忘"),
    },
  },
  NEEDS_ATTENTION: {
    label: "NEEDS_ATTENTION",
    caption: "复核没有给出结论：等待人工处理，既不是批准，也不是拒绝。",
    projection: {
      power: "active",
      task: task("NEEDS_ATTENTION"),
      agents: [agent("E-1", "researcher", NATIVE, "idle"), agent("E-2", "reviewer", CLAUDE, "blocked")],
      artifacts: [dossier("flagged", "review-tray"), capsule("bound", "vault-snapshot")],
      humanGate: closedGate("人工门关闭：等待人工处理"),
    },
  },
  MEMO_READY: {
    label: "MEMO_READY",
    caption:
      "Candidate memo 已送达 Human Gate，停在人工决策位。MEMO_READY 不等于证据被接纳，门不会自己打开。",
    projection: {
      power: "active",
      task: task("MEMO_READY"),
      agents: [agent("E-1", "researcher", NATIVE, "idle"), agent("E-2", "reviewer", CLAUDE, "idle")],
      artifacts: [
        dossier("ready", "research-tray"),
        report("ready", "review-tray"),
        memo("awaiting-human", "gate-desk"),
        capsule("bound", "vault-snapshot"),
      ],
      humanGate: { state: "waiting", label: "候选备忘已送达，等待人工决定（本页不会替人打开）" },
    },
  },
  STAND_DOWN: {
    label: "STAND_DOWN",
    caption:
      "执行器撤离，工作台空着：Snapshot、Research artifact、Review artifact 与 Candidate memo 全部留在记忆库。",
    projection: {
      power: "stand-down",
      task: task("STAND_DOWN"),
      agents: [],
      artifacts: [
        dossier("archived", "vault-research"),
        capsule("archived", "vault-snapshot"),
        report("archived", "vault-review"),
        memo("awaiting-human", "vault-memo"),
      ],
      humanGate: closedGate("系统已停止：人工门仍然关闭"),
    },
  },
  INTERRUPTED: {
    label: "INTERRUPTED",
    caption: "执行中断，结果不确定：不自动重跑，也不重复计费。未提交的部分不会凭空出现。",
    projection: {
      power: "interrupted",
      task: task("INTERRUPTED"),
      agents: [agent("E-1", "researcher", NATIVE, "paused")],
      artifacts: [dossier("result-unknown", "research-tray"), capsule("bound", "vault-snapshot")],
      humanGate: closedGate("人工门关闭：中断的尝试没有结论"),
    },
  },
};

/** Review aid only: `?scene=NAME` picks a fixture. The page never picks by itself. */
export const DEFAULT_SCENE = "RESEARCH_RUNNING";

export function sceneNames() {
  return Object.keys(SCENES);
}

export function scene(name) {
  const entry = SCENES[name];
  if (!entry) throw Error("UNKNOWN_SCENE: " + name);
  return entry;
}

/** Digests are mock strings; the office shows a prefix, never a full hash. */
export function digestPrefix(digest, length = 8) {
  return String(digest).slice(0, length);
}
