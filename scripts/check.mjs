import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const root = fileURLToPath(new URL("../", import.meta.url)),
  files = [];
async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (
      e.name === "node_modules" ||
      e.name === ".git" ||
      e.name === ".deps" ||
      e.name.startsWith(".runtime") ||
      e.name.startsWith(".test-") ||
      e.name.startsWith(".negative-")
    )
      continue;
    const p = join(dir, e.name);
    if (e.isSymbolicLink()) throw Error("Unexpected source symlink");
    if (e.isDirectory()) await walk(p);
    else files.push(p);
  }
}
await walk(root);
let syntax = 0;
for (const p of files) {
  const name = relative(root, p),
    bytes = await readFile(p),
    text = bytes.toString();
  if (bytes.length > 1500000) throw Error("Large source candidate: " + name);
  if (
    /\.(sqlite|db)(-|$)/.test(name) ||
    /\.(log|pid|tgz)$/.test(name) ||
    (/(^|\/)\.env($|\.)/.test(name) && name !== ".env.example")
  )
    throw Error("Runtime/private file candidate: " + name);
  if (
    /\bsk-[A-Za-z0-9]{20,}\b/.test(text) ||
    /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/.test(text) ||
    /\bgh[pousr]_[A-Za-z0-9]{30,}\b/.test(text)
  )
    throw Error("Credential candidate: " + name);
  if (
    /\/Users\/[^/\s]+\//.test(text) ||
    /FlowCredit-Lab\/harness-runtime-/.test(text)
  )
    throw Error("Machine-specific path: " + name);
  if (/\.(mjs|js)$/.test(name)) {
    const r = spawnSync(process.execPath, ["--check", p], { encoding: "utf8" });
    if (r.status) throw Error("Syntax failure " + name + "\n" + r.stderr);
    syntax++;
  }
}
const lock = JSON.parse(await readFile(join(root, "package-lock.json")));
for (const [name, pkg] of Object.entries(lock.packages)) {
  if (
    name.includes("node_modules/@deepseek-ai/dsh-") &&
    pkg.version !== "0.1.5-alpha.1"
  )
    throw Error("Harness version drift: " + name);
}
console.log(
  `Source review passed: ${files.length} files, ${syntax} JS syntax checks; no credential patterns, machine paths, or runtime payloads.`,
);
