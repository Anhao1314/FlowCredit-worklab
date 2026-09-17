import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Runtime } from "../../packages/control-plane/runtime.mjs";

test("credential scan reports metadata, never matched contents; unavailable is distinct from clean", async () => {
  const root = await mkdtemp(join(tmpdir(), "fc-scanner-unit-"));
  const canary = "FLOWCREDIT_D0_CANARY_" + randomUUID();
  let active = true;
  const runtime = new Runtime(root, null);
  runtime.credentials = { hasPower: () => active, contains: text => active && text.includes(canary) };
  try {
    await writeFile(join(root, "scanner-owned-fixture.json"), JSON.stringify({ synthetic: canary }));
    await writeFile(join(root, "clean.json"), "{}");
    const scan = await runtime.scan();
    assert.equal(scan.hits, 1);
    assert.equal(scan.matches[0].path, join(root, "scanner-owned-fixture.json"));
    assert.equal(scan.matches[0].type, "JSON");
    assert.equal(scan.exactMatchAvailable, true);
    assert.equal(JSON.stringify(scan).includes(canary), false);
    active = false;
    assert.equal((await runtime.scan()).exactMatchAvailable, false);
  } finally { await rm(root, { recursive: true }); }
});
