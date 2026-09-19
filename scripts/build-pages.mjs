import { mkdir, readFile, writeFile, cp, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { seed, createV2 } from "../fixtures/northstar/seed.mjs";
import { ResearchAdapter } from "../packages/research-adapter/adapter.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const output = join(root, ".pages");
const temporary = await mkdtemp(join(root, ".test-pages-"));
let adapter;
try {
  seed(temporary);
  adapter = new ResearchAdapter(temporary);
  const E = adapter.snapshot("E", 1, ["R-01", "R-02", "R-03", "R-04"]);
  const memory = (s) => ({
    claim: s.claim,
    records: s.records,
    asOf: s.asOf,
    synthetic: true,
  });
  createV2(temporary);
  const F = adapter.snapshot("F", 2, ["R-01", "R-02", "R-03"]);
  const v2 = adapter.snapshot("F", 2, ["R-01", "R-02", "R-03", "R-04"]);
  await mkdir(output, { recursive: true });
  for (const name of [
    "app.js",
    "index.html",
    "styles.css",
    "ignition.css",
    "creation-scene.js",
    "ignition-state.js",
    "view-model.js",
    "assets",
  ])
    await cp(join(root, "apps/web", name), join(output, name), {
      recursive: true,
    });
  // Keep the standalone server and development notes out of the public artifact.
  for (const name of [
    "index.html", "main.js", "office-scene.js", "organization-story.js", "organization-scene.js", "scene.js", "fixtures.js",
    "assets.js", "game-loop.js", "swarm-space.css",
    "vendor/munder-difflin/portrait-art.js", "vendor/munder-difflin/LICENSE",
  ]) {
    const dest = join(output, "swarm-space", name);
    await mkdir(join(dest, ".."), { recursive: true });
    await cp(join(root, "apps/web/swarm-space", name), dest);
  }
  await cp(join(root, "THIRD_PARTY_NOTICES.md"), join(output, "swarm-space/THIRD_PARTY_NOTICES.md"));
  await cp(
    join(root, "apps/pages/demo-runtime.js"),
    join(output, "demo-runtime.js"),
  );
  await writeFile(
    join(output, "demo-fixture.js"),
    "export default " +
      JSON.stringify({
        snapshots: { E, F },
        memory: { 1: memory(E), 2: memory(v2) },
      }) +
      ";\n",
  );
  let app = await readFile(join(output, "app.js"), "utf8");
  const start = app.indexOf("async function json("),
    end = app.indexOf("async function load()", start);
  if (start < 0 || end < 0) throw Error("APP_TRANSPORT_SEAM_CHANGED");
  app =
    'import { request as json } from "./demo-runtime.js";\n' +
    app.slice(0, start) +
    app.slice(end);
  const from = app.indexOf('$("activation").onsubmit ='),
    to = app.indexOf('$("stop").onclick', from);
  if (from < 0 || to < 0) throw Error("ACTIVATION_SEAM_CHANGED");
  app =
    app.slice(0, from) +
    '$("activation").onsubmit = e => {e.preventDefault();act("activate");};\n' +
    app.slice(to);
  const wording = [
    ["真实 Core", "公开合成快照"],
    ["模型 Reviewer 的判断，不是人工批准。", "预设 Reviewer 演示反馈，不是模型判断或人工批准。"],
    ["真实", "模拟"],
    ["持久", "本页"],
    ["当前进程已连接", "当前演示已就绪"],
    ["运行时", "模拟流程"],
    ["清除 Key", "停止模拟"],
    ["等待后端确认临时能力", "准备本页演示"],
    [
      "模拟流程已接收临时 Key · 尚未发起模型请求",
      "本页模拟已就绪 · 没有模型请求",
    ],
    ["Key 尚待首次研究请求验证", "无需 Key · 无真实 AI 调用"],
    ["提供临时 Key", "启动演示"],
    ["Key 已清除", "模拟能力已关闭"],
    ["提供临时能力", "启动本页演示"],
    ["提供临时 Key 后可继续", "启动演示后可继续"],
    ["次请求", "次模拟动作"],
    ["请求预算", "模拟动作预算"],
    ["请求已返回成功响应", "演示已就绪"],
    ["后端", "演示状态"],
    ["本地运行时", "本页演示"],
    ["已供能", "演示已点亮"],
    ["重新激活", "重新开始演示"],
    ["激活系统", "启动演示"],
    ["浏览器或研究记录", "浏览器存储"],
    ["模拟模拟流程", "预设演示"],
    ["停止协作并停止模拟", "停止演示"],
    ["取消激活并停止模拟", "取消演示"],
    [
      "先创建任务并固定资料范围，再激活模型并开始研究。",
      "先创建任务并固定资料范围，再启动预设研究演示。",
    ],
  ];
  for (const [a, b] of wording) app = app.split(a).join(b);
  app +=
    '\ndocument.getElementById("reset-demo").onclick=()=>{location.hash="#ignition";location.reload();};\n';
  await writeFile(join(output, "app.js"), app);
  let html = await readFile(join(output, "index.html"), "utf8");
  html = html.replace(
    /<input[\s\S]*?id="key"[\s\S]*?\/>/,
    '<input id="key" type="hidden">',
  );
  // No real-key collection or submission exists in the public artifact.
  html = html
    .replace(
      'class="sidebar-collapsed"',
      'class="sidebar-collapsed" data-public-demo="true"',
    )
    .replace("<body class=", "<body class=");
  html = html.replace(
    "<section",
    '<div class="public-demo-label">公开演示 · 合成资料 · 无真实 AI 调用 <button id="reset-demo">重置演示</button></div><section',
  );
  html = html.replace(
    "<title>FlowCredit · 研究协作平台</title>",
    "<title>FlowCredit · 公开交互演示</title>",
  );
  for (const [a, b] of wording) html = html.split(a).join(b);
  html = html
    .replace(
      "Key 仅存进程内存 · 不写入浏览器存储",
      "无需真实 Key · 所有结果均为预设演示",
    )
    .replace("DeepSeek API Key", "演示启动")
    .replace(
      "临时能力已就绪 · 首次研究请求才验证 Key",
      "本页演示已就绪 · 不连接任何模型",
    );
  html = html.replace(
    /提供 DeepSeek Key 后，任务可调用模拟模型。已有研究记录始终可读。/,
    "本页使用预设合成结果。已有研究记录始终可读。",
  );
  html = html.replace(
    /激活不发起付费请求；首次研究请求验证[\s\S]*?不写入浏览器存储。/,
    "不会请求真实模型。停止保留本页状态，刷新或重置会清空演示进度。",
  );
  html = html
    .replace("让意图接通智能。", "让意图接通智能。")
    .replace(
      "</head>",
      "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'self'; connect-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'\"></head>",
    );
  html = html
    .replace("无模拟 AI 调用", "无真实 AI 调用")
    .replace(
      /提供 DeepSeek Key 后，[\s\S]*?已有研究记录始终可读。/,
      "本页使用预设合成结果，不连接任何模型。研究记录始终可读。",
    )
    .replace(
      "模型提供临时推理能力。任务与研究记忆分别保存。",
      "本页模拟研究协作；刷新会重置进度，不保存任何输入。",
    );
  await writeFile(join(output, "index.html"), html);
  let scene = await readFile(join(output, "creation-scene.js"), "utf8");
  scene = scene.replace(
    'paint.src = "/assets/creation-of-adam.jpg";',
    'paint.src = new URL("./assets/creation-of-adam.jpg",import.meta.url).href;',
  );
  await writeFile(join(output, "creation-scene.js"), scene);
  let vm = await readFile(join(output, "view-model.js"), "utf8");
  vm = vm.replace(
    "提供临时 Key 后可继续，已有工作会保留。",
    "启动演示后可继续；刷新会重置本页状态。",
  );
  await writeFile(join(output, "view-model.js"), vm);
  const css =
    "\n.public-demo-label{position:fixed;bottom:0;left:0;right:0;z-index:20;background:#173342;color:#e3edf3;padding:5px 14px;text-align:center;font-size:11px}.public-demo-label button{padding:2px 9px;margin-left:12px;font-size:11px}body[data-public-demo]{padding-bottom:34px}body[data-public-demo] #ignition{height:calc(100svh - 34px)}body[data-public-demo] #activation button{width:100%}body[data-public-demo] #key{display:none}\n";
  await writeFile(
    join(output, "styles.css"),
    (await readFile(join(output, "styles.css"), "utf8")) + css,
  );
  await writeFile(join(output, ".nojekyll"), "");
  console.log(
    "Pages artifact built from allowlisted web assets and synthetic Core seed only.",
  );
} finally {
  adapter?.close();
  await rm(temporary, { recursive: true, force: true });
}
