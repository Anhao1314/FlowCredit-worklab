import { readFile, mkdir, writeFile, rm, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url)),
  lock = JSON.parse(await readFile(join(root, "core.lock.json"))),
  deps = join(root, ".deps"),
  target = join(deps, "flowcredit-core");
await mkdir(deps, { recursive: true });
let bytes;
try {
  bytes = await readFile(join(deps, "core.tgz"));
} catch {}
const sha = (b) => createHash("sha256").update(b).digest("hex");
if (!bytes || sha(bytes) !== lock.sha256) {
  const response = await fetch(lock.archive, {
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw Error("PINNED_CORE_DOWNLOAD_FAILED");
  bytes = Buffer.from(await response.arrayBuffer());
}
if (sha(bytes) !== lock.sha256) throw Error("PINNED_CORE_CHECKSUM_MISMATCH");
await writeFile(join(deps, "core.tgz"), bytes);
const stage = join(deps, "core-stage");
await rm(stage, { recursive: true, force: true });
await mkdir(stage);
const prefix = "flowcredit-research-" + lock.commit;
const members = [...lock.directories, ...lock.files].map(
  (p) => `${prefix}/${p}`,
);
const extraction = spawnSync(
  "tar",
  [
    "-xzf",
    join(deps, "core.tgz"),
    "--strip-components=1",
    "-C",
    stage,
    ...members,
  ],
  { encoding: "utf8" },
);
if (extraction.status !== 0) throw Error("PINNED_CORE_EXTRACTION_FAILED");
await writeFile(
  join(stage, "PINNED.json"),
  JSON.stringify({ commit: lock.commit, sha256: lock.sha256 }),
);
await rm(target, { recursive: true, force: true });
await rename(stage, target);
console.log("Pinned public FlowCredit Core installed and checksum verified.");
