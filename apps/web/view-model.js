// A presentation projection only. The runtime remains the authority for every action.
export const taskStates = {
  RESEARCH_PENDING: "待研究",
  RESEARCH_RUNNING: "正在研究",
  REVIEW_PENDING: "待独立复核",
  REVIEW_RUNNING: "正在复核",
  MEMO_PENDING: "待整理备忘",
  MEMO_READY: "候选备忘已就绪",
  NEEDS_ATTENTION: "需要处理",
  RECOVERY_BLOCKED: "恢复受阻",
  ABANDONED: "已放弃",
};
export const reasons = {
  CANCELED: "已由用户停止，未完成结果不予提交。",
  INTERRUPTED_ATTEMPT_COST_UNKNOWN:
    "上次执行中断，请求可能已计费；为避免重复付费，不会自动重跑。",
  EXECUTION_NOT_COMMITTED:
    "执行未能形成有效产物，请查看执行记录；不会自动重试。",
  ARTIFACT_MISSING: "已保存的产物缺失，恢复已停止。",
  ARTIFACT_INTEGRITY: "产物完整性校验失败，恢复已停止。",
  SNAPSHOT_MISMATCH: "固定研究上下文校验失败。",
  ABANDONED_BY_HUMAN: "已由人工放弃；已有产物保留，不会自动重试。",
};
export function project(state) {
  const ready = state.runtime.modelOnline;
  const idle = !state.runtime.busy;
  const remaining = Math.max(
    0,
    state.runtime.requestLimit - state.budget.length,
  );
  const tasks = state.tasks.map((t) => {
    const environment = state.environment?.find((e) => e.taskId === t.id);
    const resumable = [
      "RESEARCH_PENDING",
      "REVIEW_PENDING",
      "MEMO_PENDING",
    ].includes(t.state);
    const cost =
      t.state === "RESEARCH_PENDING" ? 3 : t.state === "REVIEW_PENDING" ? 1 : 0;
    // A Repair Task shell is projected from the same lineage the runtime uses:
    // the public exit for an existing shell is START_REPAIR, never a second
    // creation.
    const repairChild = state.tasks.find(
      (x) =>
        x.kind === "REPAIR" &&
        x.lineage?.parentTaskId === t.id &&
        !["MEMO_READY", "ABANDONED"].includes(x.state),
    );
    const startRepairTaskId =
      repairChild?.state === "RESEARCH_PENDING" ? repairChild.id : null;
    // The runtime stays authoritative; the local projection only mirrors the
    // same deterministic exits when no environment entry is available.
    const allowedActions = environment?.allowedActions ?? [
      ...(t.state === "NEEDS_ATTENTION" &&
      t.checkpoint.research &&
      t.checkpoint.review &&
      !repairChild
        ? ["CREATE_REPAIR_TASK"]
        : []),
      ...(startRepairTaskId ? ["START_REPAIR"] : []),
      ...(["NEEDS_ATTENTION", "RECOVERY_BLOCKED"].includes(t.state)
        ? ["ABANDON_TASK"]
        : []),
      ...(t.kind === "REPAIR" && t.state.endsWith("_PENDING")
        ? ["ABANDON_TASK"]
        : []),
    ];
    return {
      ...t,
      label:
        (t.kind === "REPAIR" ? "修复任务 · " : "") +
        (taskStates[t.state] || t.state),
      allowedActions,
      repairTaskId: environment?.repairTaskId ?? repairChild?.id ?? null,
      startRepairTaskId: environment?.startRepairTaskId ?? startRepairTaskId,
      canStartRepair: environment
        ? environment.canStartRepair
        : ready && idle && !!startRepairTaskId && remaining >= 3,
      reviewProvider: environment?.reviewProvider ?? null,
      canResume: environment
        ? environment.canResume
        : ready && idle && resumable && remaining >= cost,
      explanation:
        reasons[t.checkpoint.reason] ||
        t.checkpoint.reason ||
        (t.state === "MEMO_READY"
          ? "执行已完成；候选备忘尚未经人工接纳。"
          : t.state === "NEEDS_ATTENTION"
            ? "请查看复核意见；修复与放弃都由你显式决定，当前任务不会自动重试。"
            : !resumable
              ? "执行状态已保存。"
              : !ready && t.state !== "MEMO_PENDING"
                ? "提供临时 Key 后可继续，已有工作会保留。"
                : (environment ? !environment.budgetReady : remaining < cost)
                  ? "剩余请求预算不足以完成下一阶段，停止派发。"
                  : "继续时跳过已提交阶段，保持原版本与授权。"),
    };
  });
  return {
    tasks,
    remaining,
    canCreateE: idle && !tasks.some((t) => t.id === "E"),
    canCreateF:
      idle &&
      state.knowledge.latestVersion === 2 &&
      tasks.some((t) => t.id === "E" && t.state === "MEMO_READY") &&
      !tasks.some((t) => t.id === "F"),
    canReviseFixture:
      idle &&
      tasks.some((t) => t.id === "E") &&
      state.knowledge.latestVersion === 1,
    attention: tasks.filter((t) =>
      ["NEEDS_ATTENTION", "RECOVERY_BLOCKED"].includes(t.state),
    ),
    readyMemos: tasks.filter((t) => t.state === "MEMO_READY"),
  };
}
