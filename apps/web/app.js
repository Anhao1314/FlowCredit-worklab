import { project, taskStates } from "./view-model.js";
import { createScene } from "./creation-scene.js";
const $ = (id) => document.getElementById(id);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let state,
  memory,
  pending = 0,
  stopping = false,
  activating = false,
  requestVersion = 0,
  actionVersion = 0;
let activationRequest = null,
  transportAvailable = true,
  afterIgnition = "#overview";
const phaseText = {
  dormant: "推理休眠 / 研究仍在",
  typing: "意图正在汇聚",
  silence: "接通临时能力",
  attraction: "让两种世界靠近",
  contact: "接触，成为起点",
  wave: "协作结构正在点亮",
  settling: "研究状态已连接",
  resuming: "接回已有的研究",
  online: "能力已就绪 / 研究由你开始",
};
const scene = createScene($("creation-scene"), (phase) => {
  $("ignition").dataset.phase = phase;
  $("ignition-phase").textContent = phaseText[phase] || phase;
  $("ignition-stage").textContent = phaseText[phase] || phase;
});
$("motion").textContent = scene.reduced() ? "开启动效" : "关闭动效";
$("motion").setAttribute("aria-pressed", String(scene.reduced()));
const signatures = new Map();
function html(id, value) {
  if (signatures.get(id) === value) return;
  const element = $(id);
  const opened = [
    ...element.querySelectorAll("details[open][data-disclosure]"),
  ].map((e) => e.dataset.disclosure);
  element.innerHTML = value;
  element.querySelectorAll("details[data-disclosure]").forEach((e) => {
    e.open = opened.includes(e.dataset.disclosure);
  });
  signatures.set(id, value);
}
const list = (items) => (items || []).map((x) => `<li>${esc(x)}</li>`).join("");
const claim = (c, title) =>
  `<div class="claim"><span class="pill">${esc(title)} · 合成记录</span><h2>“${esc(c.text)}”</h2><p>CLM-001 · v${esc(c.version)} <span class="subtle">研究观点，不是模型结论</span></p></div>`;
function source(record, prefix) {
  return `<article class="source" id="${prefix}-${esc(record.id)}" tabindex="-1"><div class="task-head"><b>${esc(record.label)}</b><span class="pill ${record.status === "accepted" ? "accepted" : "candidate"}">${record.status === "accepted" ? "已接纳证据" : "候选材料 · 未接纳"}</span></div><p>${esc(record.text)}</p><p class="subtle">${esc(record.source.title)} · ${esc(record.source.documentDate)} · 合成来源</p><details><summary>来源与原文定位</summary><p>${esc(record.source.publisher)}<br>${esc(record.source.url)}</p><pre>${esc(JSON.stringify({ sourceId: record.sourceId, evidenceId: record.evidenceId, candidateId: record.candidateId, excerpt: record.excerptReference }, null, 2))}</pre><p class="subtle">提供文档与摘录定位；不提供更细的句级或单元格回链。</p></details></article>`;
}
function render() {
  if (!state || !memory) return;
  const p = project(state),
    locked = pending > 0 || stopping;
  $("power").textContent = state.runtime.modelOnline
    ? "已供能 · 停止 / 状态"
    : "Dormant · 激活系统";
  $("power").classList.toggle("online", state.runtime.modelOnline);
  $("budget").textContent =
    `原生请求 ${state.budget.length} / ${state.runtime.requestLimit}${state.delegations ? ` · 外部委派 ${state.delegations.length} / ${state.runtime.delegationLimit}` : ""}`;
  $("task-count").textContent = state.tasks.length;
  $("create-e").disabled = locked || !p.canCreateE;
  $("v2").disabled = locked || !p.canReviseFixture;
  $("create-f").disabled = locked || !p.canCreateF;
  $("key").disabled = locked || state.runtime.modelOnline;
  $("ignition-entry").hidden =
    activating || stopping || state.runtime.modelOnline;
  $("ignition-progress").hidden = !activating && !stopping;
  $("ignition-ready").hidden =
    activating || stopping || !state.runtime.modelOnline;
  $("cancel-ignition").disabled = stopping;
  $("reconnect").hidden = state.runtime.modelOnline;
  if (!activating && !stopping) scene.online(state.runtime.modelOnline);
  $("activation").querySelector("button").disabled =
    locked || state.runtime.modelOnline;
  $("stop").disabled =
    stopping || (!state.runtime.modelOnline && !state.runtime.busy);
  $("activation-status").textContent = activating
    ? "正在激活…"
    : stopping
      ? "正在停止派发并等待执行退出…"
      : state.runtime.modelOnline
        ? state.runtime.providerValidated
          ? "已供能 · 模型请求已返回成功响应"
          : "已供能 · Key 尚待首次研究请求验证"
        : "当前未供能，研究状态已保留。";
  const current =
    p.tasks.find((t) => t.id === state.duty.currentTask) || p.tasks.at(-1);
  html(
    "overview-content",
    `${claim(memory.claim, "当前研究观点")}<div class="next"><div><h2>${p.attention.length ? "有任务需要处理" : p.readyMemos.length ? "候选备忘等待你的判断" : current ? "继续固定版本的研究" : "准备第一项研究"}</h2><p>${esc(p.attention[0]?.explanation || current?.explanation || "先创建任务并固定资料范围，再激活模型并开始研究。")}</p></div><a class="button primary" href="#tasks">${p.attention.length ? "查看原因" : "进入任务协作"}</a></div><div class="planes"><div><b>研究记忆</b><p>只读连接 · 当前 v${state.knowledge.latestVersion}</p><a href="#memory">浏览依据与来源</a></div><div><b>协作执行</b><p>${state.runtime.busy ? "正在执行" : "等待明确任务"} · Researcher / Reviewer</p><a href="#tasks">查看任务与复核</a></div><div><b>持久状态</b><p>${state.runtime.restored ? "已恢复保存的任务" : "当前进程已连接"} · ${state.tasks.length} 项任务</p><a href="#activity">查看执行记录</a></div></div><p class="subtle">${esc(state.duty.responsibility)} 暂无自动触发或后台巡检。</p>`,
  );
  html(
    "memory-content",
    `${claim(memory.claim, "当前研究观点")}<p class="section-note">截止 ${esc(memory.asOf.slice(0, 10))} · 以下资料来自真实 Core 的独立合成库。任务中使用的历史版本请在任务内查看。</p>${memory.records.map((r) => source(r, "memory")).join("")}`,
  );
  html(
    "provider-content",
    state.providers
      ? `<p class="section-note">每个岗位按需启动。停止模型后，任务和产物仍然存在。当前串行执行，不自动驻场。</p>${state.providers.map((p) => `<article class="source"><h2>${esc(p.name)}</h2><p>${p.roles.map(esc).join(" / ")} · ${p.tools === "none" ? "仅消费指定产物与摘录，无工具" : "研究员仅可读取固定快照；复核员无工具"}</p><p>${p.budgetUnit === "modelRequests" ? "按真实模型请求记账，最多六次，自动重试禁用。" : "按外部执行委派记账，最多两次；内部请求数和费用未知，不等于两次模型请求。"}</p><p class="subtle">${p.id === "claude-code" ? "通过官方 SDK 启动独立 Claude Code 进程，使用 DeepSeek 兼容接口。项目配置、MCP、工具与会话保存均关闭。" : "Harness 原生父子会话；程序协调父会话不推理。"}</p></article>`).join("")}`
      : '<p class="empty">公开演示不连接真实执行器。</p>',
  );
  html(
    "task-list",
    p.tasks.length
      ? p.tasks
          .map((t) => {
            const snap = state.snapshots.find(
              (x) => x.snapshotId === t.context.snapshotId,
            );
            const environment = state.environment?.find(
              (e) => e.taskId === t.id,
            );
            const selectedProvider = environment?.reviewer ?? "native-harness";
            const comparisons = state.artifacts.filter(
              (a) =>
                a.taskId === t.id &&
                ["REVIEW_COMPARISON", "REVIEW_REPEAT"].includes(a.type),
            );
            const human = (state.humanReviews ?? []).filter(
              (h) => h.task === t.id,
            );
            const artifact = (key) =>
              state.artifacts.find((x) => x.id === t.checkpoint[key]);
            const research = artifact("research"),
              review = artifact("review"),
              memo = artifact("memo"),
              output = memo || research;
            return `<article class="task" id="task-${t.id}"><div class="task-head"><b>${t.kind === "REPAIR" ? `修复任务 ${t.id} · 由来任务 ${t.lineage.parentTaskId}` : `任务 ${t.id}`} · 固定 v${t.context.claim.version}</b><span class="pill">${esc(t.label)}</span></div><h2>“${esc(t.context.claim.text)}”</h2><p class="subtle">${esc(t.context.snapshotId)} · 截止 ${esc(t.context.asOf.slice(0, 10))} · 授权 ${snap.records.map((r) => esc(r.label)).join(" / ")}</p>${
              environment
                ? `<div class="provider-choice"><label for="reviewer-${t.id}">独立复核执行器</label> <select id="reviewer-${t.id}" data-reviewer="${t.id}" ${locked || !environment.canSelectReviewer ? "disabled" : ""}>${state.providers
                    .filter((p) => p.roles.includes("Reviewer"))
                    .map(
                      (p) =>
                        `<option value="${esc(p.id)}" ${p.id === selectedProvider ? "selected" : ""}>${esc(p.name)}</option>`,
                    )
                    .join(
                      "",
                    )}</select><p class="subtle">${selectedProvider === "claude-code" ? "复核消耗一次外部委派；内部模型请求与费用未知。" : "复核最多一次原生模型请求。"} 首次复核开始后选择锁定。</p></div>`
                : ""
            }<ol class="pipeline"><li class="done">固定目标与授权</li><li class="${research ? "done" : t.state === "RESEARCH_RUNNING" ? "active" : ""}">Researcher · ${research ? "已交付" : t.state === "RESEARCH_RUNNING" ? "研究中" : "待执行"}</li><li class="${review ? "done" : t.state === "REVIEW_RUNNING" ? "active" : ""}">Reviewer · ${review ? "已交付" : t.state === "REVIEW_RUNNING" ? "复核中" : "待执行"}</li><li class="${memo ? "done" : ""}">候选备忘 · ${memo ? "就绪" : "未形成"}</li></ol><p>${esc(t.explanation)}</p>${t.state.endsWith("_PENDING") ? `<button class="primary resume" data-task="${t.id}" ${locked || !t.canResume ? "disabled" : ""}>${t.kind === "REPAIR" ? (t.state === "RESEARCH_PENDING" ? "开始修复" : "继续修复") : t.state === "RESEARCH_PENDING" ? "开始研究" : "继续未完成阶段"}</button>${!state.runtime.modelOnline ? " <button data-power>提供临时 Key</button>" : ""}` : ""}${["NEEDS_ATTENTION", "RECOVERY_BLOCKED"].includes(t.state) ? `<div class="task-exits">${t.repairTaskId ? `<p class="subtle">已创建修复任务 ${esc(t.repairTaskId)}；它不会自动执行，需要你显式开始。</p>` : ""}${t.allowedActions.includes("CREATE_REPAIR_TASK") ? `<button data-create-repair="${t.id}" ${locked ? "disabled" : ""}>创建修复任务</button>` : ""}${t.allowedActions.includes("ABANDON_TASK") ? `<button data-abandon="${t.id}" ${locked ? "disabled" : ""}>放弃任务</button>` : ""}</div>` : ""}
    ${output ? `<section class="candidate-output"><h3>${memo ? "候选研究备忘" : "研究候选 · 尚未形成最终备忘"}</h3><p class="subtle">尚未经人工接纳 · 不改变正式研究记录</p>${output.content.observations.map((o) => `<div class="observation"><p>${esc(o.observation)}</p><div class="refs">${o.citations.map((id) => `<a href="#${t.id}-${esc(id)}" data-source>${esc(snap.records.find((r) => r.id === id)?.label || id)} 查看依据</a>`).join("")}</div><ul class="subtle">${list(o.limitations)}</ul></div>`).join("")}</section>` : '<p class="empty">尚无候选发现。执行者需要先实际读取授权原文。</p>'}
    ${review ? `<section class="review"><h3>独立复核 · ${esc(review.content.decision)}</h3><p class="subtle">模型 Reviewer 的判断，不是人工批准。</p><ul>${list(review.content.issues.map((i) => i.detail))}</ul><ul class="subtle">${list(review.content.reviewLimitations)}</ul></section>` : ""}
    ${t.checkpoint.unresolvedIssues?.length ? `<section class="review"><h3>仍待确认</h3><ul>${list(t.checkpoint.unresolvedIssues)}</ul></section>` : ""}
    ${
      memo && environment
        ? `<section class="review"><h3>你的处理意见</h3><p class="subtle">只记录候选备忘的处理意见，不接纳证据、不修订观点。</p><form data-human="${t.id}"><label for="decision-${t.id}">处理方式</label> <select id="decision-${t.id}" name="decision"><option value="FOLLOW_UP">保留，继续跟进</option><option value="NEEDS_WORK">需要补充研究</option><option value="DISMISS">暂不采用</option></select><label for="note-${t.id}">备注</label><textarea id="note-${t.id}" name="note" maxlength="2000" rows="2" placeholder="记录需要跟进的理由"></textarea><button ${locked ? "disabled" : ""}>保存处理意见</button></form>${human.map((h) => `<p>${esc({ FOLLOW_UP: "保留跟进", NEEDS_WORK: "需要补充", DISMISS: "暂不采用" }[h.decision])} · ${esc(h.note)} <span class="subtle">${esc(new Date(h.created).toLocaleString("zh-CN"))}</span></p>`).join("")}</section><details data-disclosure="${t.id}-compare"><summary>独立对照复核 / 同一执行器重复复核</summary><p>跨执行器对照是一次新的付费复核，只读取相同研究产物与固定摘录；同一执行器的再复核会被明确标为重复复核，不会伪装成跨执行器对照。两者都不会覆盖原备忘或原复核。</p>${state.providers
            .filter((p) => p.roles.includes("Reviewer"))
            .map(
              (p) =>
                `<button data-compare="${t.id}" data-provider="${p.id}" data-mode="${p.id === t.reviewProvider ? "REPEAT_REVIEW" : "CROSS_PROVIDER"}" ${locked || !environment.canCompare || (p.id === "native-harness" ? state.budget.length >= state.runtime.requestLimit : state.delegations.length >= state.runtime.delegationLimit) ? "disabled" : ""}>${p.id === t.reviewProvider ? `使用 ${esc(p.name)} 重复复核（同一执行器）` : `使用 ${esc(p.name)} 对照复核（跨执行器）`}</button>`,
            )
            .join(
              " ",
            )}${comparisons.map((a) => `<div class="review"><b>${a.type === "REVIEW_REPEAT" ? "重复复核 · " : "跨执行器对照 · "}${esc(a.content.workProvider)} · ${esc(a.content.decision)}</b><ul>${list(a.content.issues.map((i) => i.detail))}</ul><ul class="subtle">${list(a.content.reviewLimitations)}</ul><details><summary>产物绑定</summary><pre>${esc(JSON.stringify({ id: a.id, research: a.content.reviewedArtifactId, digest: a.content.consumedResearchDigest }, null, 2))}</pre></details></div>`).join("")}</details>`
        : ""
    }
    <details data-disclosure="${t.id}-sources"><summary>固定版本的授权资料与来源</summary>${snap.records.map((r) => source(r, t.id)).join("")}</details><details data-disclosure="${t.id}-binding"><summary>任务绑定与持久检查点</summary><pre>${esc(JSON.stringify({ kind: t.kind, lineage: t.lineage ?? null, snapshotId: snap.snapshotId, baseRevisionId: snap.baseRevisionId, digest: snap.contentDigest, checkpoint: t.checkpoint }, null, 2))}</pre></details></article>`;
          })
          .join("")
      : '<div class="empty"><h2>从现有观点创建第一项任务</h2><p>创建会固定 v1 与四条资料，不会调用模型。R-04 始终是未接纳候选材料。</p></div>',
  );
  const eventNames = {
    BOOT: "运行时启动",
    REVIEWER_SELECTED: "已选择独立复核执行器",
    EXTERNAL_DELEGATION_STARTED: "外部复核已委派",
    EXTERNAL_DELEGATION_RELEASED: "外部复核进程已结束",
    REVIEW_COMPARISON_COMPLETED: "对照复核已保存",
    REPEAT_REVIEW_COMPLETED: "重复复核已保存",
    REPAIR_TASK_CREATED: "已创建修复任务",
    REPAIR_RESEARCH_COMMITTED: "修复稿已提交为新产物",
    TASK_ABANDONED: "任务已由人工放弃",
    RESEARCH_MEMORY_CHANGED: "研究记忆完整性告警",
    EXECUTOR_RELEASE_FAILED: "执行释放失败（根因已保留）",
    HUMAN_REVIEW_RECORDED: "人工处理意见已保存",
    CAPABILITY_ACTIVATED: "临时能力已激活",
    TASK_BOUND: "任务范围已固定",
    TASK_STATE: "任务状态变化",
    HARNESS_DELEGATION_STARTED: "独立研究步骤已委派",
    HARNESS_DELEGATION_SETTLED: "委派执行已结束，结果仍需校验",
    HARNESS_RECORDS_READ: "已读取授权原文",
    SESSION_RELEASED: "独立会话已释放",
    STAND_DOWN: "协作已停止，Key 已清除",
    TEST_ADMIN_REVISION_CREATED: "合成库新增测试版本",
  };
  html(
    "activity-content",
    `<p>已记账 ${state.budget.length} 次原生请求${state.delegations ? `、${state.delegations.length} 次外部委派` : ""}；${state.runtime.liveSessions} 个当前会话，${state.runtime.liveExternalRuns ?? 0} 个外部执行。${state.runtime.restored ? "已恢复持久研究任务，未恢复任何 Key。" : ""}</p><ol class="timeline">${state.events.map((e) => `<li><time>${esc(new Date(e.created).toLocaleString("zh-CN"))}</time><div><b>${esc(eventNames[e.kind] || e.kind)}</b><p>${esc(e.detail.task ? "任务 " + e.detail.task + " " : "")}${esc(taskStates[e.detail.state] || e.detail.revision || "")}${e.kind === "HARNESS_RECORDS_READ" ? ` · ${e.detail.recordIds.length} 条原文 · ${esc(e.detail.snapshotId)}` : ""}</p><details><summary>事件详情</summary><pre>${esc(JSON.stringify(e.detail, null, 2))}</pre></details></div></li>`).join("")}</ol>`,
  );
  $("process").textContent = JSON.stringify(
    { runs: state.runs, budget: state.budget, delegations: state.delegations },
    null,
    2,
  );
}
async function json(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "SERVICE_UNAVAILABLE");
  return data;
}
async function load() {
  const version = ++requestVersion;
  const [next, view] = await Promise.all([
    json("/api/state"),
    json("/api/memory"),
  ]);
  if (version !== requestVersion) return;
  state = next;
  memory = view;
  if (!transportAvailable) {
    $("ignition-error").textContent = "";
    $("notice").textContent = "已重新连接本地运行时。";
  }
  transportAvailable = true;
  render();
}
const errors = {
  EXTERNAL_REVIEW_FAILED:
    "外部复核未完成。已保留已有产物和委派记录，不自动重跑。",
  EXTERNAL_TOOLS_NOT_EMPTY: "外部执行器未满足无工具限制，已停止。",
  WORK_BUDGET_EXHAUSTED: "剩余预算不足以完成所选流程。",
  DELEGATION_BUDGET_EXHAUSTED: "外部委派预算已用完。",
  POLICY_FROZEN: "复核已开始，执行器选择已锁定。",
  MODEL_CAPABILITY_OFF: "临时模型能力已关闭，请重新激活。",
  MODEL_BUDGET_EXHAUSTED: "请求预算已用完，已停止派发。",
  TASK_NOT_RESUMABLE: "此任务需要人工检查，不能自动重试。",
  REVIEW_RECORD_OUT_OF_SCOPE:
    "复核引用了授权范围外的记录，整份复核被拒绝，未写入任何产物。",
  COMPARISON_PROVIDER_MUST_DIFFER:
    "同一执行器不能标为跨执行器对照；请改用重复复核。",
  REPEAT_REVIEW_REQUIRES_ORIGINAL_PROVIDER:
    "重复复核必须使用原复核执行器。",
  REPAIR_NOT_ALLOWED: "当前任务状态不能创建修复任务。",
  REPAIR_REQUIRES_REVIEW: "创建修复任务需要一份非 PASS 的复核产物。",
  REPAIR_REQUIRES_RESEARCH_ARTIFACT: "没有可修复的研究产物，只能放弃任务。",
  REPAIR_BINDING: "修复绑定校验失败，操作已停止。",
  TASK_NOT_ABANDONABLE: "当前任务状态不能放弃。",
  CANCELED: "执行已停止，未完成结果不会作为成功备忘。",
  BUSY: "已有任务正在执行，请等待或停止协作。",
  KEY_REQUIRED: "请输入有效的非空 Key。",
  OPERATION_FAILED: "操作未完成，请查看执行记录。",
};
async function act(name, body = {}) {
  if (name !== "stand-down" && (pending || stopping)) return;
  const version = ++actionVersion;
  pending++;
  if (name === "stand-down") stopping = true;
  if (name === "activate") {
    activating = true;
    scene.begin();
    $("ignition-error").textContent = "";
    $("ignition-detail").textContent = "等待后端确认临时能力";
  }
  if (name === "stand-down") scene.cancel();
  $("notice").textContent =
    name === "resume"
      ? "研究已派发；可在任务中查看进度，也可随时停止协作。"
      : name === "activate"
        ? "正在提供临时能力…"
        : "正在保存状态…";
  if (name === "activate") $("activation-status").textContent = "正在激活…";
  render();
  try {
    // Serialize cancellation after any in-flight activation so a late HTTP acknowledgement cannot re-power the process.
    if (name === "stand-down" && activationRequest)
      await activationRequest.catch(() => {});
    const request = json("/api/" + name, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    body.key = "";
    if (name === "activate") activationRequest = request;
    await request;
    if (name === "activate" && version === actionVersion) {
      $("ignition-detail").textContent =
        "运行时已接收临时 Key · 尚未发起模型请求";
      await scene.confirm();
    }
    if (version === actionVersion) {
      $("notice").textContent =
        name === "activate"
          ? "系统已供能。请在任务协作中主动开始研究。"
          : name === "stand-down"
            ? "协作已停止，Key 已清除。研究状态已保留。"
            : name === "test-v2"
              ? "合成库已新增 v2；已有任务保持原版本。"
              : name === "create-repair"
                ? "已创建修复任务；它保持原快照，需要你显式开始。"
                : name === "abandon"
                  ? "任务已放弃；已有产物保留，不会自动重试。"
              : "状态已保存。";
      if (name === "activate") {
        $("power-panel").close();
        activating = false;
        location.hash = afterIgnition;
      }
    }
  } catch (e) {
    if (version === actionVersion) {
      $("notice").textContent =
        errors[e.message] || `操作未完成（${e.message}），请查看执行记录。`;
      $("activation-status").textContent = $("notice").textContent;
      if (name === "activate") {
        scene.cancel();
        $("ignition-error").textContent =
          "未能接通运行时。请检查本地服务后重新激活。";
      }
    }
  } finally {
    pending--;
    if (name === "stand-down") stopping = false;
    if (name === "activate") {
      activating = false;
      activationRequest = null;
    }
    await load().catch(disconnected);
  }
}
function disconnected() {
  transportAvailable = false;
  if (activating) {
    actionVersion++;
    scene.cancel();
  }
  $("ignition-entry").hidden = false;
  $("ignition-progress").hidden = true;
  $("ignition-error").textContent =
    "本地运行时连接中断。请启动平台后重试；已有研究仍保留在本地。";
  $("ignition-ready").hidden = true;
  $("power").textContent = "运行时连接中断";
  $("notice").textContent =
    "无法连接本地运行时。当前内容是最后读取的状态；请重新启动平台。";
  document
    .querySelectorAll("#content button, #activation button, #key, #stop")
    .forEach((b) => {
      b.disabled = true;
    });
}
function route() {
  const target = location.hash.slice(1) || "overview";
  const home = target === "ignition";
  document.body.classList.toggle("ignition-mode", home);
  scene.show(home);
  if (!home && activating && !stopping) act("stand-down");
  if (!home) $("key").value = "";
  const page = [
    "overview",
    "research",
    "tasks",
    "memory",
    "activity",
    "providers",
  ].includes(target)
    ? target
    : target === "content"
      ? "overview"
      : target.startsWith("memory-")
        ? "memory"
        : "tasks";
  document.querySelectorAll(".view").forEach((e) => {
    e.hidden = e.id !== page;
  });
  document.querySelectorAll("nav a").forEach((a) => {
    if (a.hash === "#" + page) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  document.body.classList.toggle("office-home", !home && page === "overview");
  if (!home && page === "overview" && !$("office-home").hasAttribute("src")) {
    $("office-home").src = $("office-home").dataset.src;
  }
  const source = document.getElementById(target);
  if (source?.classList.contains("source")) {
    let parent = source.parentElement;
    while (parent) {
      if (parent.tagName === "DETAILS") parent.open = true;
      parent = parent.parentElement;
    }
    source.focus();
    source.scrollIntoView({ block: "center" });
  }
}
function openIgnition() {
  afterIgnition = [
    "#overview",
    "#research",
    "#tasks",
    "#memory",
    "#activity",
    "#providers",
  ].includes(location.hash)
    ? location.hash
    : "#overview";
  location.hash = "#ignition";
}
$("sidebar-toggle").onclick = () => {
  const collapsed = document.body.classList.toggle("sidebar-collapsed");
  $("sidebar-toggle").setAttribute("aria-expanded", String(!collapsed));
  $("sidebar-toggle").setAttribute("aria-label", collapsed ? "展开功能栏" : "收起功能栏");
  $("sidebar-toggle").title = collapsed ? "展开功能栏" : "收起功能栏";
};
$("power").onclick = () => {
  if (state?.runtime.modelOnline) $("power-panel").showModal();
  else openIgnition();
};
$("reconnect").onclick = () => {
  $("power-panel").close();
  openIgnition();
};
$("cancel-ignition").onclick = () => act("stand-down");
$("motion").onclick = () => {
  const reduced = scene.motion();
  $("motion").textContent = reduced ? "开启动效" : "关闭动效";
  $("motion").setAttribute("aria-pressed", String(reduced));
};
$("key").addEventListener("input", () =>
  scene.type($("key").value.trim().length),
);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && activating && !stopping) act("stand-down");
});
$("activation").onsubmit = (e) => {
  e.preventDefault();
  const key = $("key").value;
  if (!key.trim()) {
    $("ignition-error").textContent = "请输入非空 DeepSeek API Key。";
    $("key").focus();
    return;
  }
  $("key").value = "";
  act("activate", { key });
};
$("stop").onclick = () => act("stand-down");
$("create-e").onclick = () => act("create-e");
$("v2").onclick = () => act("test-v2");
$("create-f").onclick = () => act("create-f");
document.addEventListener("click", (e) => {
  const comparison = e.target.closest("[data-compare]");
  if (comparison)
    act("compare-reviewer", {
      taskId: comparison.dataset.compare,
      provider: comparison.dataset.provider,
      mode: comparison.dataset.mode,
    });
  const repair = e.target.closest("[data-create-repair]");
  if (repair) act("create-repair", { taskId: repair.dataset.createRepair });
  const abandon = e.target.closest("[data-abandon]");
  if (abandon) act("abandon", { taskId: abandon.dataset.abandon });
  const b = e.target.closest(".resume");
  if (b) act("resume", { taskId: b.dataset.task });
  if (e.target.closest("[data-power]")) openIgnition();
  const a = e.target.closest("[data-source]");
  if (a) {
    e.preventDefault();
    location.hash = a.getAttribute("href");
    route();
  }
});
document.addEventListener("change", (e) => {
  if (e.target.matches("[data-reviewer]"))
    act("select-reviewer", {
      taskId: e.target.dataset.reviewer,
      provider: e.target.value,
    });
});
document.addEventListener("submit", (e) => {
  const form = e.target.closest("[data-human]");
  if (!form) return;
  e.preventDefault();
  const data = new FormData(form);
  act("human-review", {
    taskId: form.dataset.human,
    decision: data.get("decision"),
    note: data.get("note"),
  });
});
window.addEventListener("hashchange", route);
route();
load().then(route).catch(disconnected);
setInterval(() => load().catch(disconnected), 2000);
