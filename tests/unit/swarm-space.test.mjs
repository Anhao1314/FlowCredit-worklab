// Swarm Space is a visual layer, but its one rule is a safety rule:
// SYSTEM STATE DRIVES THE WORLD. THE WORLD NEVER INVENTS SYSTEM STATE.
// This suite holds the office to that rule and to its own isolation promises.
//
// PREVIOUS TEST COVERAGE NOT EXACTLY RECOVERABLE.
// The earlier suite lived in this path while the working tree was still
// untracked, so Git cannot restore it and no copy survives on disk. This file
// is a REBUILD from the current spike sources, the spike README, the projected
// contract `{power, task, agents, artifacts, humanGate}` and the approved V0.6
// design spec. It is not a restoration, and it does not claim to be one.
// Coverage deliberately asserted here: eight fixtures, projection shape,
// no fetch / WebSocket / SSE / storage, no Math.random, no product imports,
// state that cannot move with the clock, stand-down retention, a gate that
// never opens, provider as metadata only, furniture as layout rather than
// state, and a read-only mock page.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { AGENT_SIZE, ARTIFACT_SIZE, KIND_STYLE, PROVIDER_STYLE, providerStyle } from "../../apps/web/swarm-space/assets.js";
import { BANNER, PROJECTION_KEYS, SCENE_ORDER, SCENES, digestPrefix, scene } from "../../apps/web/swarm-space/fixtures.js";
import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  SLOTS,
  STAGE_KEYS,
  STAGE_TITLES,
  VAULT_LABELS,
  ZONES,
  appearedIds,
  artifactBox,
  artifactFacts,
  artifactMotion,
  buildLayout,
  decorationAt,
  drawWorld,
  flowState,
  gateBox,
  pickAt,
  pipelineStages,
  pointOnPath,
  transferPlan,
} from "../../apps/web/swarm-space/scene.js";

const dir = new URL("../../apps/web/swarm-space/", import.meta.url);
const read = (name) => readFileSync(new URL(name, dir), "utf8");
const codeFiles = readdirSync(dir).filter((name) => /\.(js|mjs|html|css)$/.test(name));

const AGENT_LAYOUT = { researcher: { role: "researcher" }, reviewer: { role: "reviewer" } };
const POSES = new Set(["working", "blocked", "paused", "idle"]);

/**
 * Minimal DOM double. It records every drawing call the office makes and
 * returns inert objects for the canvas factories, so a frame can be inspected
 * in Node without a browser.
 */
function recordingContext() {
  const ops = [];
  const record =
    (name) =>
    (...args) => {
      ops.push([name, ...args]);
    };
  const gradient = () => {
    const stops = [];
    ops.push(["gradient", stops]);
    return { addColorStop: (offset, color) => stops.push([offset, color]) };
  };
  return {
    ops,
    fillStyle: "#000000",
    strokeStyle: "#000000",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    font: "500 12px sans-serif",
    textAlign: "left",
    textBaseline: "alphabetic",
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    shadowColor: "rgba(0, 0, 0, 0)",
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    save: record("save"),
    restore: record("restore"),
    translate: record("translate"),
    rotate: record("rotate"),
    scale: record("scale"),
    setTransform: record("setTransform"),
    resetTransform: record("resetTransform"),
    beginPath: record("beginPath"),
    closePath: record("closePath"),
    moveTo: record("moveTo"),
    lineTo: record("lineTo"),
    arc: record("arc"),
    arcTo: record("arcTo"),
    ellipse: record("ellipse"),
    quadraticCurveTo: record("quadraticCurveTo"),
    bezierCurveTo: record("bezierCurveTo"),
    rect: record("rect"),
    clip: record("clip"),
    setLineDash: record("setLineDash"),
    stroke: record("stroke"),
    fill: record("fill"),
    fillRect: record("fillRect"),
    strokeRect: record("strokeRect"),
    clearRect: record("clearRect"),
    fillText: record("fillText"),
    strokeText: record("strokeText"),
    createLinearGradient: (...args) => {
      ops.push(["createLinearGradient", ...args]);
      return gradient();
    },
    createRadialGradient: (...args) => {
      ops.push(["createRadialGradient", ...args]);
      return gradient();
    },
    measureText(value) {
      const size = Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? 12);
      return { width: String(value).length * size * 0.56 };
    },
  };
}

const texts = (ctx) => ctx.ops.filter(([op]) => op === "fillText").map(([, value]) => value);
const countText = (ctx, value) => texts(ctx).filter((text) => text === value).length;
const layoutOf = (name) => buildLayout(scene(name).projection);

function render(name, extra = {}) {
  const { projection } = scene(name);
  const layout = buildLayout(projection);
  const ctx = recordingContext();
  drawWorld(ctx, { projection, layout, timeMs: 0, ...extra });
  return { ctx, layout, projection };
}

test("the eight review fixtures are present, in reading order, and unknown names throw", () => {
  assert.deepEqual(Object.keys(SCENES).sort(), SCENE_ORDER.slice().sort());
  for (const name of [
    "DORMANT",
    "RESEARCH_RUNNING",
    "RESEARCH_COMPLETE",
    "REVIEW_RUNNING",
    "NEEDS_ATTENTION",
    "MEMO_READY",
    "STAND_DOWN",
    "INTERRUPTED",
  ])
    assert(SCENE_ORDER.includes(name), name + " is a fixture the story needs");
  assert.throws(() => scene("NOT_A_SCENE"), /UNKNOWN_SCENE/);
});

test("every fixture projects exactly the five mock fields and claims no authority", () => {
  for (const name of SCENE_ORDER) {
    const { projection } = scene(name);
    assert.deepEqual(Object.keys(projection).sort(), PROJECTION_KEYS.slice().sort(), name + " projects the contract");
    const flat = JSON.stringify(projection);
    assert(!/permission|authority|approval|accepted|approved/i.test(flat), name + " claims no permission level");
    assert.equal(typeof JSON.parse(flat).power, "string", name + " declares a power state");
    assert(["closed", "waiting"].includes(projection.humanGate.state), name + " declares a real gate state");
  }
});

test("fixtures never use an unknown slot, provider, kind, role or pose", () => {
  for (const name of SCENE_ORDER) {
    const { projection } = scene(name);
    for (const item of projection.artifacts) {
      assert(SLOTS[item.slot], name + " slot " + item.slot + " is a real place");
      assert(PROVIDER_STYLE[item.provider], name + " provider " + item.provider + " is a known runtime");
      assert(KIND_STYLE[item.kind], name + " kind " + item.kind + " is a work object");
      assert.equal(item.taskId, projection.task?.id, name + " binds every artifact to the projected task");
      assert.equal(item.snapshot, projection.task?.snapshot, name + " binds every artifact to the fixed snapshot");
    }
    for (const agent of projection.agents) {
      assert(AGENT_LAYOUT[agent.role], name + " role " + agent.role + " is a research or review seat");
      assert(PROVIDER_STYLE[agent.provider], name + " provider " + agent.provider + " is a known runtime");
      assert(POSES.has(agent.pose), name + " pose " + agent.pose + " is a declared pose");
    }
  }
  assert.throws(() => buildLayout({ agents: [], artifacts: [{ id: "X", slot: "nowhere" }] }), /UNKNOWN_SLOT/);
});

test("providers and digests stay metadata: they label provenance and rank nobody", () => {
  for (const id of Object.keys(PROVIDER_STYLE)) {
    const style = providerStyle(id);
    assert.equal(style.label, id, id + " labels itself");
    assert.equal(typeof style.color, "string", id + " has a provenance colour");
    assert(!/authority|permission|primary|senior|trusted/i.test(JSON.stringify(style)), id + " claims no rank");
  }
  const unknown = providerStyle("future-provider");
  assert.equal(unknown.label, "future-provider", "an unknown runtime is still labelled, never ranked");
  assert.deepEqual(
    Object.keys(providerStyle("native-harness")).sort(),
    Object.keys(unknown).sort(),
    "every runtime gets the same shape of badge",
  );
  const facts = Object.fromEntries(artifactFacts(layoutOf("MEMO_READY").artifacts.find((item) => item.kind === "memo")));
  assert.equal(facts.digest, digestPrefix("5a2e9c0174fb3d68e0a19c47b28305df"));
  assert.equal(facts.digest.length, 8, "the office shows a prefix, never a full hash");
  assert(!/approv|accept|permission|rank/i.test(Object.values(facts).join(" ")), "facts are provenance, not authority");
});

test("advancing the clock changes no state, no layout and not one word", () => {
  for (const name of SCENE_ORDER) {
    const { projection } = scene(name);
    assert.equal(JSON.stringify(buildLayout(projection)), JSON.stringify(buildLayout(projection)), name + " is stable");
    assert.deepEqual(decorationAt(0, 1), decorationAt(0, 1), "decoration is deterministic");
    assert.notDeepEqual(decorationAt(0, 1), decorationAt(5000, 1), "decoration still breathes");
    for (const value of Object.values(decorationAt(12345, 2))) assert(Number.isFinite(value), "decoration stays finite");
    for (const value of Object.values(decorationAt(12345, 2, true)))
      assert.equal(value, 0, "reduced motion is still, and stillness is not a state");
  }
  for (const name of SCENE_ORDER) {
    const early = render(name, { timeMs: 0 });
    const late = render(name, { timeMs: 9999 });
    assert.deepEqual(texts(late.ctx), texts(early.ctx), name + " says the same thing at every clock time");
    assert.deepEqual(late.layout, early.layout, name + " has a clock-free layout");
  }
});

test("work objects move only along a fixture transition, and land exactly on their slot", () => {
  const layouts = new Map(SCENE_ORDER.map((name) => [name, buildLayout(scene(name).projection)]));
  assert.deepEqual(transferPlan(null, layouts.get("RESEARCH_RUNNING")), [], "the first fixture moves nothing");
  for (const name of SCENE_ORDER)
    assert.deepEqual(transferPlan(layouts.get(name), layouts.get(name)), [], name + " is a no-op against itself");
  for (const from of SCENE_ORDER) {
    for (const to of SCENE_ORDER) {
      const previous = layouts.get(from);
      const next = layouts.get(to);
      const plan = transferPlan(previous, next);
      for (const entry of plan) {
        const before = previous.artifacts.find((item) => item.id === entry.id);
        const after = next.artifacts.find((item) => item.id === entry.id);
        assert(before && after, from + "->" + to + " moves a work object that exists on both sides");
        assert.notEqual(before.slot, after.slot, from + "->" + to + " never animates a stationary object");
        assert.deepEqual(entry.from, { x: before.x, y: before.y }, from + "->" + to + " starts where the object was");
        assert.deepEqual(entry.to, { x: after.x, y: after.y }, from + "->" + to + " ends where the fixture puts it");
        assert.deepEqual(pointOnPath(entry.path, 0), entry.from, "the route starts on the slot");
        assert.deepEqual(pointOnPath(entry.path, 1), entry.to, "the route ends on the slot");
      }
      const moving = new Set(plan.map((entry) => entry.id));
      for (const item of next.artifacts)
        if (!moving.has(item.id))
          assert.equal(
            previous.artifacts.find((entry) => entry.id === item.id)?.slot ?? item.slot,
            item.slot,
            from + "->" + to + " does not move " + item.id,
          );
      const motion = artifactMotion(plan, 1e6);
      for (const entry of plan) {
        assert.deepEqual({ x: motion.get(entry.id).x, y: motion.get(entry.id).y }, entry.to);
        assert.equal(motion.get(entry.id).moving, false, "a finished transfer stops moving");
      }
    }
  }
  const settled = artifactMotion(transferPlan(layouts.get("RESEARCH_RUNNING"), layouts.get("REVIEW_RUNNING")), 0);
  for (const [, value] of settled) assert.equal(value.moving, true, "a fresh transfer is in flight");
});

test("a fixture that introduces a work object fades it in instead of teleporting it", () => {
  const dormant = layoutOf("DORMANT");
  const running = layoutOf("RESEARCH_RUNNING");
  const standDown = layoutOf("STAND_DOWN");
  assert.equal(appearedIds(dormant, running).size, 2, "the first working fixture introduces its work objects");
  assert.equal(appearedIds(running, running).size, 0, "switching to the same fixture introduces nothing");
  assert.equal(appearedIds(running, standDown).size, 2, "stand-down files two more objects than the running fixture");
});

test("stand-down: the agents are gone, the work remains, and the gate is still closed", () => {
  const { projection } = scene("STAND_DOWN");
  const layout = buildLayout(projection);
  assert.equal(projection.agents.length, 0, "no executor is left on the floor");
  assert.equal(projection.humanGate.state, "closed", "the run stopping does not open the gate");
  assert.equal(layout.agents.length, 0, "the layout staffs nobody");
  assert.equal(projection.artifacts.length, 4, "four work objects survive the session");
  for (const item of projection.artifacts)
    assert(item.slot.startsWith("vault-"), item.id + " is retained in the memory archive");
  assert.equal(new Set(projection.artifacts.map((item) => item.kind)).size, 4, "one object of every kind is kept");
  const { ctx } = render("STAND_DOWN");
  const spoken = texts(ctx).join("\n");
  assert(spoken.includes("Agents are gone. The work remains."), "the stand-down line is drawn");
  assert(/智能体会离开，但.*留下/.test(spoken), "the stand-down line is drawn in Chinese too");
  for (const name of SCENE_ORDER) {
    if (name === "STAND_DOWN") continue;
    const retained = layoutOf(name).artifacts.filter((item) => item.slot.startsWith("vault-")).length;
    assert(retained <= 4, name + " never out-retains stand-down");
  }
});

test("the human gate only ever waits for a person or is closed, in every fixture", () => {
  assert.deepEqual(STAGE_KEYS, ["snapshot", "research", "review", "memo", "gate"]);
  for (const name of SCENE_ORDER) {
    const { projection } = scene(name);
    const stages = pipelineStages(projection);
    assert.deepEqual(stages.map((item) => item.key), STAGE_KEYS.slice(), name + " keeps the workflow order");
    const gate = stages.at(-1);
    assert.equal(gate.key, "gate", name + " ends at the human gate");
    assert(["Waiting for decision", "Closed"].includes(gate.status), name + " gate status is " + gate.status);
    assert.equal(gate.tone === "attention", projection.humanGate.state === "waiting", name + " attention tracks waiting");
    for (const stage of stages) assert.equal(stage.title, STAGE_TITLES[stage.key], name + " titles " + stage.key);
  }
  assert.equal(pipelineStages(scene("MEMO_READY").projection).at(-1).status, "Waiting for decision");
  assert.equal(pipelineStages(scene("STAND_DOWN").projection).at(-1).status, "Closed");
  assert.equal(pipelineStages(scene("DORMANT").projection).at(-1).status, "Closed");
});

test("the gate is a place a person decides, not a third agent", () => {
  const box = gateBox();
  assert(box.w > 0 && box.h > 0, "the gate is a real target on the stage");
  for (const name of SCENE_ORDER) {
    const layout = layoutOf(name);
    for (const agent of layout.agents) assert(["researcher", "reviewer"].includes(agent.role), name + " staffs no gate agent");
    assert.deepEqual(
      pickAt(layout, box.x + box.w / 2, box.y + box.h / 2),
      { type: "gate", id: "humanGate" },
      name + " the portal is the gate itself",
    );
  }
  const memo = layoutOf("MEMO_READY").artifacts.find((item) => item.kind === "memo");
  const memoBox = artifactBox(memo);
  assert.deepEqual(
    pickAt(layoutOf("MEMO_READY"), memoBox.x + memoBox.w / 2, memoBox.y + memoBox.h / 2),
    { type: "artifact", id: memo.id },
    "a candidate memo is inspectable in its own right",
  );
});

test("picking follows office geometry, and empty air stays empty", () => {
  for (const name of SCENE_ORDER) {
    const layout = layoutOf(name);
    const real = new Set([...layout.artifacts.map((item) => item.id), ...layout.agents.map((item) => item.id), "humanGate"]);
    for (const item of layout.artifacts) {
      const box = artifactBox(item);
      const picked = pickAt(layout, box.x + box.w / 2, box.y + box.h / 2);
      assert.equal(picked?.id, item.id, name + " picks " + item.id + " on its own box");
    }
    for (let x = -40; x <= DESIGN_WIDTH + 40; x += 40)
      for (let y = -40; y <= DESIGN_HEIGHT + 40; y += 40) {
        const picked = pickAt(layout, x, y);
        assert(picked === null || real.has(picked.id), name + " never invents a subject at " + x + "," + y);
      }
    assert.equal(pickAt(layout, -50, -50), null, name + " outside the office hits nothing");
  }
});

test("work objects are the protagonists: never smaller than the people who carry them", () => {
  assert(ARTIFACT_SIZE.w >= AGENT_SIZE.w && ARTIFACT_SIZE.h >= AGENT_SIZE.h, "a work object is never the smaller subject");
  assert(
    ARTIFACT_SIZE.w * ARTIFACT_SIZE.h > AGENT_SIZE.w * AGENT_SIZE.h,
    "the work object carries more area than the person",
  );
  for (const name of SCENE_ORDER) {
    const { ctx, layout } = render(name);
    for (const item of layout.artifacts) {
      const box = artifactBox(item);
      assert(box.w === ARTIFACT_SIZE.w && box.h === ARTIFACT_SIZE.h, name + " gives " + item.id + " the full object box");
    }
    for (const role of ["researcher", "reviewer"]) {
      const staff = layout.agents.filter((agent) => agent.role === role).length;
      assert.equal(
        countText(ctx, role === "reviewer" ? "Reviewer" : "Researcher"),
        staff,
        name + " names " + staff + " " + role,
      );
    }
  }
});

test("the floor flow is a pure function of the fixture, not of the clock", () => {
  const expected = {
    DORMANT: "idle",
    RESEARCH_RUNNING: "at-research",
    RESEARCH_COMPLETE: "at-research",
    REVIEW_RUNNING: "to-review",
    NEEDS_ATTENTION: "to-review",
    MEMO_READY: "at-gate",
    STAND_DOWN: "retained",
    INTERRUPTED: "at-research",
  };
  for (const name of SCENE_ORDER) {
    const { projection } = scene(name);
    assert.equal(flowState(projection), expected[name], name + " lights the leg the story stands on");
    assert.equal(flowState(projection), flowState(JSON.parse(JSON.stringify(projection))), name + " is clock-free");
  }
});

test("furniture is layout, never state: every fixture keeps its rooms and its archive", () => {
  for (const name of SCENE_ORDER) {
    const { ctx } = render(name);
    for (const key of ["research", "review", "gate"])
      assert(countText(ctx, ZONES[key].title) >= 1, name + " keeps the " + key + " room");
    for (const label of VAULT_LABELS) assert(countText(ctx, label) >= 1, name + " keeps the " + label + " cabinet");
    assert(VAULT_LABELS.length === 4, "the archive has one cabinet per retained kind");
    assert(ctx.ops.filter(([op]) => op === "lineTo").length >= 20, name + " still draws the floor grid");
  }
});

test("the renderer paints every fixture and only reacts to hover or selection", () => {
  for (const name of SCENE_ORDER) {
    const { ctx, layout } = render(name);
    assert(ctx.ops.length > 80, name + " actually draws a facility");
    assert(
      ctx.ops.some(([op, x, y, w, h]) => op === "fillRect" && x === 0 && y === 0 && w === DESIGN_WIDTH && h === DESIGN_HEIGHT),
      name + " paints the full stage background",
    );
    assert(texts(ctx).length > 4, name + " labels what it draws");
    const first = layout.artifacts[0];
    if (!first) continue;
    const baseline = render(name).ctx;
    const hovered = render(name, { hoveredId: first.id }).ctx;
    const selected = render(name, { selectedId: first.id }).ctx;
    assert(hovered.ops.length > baseline.ops.length, name + " hover adds the inspection ring");
    assert(selected.ops.length > baseline.ops.length, name + " selection marks the subject");
    assert.deepEqual(texts(hovered), texts(baseline), name + " the pointer cannot rewrite what the office says");
  }
});

test("the office cannot reach the network, a model, storage or the product runtime", () => {
  for (const file of codeFiles) {
    const text = read(file);
    assert(!/Math\.random/.test(text), file + " has no randomness");
    assert(!/\bfetch\s*\(/.test(text), file + " makes no request");
    assert(!/XMLHttpRequest|new\s+WebSocket|new\s+EventSource|EventSource\s*\(/.test(text), file + " opens no socket");
    assert(!/text\/event-stream/.test(text), file + " speaks no SSE");
    assert(!/localStorage|sessionStorage|indexedDB|document\.cookie|CacheStorage/.test(text), file + " persists nothing");
    assert(!/@anthropic|@deepseek|packages\/|fixtures\/northstar/.test(text), file + " imports no product module");
    for (const match of text.matchAll(/from\s+"([^"]+)"/g))
      assert(match[1].startsWith("./") || match[1].startsWith("node:"), file + " imports stay local: " + match[1]);
    if (/\.(html|css)$/.test(file)) assert(!/(?:src\s*=\s*["']https?:|url\(\s*["']?https?:|@import)/.test(text), file + " loads no remote asset (credit links are allowed)");
  }
});

test("the office uses the vendored Munder cast without remote or licensed tile assets", () => {
  assert(read("main.js").includes('./office-scene.js'));
  assert(read("office-scene.js").includes('./vendor/munder-difflin/portrait-art.js'));
  assert(read("vendor/munder-difflin/LICENSE").includes("Copyright (c) 2026 Chaitanya Giri"));
  assert(!/tilesets|office\.tmj/.test(read("serve.mjs")));
});

test("the page is a read-only mock projection and keeps its brand", () => {
  const html = read("index.html");
  assert(html.includes(BANNER), "the page still declares itself a mock projection");
  assert(html.includes("Swarm Space") && html.includes("Persistent Agent Research Organization"), "branding is the title");
  for (const id of ["stage", "drawer", "drawer-stages", "scenes", "fps", "scene-name", "caption"])
    assert(html.includes('id="' + id + '"'), "the page keeps its " + id + " hook");
  assert(!/<form|<input|<textarea|<select/i.test(html), "the page cannot be submitted anywhere");
  assert(html.includes('id="drawer" aria-hidden="true"') || /id="drawer"[^>]*aria-hidden="true"/.test(html), "the inspector starts closed");
  const scripts = html.match(/<script[^>]*>/g) ?? [];
  assert.equal(scripts.length, 1, "one script tag, no inline handlers");
  assert(scripts[0].includes('type="module"') && scripts[0].includes('src="main.js"'), "the single script is the local module");
  const css = read("swarm-space.css");
  assert(!/image-rendering/.test(css), "the stage is rendered as vector, not pixel art");
  assert(!/@import|url\(http/.test(css), "the stylesheet loads nothing remotely");
});
