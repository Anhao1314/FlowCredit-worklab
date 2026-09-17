const $ = (id) => document.getElementById(id),
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
let busy = false,
  last = "";
async function load() {
  const s = await fetch("/api/state").then((r) => r.json());
  $("power").textContent = s.runtime.modelOnline
    ? "Swarm Online · Capability Ready"
    : "Dormant · Model Offline";
  $("power").className = "pill " + (s.runtime.modelOnline ? "online" : "");
  $("restored").textContent = s.runtime.restored
    ? "Research State Restored"
    : "Northstar Continuous Research";
  $("boot").textContent =
    `PID ${s.runtime.pid} · ${s.runtime.liveSessions} 个会话 · 浏览器存储 ${localStorage.length + sessionStorage.length} 项`;
  $("memory").textContent =
    `Research Memory · READ ONLY · 测试库当前 v${s.knowledge.latestVersion}`;
  $("budget").textContent =
    `已记账 ${s.budget.length} / 6 次真实请求 · 含工具后的模型续轮`;
  $("create-e").disabled = busy || s.tasks.some((t) => t.id === "E");
  $("v2").disabled = busy || !s.tasks.length || s.knowledge.latestVersion === 2;
  $("create-f").disabled =
    busy ||
    !s.tasks.some((t) => t.id === "E" && t.state === "MEMO_READY") ||
    s.tasks.some((t) => t.id === "F");
  $("key").disabled = busy || s.runtime.modelOnline;
  const sig = JSON.stringify([
    s.tasks,
    s.artifacts,
    s.runtime.modelOnline,
    s.runtime.busy,
    busy,
  ]);
  if (sig !== last) {
    last = sig;
    $("tasks").innerHTML = s.tasks
      .map((t) => {
        const snap = s.snapshots.find(
            (x) => x.snapshotId === t.context.snapshotId,
          ),
          a = s.artifacts.find(
            (x) => x.id === (t.checkpoint.memo || t.checkpoint.research),
          );
        return `<article class="task"><div class="task-head"><strong>Task ${t.id} · Bound to v${t.context.claim.version}</strong><span class="pill">${esc(t.state)}</span></div><h2>“${esc(t.context.claim.text)}”</h2><div class="steps"><span>Snapshot ${esc(t.context.snapshotId)}</span><span>As Of ${esc(t.context.asOf.slice(0, 10))}</span><span>授权 ${snap.records.map((r) => r.label).join(" / ")}</span></div><p class="subtle">下一步：${esc(t.checkpoint.nextAction)} ${esc(t.checkpoint.reason || "")}</p><button class="primary resume" data-task="${t.id}" ${busy || s.runtime.busy || !s.runtime.modelOnline ? "disabled" : ""}>Resume Task ${t.id}</button>${
          a
            ? '<p class="subtle">AI-assisted candidate · No Evidence Admission · No Claim Revision Applied</p>' +
              a.content.observations
                .map(
                  (o) =>
                    `<div class="observation"><p>${esc(o.observation)}</p><div class="refs">${o.citations
                      .map((id) => {
                        const r = snap.records.find((r) => r.id === id);
                        return `<a href="#${t.id}-${id}">${esc(r?.label || id)} ↗</a>`;
                      })
                      .join(
                        "",
                      )}</div><p class="subtle">${esc(o.limitations.join("；"))}</p></div>`,
                )
                .join("")
            : '<p class="subtle">尚无候选发现。Researcher 必须先通过工具读取授权原文。</p>'
        }<details><summary>查看固定来源、真实对象标识与绑定</summary>${snap.records.map((r) => `<div class="source" id="${t.id}-${r.id}"><b>${r.label}</b> · ${r.status === "accepted" ? "已接纳 · 合成测试" : "Pending · 未接纳候选"}<br>${esc(r.text)}<p class="subtle">Record: ${esc(r.id)}<br>Source: ${esc(r.sourceId)}<br>Excerpt: ${esc(r.chunkId)}</p></div>`).join("")}<pre>${esc(JSON.stringify({ snapshotId: snap.snapshotId, baseRevisionId: snap.baseRevisionId, digest: snap.contentDigest, checkpoint: t.checkpoint }, null, 2))}</pre></details></article>`;
      })
      .join("");
  }
  $("process").textContent = JSON.stringify(
    { runs: s.runs, budget: s.budget, events: s.events },
    null,
    2,
  );
}
async function act(name, body = {}) {
  busy = true;
  $("notice").textContent = name === "activate" ? "Activating…" : "正在处理…";
  load();
  try {
    const req = fetch("/api/" + name, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    body.key = "";
    const r = await req,
      x = await r.json();
    if (!r.ok) throw Error(x.error);
    $("notice").textContent =
      name === "test-v2"
        ? "测试库已新增 v2；Task E 的 S1 仍绑定 v1。"
        : "状态已保存。";
  } catch (e) {
    $("notice").textContent = e.message;
  } finally {
    busy = false;
    await load();
  }
}
$("activation").onsubmit = (e) => {
  e.preventDefault();
  const key = $("key").value;
  $("key").value = "";
  act("activate", { key });
};
$("create-e").onclick = () => act("create-e");
$("v2").onclick = () => act("test-v2");
$("create-f").onclick = () => act("create-f");
$("stop").onclick = () => act("stand-down");
document.addEventListener("click", (e) => {
  const b = e.target.closest(".resume");
  if (b) act("resume", { taskId: b.dataset.task });
  const a = e.target.closest('a[href^="#"]');
  if (a) a.closest("article").querySelector("details").open = true;
});
load();
setInterval(
  () =>
    load().catch(() => {
      $("power").textContent = "服务已退出";
    }),
  2500,
);
