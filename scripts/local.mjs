// Local lifecycle helper. No credentials or model requests; data survives stop/start.
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile, open, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
const project = fileURLToPath(new URL("../", import.meta.url));
const root = resolve(
  project,
  process.env.FLOWCREDIT_RUNTIME_DIR || ".runtime/local-platform",
);
const port = Number(process.env.FLOWCREDIT_PORT || 8893);
if (
  !Number.isInteger(port) ||
  port < 1024 ||
  port > 65535 ||
  root === resolve(project)
)
  throw Error("INVALID_LOCAL_CONFIGURATION");
const base = `http://127.0.0.1:${port}`,
  file = join(root, "launcher.json");
const state = async () => {
  try {
    const r = await fetch(base + "/api/state", {
      signal: AbortSignal.timeout(1500),
    });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
};
const readLease = async () => {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
};
const action = process.argv[2] || "start";
await mkdir(root, { recursive: true, mode: 0o700 });
if (action === "start") {
  const current = await state(),
    lease = await readLease();
  if (current) {
    if (
      lease?.pid !== current.runtime.pid ||
      lease?.boot !== current.runtime.boot
    )
      throw Error("PORT_IN_USE_BY_UNMANAGED_RUNTIME");
    console.log(`FlowCredit already running: ${base}`);
  } else {
    const log = await open(join(root, "server.log"), "a", 0o600);
    // Deliberately forward only operational, non-credential environment fields.
    const child = spawn(
      process.execPath,
      [join(project, "apps/runtime/server.mjs")],
      {
        cwd: project,
        detached: true,
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          TMPDIR: process.env.TMPDIR,
          FLOWCREDIT_RUNTIME_DIR: root,
          FLOWCREDIT_PORT: String(port),
        },
        stdio: ["ignore", log.fd, log.fd],
      },
    );
    child.unref();
    await log.close();
    let ready;
    for (let i = 0; i < 60; i++) {
      ready = await state();
      if (ready?.runtime.pid === child.pid) break;
      await delay(100);
    }
    if (ready?.runtime.pid !== child.pid) {
      try {
        child.kill("SIGTERM");
      } catch {}
      throw Error("RUNTIME_START_FAILED");
    }
    await writeFile(
      file,
      JSON.stringify({ pid: child.pid, boot: ready.runtime.boot, port }),
      { mode: 0o600 },
    );
    console.log(
      `FlowCredit ready: ${base}\nModel power: OFF. Research state is persistent.`,
    );
  }
} else if (action === "stop") {
  const current = await state(),
    lease = await readLease();
  if (!current) {
    console.log("FlowCredit is not running. Saved data retained.");
  } else {
    if (
      lease?.pid !== current.runtime.pid ||
      lease?.boot !== current.runtime.boot
    )
      throw Error("REFUSE_TO_STOP_UNMANAGED_RUNTIME");
    const response = await fetch(base + "/api/stand-down", {
      method: "POST",
      headers: { Origin: base, "Content-Type": "application/json" },
      body: "{}",
    });
    if (!response.ok) throw Error("STAND_DOWN_FAILED");
    process.kill(lease.pid, "SIGTERM");
    for (let i = 0; i < 50 && (await state()); i++) await delay(100);
    if (await state()) throw Error("RUNTIME_DID_NOT_STOP");
    await unlink(file).catch(() => {});
    console.log(
      "FlowCredit stopped. Credentials cleared; saved data retained.",
    );
  }
} else if (action === "status") {
  const s = await state();
  console.log(
    JSON.stringify(
      s
        ? {
            url: base,
            pid: s.runtime.pid,
            modelOnline: s.runtime.modelOnline,
            tasks: s.tasks.map((t) => ({ id: t.id, state: t.state })),
            nativeRequests: s.budget.length,
            delegatedRuns: s.delegations.length,
          }
        : { running: false },
      null,
      2,
    ),
  );
} else throw Error("Use start, stop or status");
