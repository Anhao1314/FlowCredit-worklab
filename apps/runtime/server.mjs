import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "../../packages/control-plane/store.mjs";
import { Runtime } from "../../packages/control-plane/runtime.mjs";
import { ResearchAdapter } from "../../packages/research-adapter/adapter.mjs";
import { seed, createV2 } from "../../fixtures/northstar/seed.mjs";
const project = fileURLToPath(new URL("../../", import.meta.url));
const root = resolve(project, process.env.FLOWCREDIT_RUNTIME_DIR || ".runtime"),
  web = join(project, "apps/web");
if (root === project) throw Error("RUNTIME_MUST_BE_SEPARATE");
const knowledge = join(root, "knowledge"),
  port = Number(process.env.FLOWCREDIT_PORT || 8799);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw Error("INVALID_PORT");
const origin = `http://127.0.0.1:${port}`;
seed(knowledge);
const adapter = new ResearchAdapter(knowledge),
  store = new Store(join(root, "data")),
  runtime = new Runtime(root, store);
await runtime.init();
const status = () => ({
  ...runtime.status(),
  knowledge: {
    mode: "READ ONLY",
    synthetic: true,
    latestVersion: adapter.latestVersion(),
    adapterVersion: "flowcredit-readonly/1",
  },
});
const save = async (name, value) => {
  await mkdir(join(root, "reports"), { recursive: true });
  await writeFile(
    join(root, "reports", name + ".json"),
    JSON.stringify(value, null, 2),
  );
};
const server = createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
  );
  const send = (code, obj) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(obj));
  };
  if (req.headers.host !== `127.0.0.1:${port}`)
    return send(403, { error: "HOST_DENIED" });
  try {
    if (req.method === "GET") {
      if (req.url === "/api/state") return send(200, status());
      const files = {
        "/": "index.html",
        "/app.js": "app.js",
        "/styles.css": "styles.css",
      };
      if (files[req.url]) {
        res.setHeader(
          "Content-Type",
          req.url.endsWith(".js")
            ? "text/javascript"
            : req.url.endsWith(".css")
              ? "text/css"
              : "text/html",
        );
        return res.end(await readFile(join(web, files[req.url])));
      }
      return send(404, { error: "NOT_FOUND" });
    }
    if (
      req.method !== "POST" ||
      req.headers.origin !== origin ||
      req.headers["content-type"] !== "application/json"
    )
      return send(403, { error: "ORIGIN_DENIED" });
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 4096) return send(413, { error: "BODY_TOO_LARGE" });
    }
    let body = JSON.parse(raw || "{}");
    raw = "";
    switch (req.url) {
      case "/api/activate":
        runtime.activate(body.key);
        body.key = "";
        return send(200, status());
      case "/api/create-e":
        if (runtime.busy) throw Error("BUSY");
        store.createBound(
          adapter.snapshot("E", 1, ["R-01", "R-02", "R-03", "R-04"]),
        );
        return send(200, status());
      case "/api/test-v2":
        if (runtime.busy || !store.task("E") || store.task("F"))
          throw Error("TEST_BOUNDARY");
        createV2(knowledge);
        store.event("TEST_ADMIN_REVISION_CREATED", {
          revision: "CLM-001:v2",
          agentWrite: false,
        });
        return send(200, status());
      case "/api/create-f":
        if (runtime.busy || store.task("E")?.state !== "MEMO_READY")
          throw Error("TASK_E_NOT_READY");
        store.createBound(adapter.snapshot("F", 2, ["R-01", "R-02", "R-03"]));
        return send(200, status());
      case "/api/resume": {
        if (!["E", "F"].includes(body.taskId)) throw Error("INVALID_TASK");
        const before = adapter.fingerprints();
        await save(`memory-before-${body.taskId}`, before);
        try {
          await runtime.execute(body.taskId);
        } finally {
          const after = adapter.fingerprints();
          const unchanged = JSON.stringify(before) === JSON.stringify(after);
          await save(`memory-after-${body.taskId}`, {
            ...after,
            unchanged,
            agentResearchMemoryWrites: unchanged ? 0 : null,
          });
          if (!unchanged) throw Error("RESEARCH_MEMORY_CHANGED");
        }
        return send(200, status());
      }
      case "/api/stand-down":
        await runtime.standDown();
        return send(200, status());
      case "/api/secret-check":
        return send(200, await runtime.scan());
      default:
        return send(404, { error: "NOT_FOUND" });
    }
  } catch (e) {
    return send(409, {
      error: /^[A-Z_]+$/.test(e.message) ? e.message : "OPERATION_FAILED",
    });
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(`FlowCredit ready ${origin} PID=${process.pid} model=OFF`),
);
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  server.close();
  await runtime.standDown();
  await runtime.close();
  store.close();
  adapter.close();
  process.exit(0);
}
process.on("SIGINT", close);
process.on("SIGTERM", close);
