// Isometric research-facility renderer for FlowCredit Swarm Space V0.6.
//
// This module is deliberately DOM-free: it projects a mock projection onto a
// 2.5D facility and paints it. It cannot reach the network, a model, a clock of
// its own or any storage, and it never decides what state the facility is in.
// Motion is decoration driven by a fixture transition; it can never create a
// subject or change a stage.
//
// The room is a projection, not a simulation: every wall, cabinet, desk,
// executor and work object below is placed by the fixture and by nothing else.
//
// SYSTEM STATE DRIVES THE WORLD. THE WORLD NEVER INVENTS SYSTEM STATE.

import {
  AGENT_SIZE,
  ARTIFACT_SIZE,
  KIND_STYLE,
  STATE_LABEL,
  THEME,
  drawDot,
  drawPrism,
  drawQuad,
  glow,
  label,
  measure,
  providerStyle,
  roundedPath,
  stateTone,
} from "./assets.js";
import { digestPrefix } from "./fixtures.js";

export const DESIGN_WIDTH = 1600;
export const DESIGN_HEIGHT = 900;

/**
 * 2:1 isometric projection. One tile is 50x25 px and one level is 36 px, so the
 * 12 x 9.5 plan lands across roughly 1075 x 780 px of the 1600 x 900 stage: the
 * facility fills the frame instead of floating in the middle of it.
 */
export const ISO = Object.freeze({ x: 50, y: 25, z: 36 });
export const ORIGIN = Object.freeze({ x: 685, y: 242 });

export function iso(x, y, z = 0) {
  return { x: ORIGIN.x + (x - y) * ISO.x, y: ORIGIN.y + (x + y) * ISO.y - z * ISO.z };
}

/**
 * A hall, not a box. The camera looks at the plan from the front-right, so the
 * far walls stand at x=0 and y=0 and the near half stays open: every room is
 * seen into rather than presented as a card with a wall in front of it.
 */
export const ROOM = Object.freeze({ w: 11.4, d: 9.5, h: 3 });
const WALL_LIFT = 0.25;
/** How tall a room's back wall stands. Low enough to see over, tall enough to read. */
const PARAPET = 0.8;

/**
 * Anchors are depth-unique on purpose. Three rooms sharing one `cx + cy` land
 * on one screen row and read as three equal boxes; these walk the plan as a Z.
 * The lab sits far left, the chamber holds the mid right, and the gate is
 * nearest the camera and therefore the largest thing on the floor.
 */
export const ZONES = Object.freeze({
  research: {
    key: "research",
    cx: 3.6,
    cy: 6.9,
    w: 3.4,
    d: 2.8,
    title: "RESEARCH LAB",
    cn: "研究实验室",
    hint: "Explore · Analyze",
    accent: THEME.research,
  },
  review: {
    key: "review",
    cx: 8.2,
    cy: 3.4,
    w: 3.8,
    d: 3.0,
    title: "REVIEW CHAMBER",
    cn: "复核审查室",
    hint: "Evaluate · Critique",
    accent: THEME.review,
  },
  gate: {
    key: "gate",
    cx: 7.0,
    cy: 7.4,
    w: 3.0,
    d: 2.4,
    title: "HUMAN GATE",
    cn: "人类决策门",
    hint: "Decide · Approve",
    accent: THEME.gate,
  },
});

export const ZONE_KEYS = Object.freeze(["research", "review", "gate"]);

/** The energy core: at the back of the hall, tall, and never the authority. */
export const POWER = Object.freeze({ cx: 5.2, cy: 1.1, w: 1.5, d: 1.5, h: 0.6 });

/**
 * The memory archive runs along the far wall: cabinets raised off the floor,
 * lit by nothing but themselves. It is the one thing that stays awake after
 * every executor has left, so it is built as architecture rather than as a card.
 */
export const ARCHIVE = Object.freeze({
  title: "MEMORY ARCHIVE",
  cn: "记忆档案库",
  hint: "Snapshots · Artifacts · History",
  accent: THEME.archive,
  wall: "left",
  from: 0.85,
  to: 8.35,
  z: 0.22,
  h: 1.5,
});

/** Four retention cabinets along the archive wall, one per retained kind. */
export const ARCHIVE_SLOTS = Object.freeze([7.6, 5.6, 3.6, 1.6]);
export const VAULT_LABELS = Object.freeze(["Snapshot", "Research", "Review", "Memo"]);
const VAULT_SLOTS = Object.freeze(["vault-snapshot", "vault-research", "vault-review", "vault-memo"]);

export const STAGE_KEYS = Object.freeze(["snapshot", "research", "review", "memo", "gate"]);

export const STAGE_TITLES = Object.freeze({
  snapshot: "Snapshot",
  research: "Research",
  review: "Review",
  memo: "Memo",
  gate: "Human gate",
});

export const STAGE_COLORS = Object.freeze({
  snapshot: THEME.snapshot,
  research: THEME.research,
  review: THEME.review,
  memo: THEME.memo,
  gate: THEME.gate,
});

/**
 * The semantic path, inlaid in the floor. Work objects travel these segments on
 * a fixture transition, and the six nodes are the six steps of the story:
 * Snapshot -> Research -> Artifact -> Review -> Memo -> Human. The path leaves
 * the archive wall, crosses the lab, stages in the middle of the hall, is
 * checked in the chamber, and comes back toward the camera into the gate.
 */
export const CHANNEL = Object.freeze([
  { key: "snapshot", at: [1.0, 8.6], label: "Snapshot" },
  { key: "research", at: [3.7, 7.0], label: "Research" },
  { key: "artifact", at: [5.9, 5.1], label: "Artifact" },
  { key: "review", at: [8.2, 3.3], label: "Review" },
  { key: "memo", at: [8.8, 6.0], label: "Memo" },
  { key: "human", at: [7.0, 7.4], label: "Human" },
]);

/** Every fixture slot is either a desk hand-off position or a retention shelf. */
export const SLOTS = Object.freeze({
  "research-tray": { kind: "desk", station: "research" },
  "review-tray": { kind: "desk", station: "review" },
  "gate-desk": { kind: "desk", station: "gate" },
  "vault-snapshot": { kind: "vault", index: 0 },
  "vault-research": { kind: "vault", index: 1 },
  "vault-review": { kind: "vault", index: 2 },
  "vault-memo": { kind: "vault", index: 3 },
});

/** Where a work object rests on a desk, as an offset inside its room. */
const TRAY = Object.freeze({ dx: 0.95, dy: -0.85 });
/**
 * The gate keeps its own in-tray: a delivered memo waits at the near-left
 * corner of the dais, in front of the portal and clear of it on screen. The
 * work object is therefore delivered *to* the gate without ever covering the
 * place where a person decides, and both stay inspectable.
 */
const GATE_TRAY = Object.freeze({ dx: -1.0, dy: 1.3 });
const DESK = Object.freeze({ halfW: 1.15, halfD: 0.7, height: 0.85 });
const DESK_LIFT = DESK.height * ISO.z;

function shade(hex, factor) {
  const value = hex.replace("#", "");
  const parts = [0, 2, 4].map((index) => {
    const channel = parseInt(value.slice(index, index + 2), 16);
    return Math.max(0, Math.min(255, Math.round(channel * factor)));
  });
  return "#" + parts.map((channel) => channel.toString(16).padStart(2, "0")).join("");
}

function prism(x, y, w, d, h) {
  return {
    a: iso(x, y),
    b: iso(x + w, y),
    c: iso(x + w, y + d),
    d: iso(x, y + d),
    at: iso(x, y, h),
    bt: iso(x + w, y, h),
    ct: iso(x + w, y + d, h),
    dt: iso(x, y + d, h),
  };
}

function prismFaces(base, lit = 1) {
  return {
    top: shade(base, 1.24 * lit),
    left: shade(base, 0.72 * lit),
    right: shade(base, 0.5 * lit),
  };
}

function floorQuad(x, y, w, d, z = 0) {
  return [iso(x, y, z), iso(x + w, y, z), iso(x + w, y + d, z), iso(x, y + d, z)];
}

/** Cabinet centre on the archive wall for one retained kind. */
function vaultPoint(index, z = ARCHIVE.z + 1.55) {
  return iso(0, ARCHIVE_SLOTS[index], z);
}

// ── layout, picking, motion ──────────────────────────────────

/**
 * Projects fixtures into drawable subjects. Positions, poses and states are
 * copies of the projection; nothing is added, dropped or reordered.
 */
export function buildLayout(projection) {
  const agents = projection.agents.map((entry) => {
    const zone = ZONES[entry.role === "reviewer" ? "review" : "research"];
    const foot = iso(zone.cx - 0.75, zone.cy - 1.05);
    return {
      ...entry,
      x: foot.x - AGENT_SIZE.w / 2,
      y: foot.y - AGENT_SIZE.h,
      w: AGENT_SIZE.w,
      h: AGENT_SIZE.h,
      zone: zone.key,
      depth: zone.cx + zone.cy - 1,
    };
  });
  const artifacts = projection.artifacts.map((entry) => {
    const spec = SLOTS[entry.slot];
    if (!spec) throw Error("UNKNOWN_SLOT: " + entry.slot);
    const tray = spec.kind === "desk" && spec.station === "gate" ? GATE_TRAY : TRAY;
    const zone = spec.kind === "desk" ? ZONES[spec.station] : null;
    const point = zone ? iso(zone.cx + tray.dx, zone.cy + tray.dy) : vaultPoint(spec.index);
    return {
      ...entry,
      x: point.x,
      y: point.y,
      lift: zone ? DESK_LIFT : 0,
      w: ARTIFACT_SIZE.w,
      h: ARTIFACT_SIZE.h,
      zone: zone ? zone.key : "archive",
      depth: zone ? zone.cx + zone.cy + tray.dx + tray.dy : ARCHIVE_SLOTS[spec.index] - 0.2,
    };
  });
  return { agents, artifacts };
}

const HIT_PADDING = 6;

function inside(box, x, y, extra) {
  return x >= box.x - extra && x <= box.x + box.w + extra && y >= box.y - extra && y <= box.y + box.h + extra;
}

/** The screen box one work object occupies: the floating object plus its plinth. */
export function artifactBox(item) {
  return { x: item.x - item.w / 2, y: item.y - item.lift - 74, w: item.w, h: item.h };
}

/** The screen box of the human gate: dais, portal and the decision seat. */
export function gateBox() {
  const zone = ZONES.gate;
  const centre = iso(zone.cx, zone.cy, 0.5);
  const top = iso(zone.cx, zone.cy, 2.8).y;
  const half = 92;
  return { x: centre.x - half, y: top, w: half * 2, h: centre.y + 30 - top };
}

/** What the pointer is over: a work object, a person, or the Human Gate itself. */
export function pickAt(layout, x, y) {
  for (let i = layout.artifacts.length - 1; i >= 0; i--) {
    const item = layout.artifacts[i];
    if (inside(artifactBox(item), x, y, HIT_PADDING)) return { type: "artifact", id: item.id };
  }
  for (const agent of layout.agents) if (inside(agent, x, y, HIT_PADDING)) return { type: "agent", id: agent.id };
  if (inside(gateBox(), x, y, 0)) return { type: "gate", id: "humanGate" };
  return null;
}

export function artifactFacts(item) {
  return [
    ["task", item.taskId],
    ["snapshot", item.snapshot],
    ["provider", providerStyle(item.provider).label],
    ["digest", digestPrefix(item.digest)],
  ];
}

/** The channel, in screen space: work travels the story, not a shortcut. */
export function channelPoints() {
  return CHANNEL.map((node) => iso(node.at[0], node.at[1]));
}

/**
 * Hand-off route: leave the slot, join the inlaid channel, follow it in story
 * order, then step off at the destination. A transfer therefore reads as work
 * moving through the facility rather than as an object sliding across a grid.
 */
function route(from, to) {
  const points = channelPoints();
  const nearest = (target) => {
    let best = 0;
    let bestDistance = Infinity;
    for (let index = 0; index < points.length; index++) {
      const distance = Math.hypot(points[index].x - target.x, points[index].y - target.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    }
    return best;
  };
  const start = nearest(from);
  const end = nearest(to);
  const leg = start <= end ? points.slice(start, end + 1) : points.slice(end, start + 1).reverse();
  return [{ x: from.x, y: from.y }, ...leg, { x: to.x, y: to.y }];
}

export function transferPlan(previousLayout, nextLayout) {
  if (!previousLayout) return [];
  const before = new Map(previousLayout.artifacts.map((item) => [item.id, item]));
  const plan = [];
  for (const item of nextLayout.artifacts) {
    const previous = before.get(item.id);
    if (!previous || previous.slot === item.slot) continue;
    const from = { x: previous.x, y: previous.y };
    const to = { x: item.x, y: item.y };
    plan.push({ id: item.id, from, to, path: route(from, to) });
  }
  return plan;
}

/** Work objects that this fixture introduced: they fade in, they do not teleport. */
export function appearedIds(previousLayout, nextLayout) {
  const before = new Set((previousLayout?.artifacts ?? []).map((item) => item.id));
  return new Set(nextLayout.artifacts.filter((item) => !before.has(item.id)).map((item) => item.id));
}

export function pointOnPath(points, t) {
  const clamped = Math.min(1, Math.max(0, t));
  const first = points[0];
  const last = points[points.length - 1];
  if (clamped === 0) return { x: first.x, y: first.y };
  if (clamped === 1) return { x: last.x, y: last.y };
  const lengths = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const length = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    lengths.push(length);
    total += length;
  }
  if (total === 0) return { x: last.x, y: last.y };
  let travelled = clamped * total;
  for (let i = 0; i < lengths.length; i++) {
    if (travelled <= lengths[i] || i === lengths.length - 1) {
      const k = lengths[i] === 0 ? 0 : Math.min(1, travelled / lengths[i]);
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * k,
        y: points[i].y + (points[i + 1].y - points[i].y) * k,
      };
    }
    travelled -= lengths[i];
  }
  return { x: last.x, y: last.y };
}

/** Pure: elapsed time in, positions out. Nothing here touches fixture state. */
export function artifactMotion(plan, elapsedMs, durationMs = 1150) {
  const motion = new Map();
  for (const entry of plan) {
    const t = durationMs <= 0 ? 1 : Math.min(1, Math.max(0, elapsedMs / durationMs));
    const eased = t * t * (3 - 2 * t);
    motion.set(entry.id, { ...pointOnPath(entry.path, eased), moving: t < 1 });
  }
  return motion;
}

/**
 * Decoration is a clock, not a simulation: the same inputs always give the same
 * offsets, and an offset can never become a state change.
 */
export function decorationAt(timeMs, seed = 0, reduced = false) {
  if (reduced) return { breathe: 0, pulse: 0, dots: 0, flow: 0 };
  const phase = timeMs / 1000 + seed;
  return {
    breathe: Math.round(Math.sin(phase * 1.1) * 2) / 2,
    pulse: (Math.sin(phase * 0.8) + 1) / 2,
    dots: Math.floor((timeMs / 380) % 4),
    flow: (timeMs / 900) % 1,
  };
}

// ── workflow semantics (pure functions of the projection) ────

function stage(key, status, tone) {
  return { key, title: STAGE_TITLES[key], status, tone };
}

function researchStage(artifact) {
  if (!artifact) return stage("research", "Pending", "pending");
  switch (artifact.state) {
    case "forming":
      return stage("research", "Forming", "active");
    case "ready":
      return stage("research", "Artifact ready", "done");
    case "under-review":
      return stage("research", "With reviewer", "done");
    case "flagged":
      return stage("research", "Flagged", "attention");
    case "result-unknown":
      return stage("research", "Result uncertain", "attention");
    case "archived":
      return stage("research", "Archived", "done");
    default:
      return stage("research", "Pending", "pending");
  }
}

function reviewStage(reviewArtifact, researchArtifact) {
  if (reviewArtifact?.state === "ready") return stage("review", "Passed", "done");
  if (reviewArtifact?.state === "archived") return stage("review", "Archived", "done");
  if (researchArtifact?.state === "under-review") return stage("review", "In review", "active");
  if (researchArtifact?.state === "flagged") return stage("review", "Needs attention", "attention");
  return stage("review", "Pending", "pending");
}

function memoStage(memo) {
  if (!memo) return stage("memo", "Pending", "pending");
  if (memo.state === "awaiting-human") return stage("memo", "Awaiting human", "attention");
  if (memo.state === "archived") return stage("memo", "Retained", "done");
  return stage("memo", "Pending", "pending");
}

/** The five workflow stages, derived from the projection and nothing else. */
export function pipelineStages(projection) {
  const find = (kind) => projection.artifacts.find((entry) => entry.kind === kind) ?? null;
  const snapshot = find("snapshot");
  return [
    stage("snapshot", snapshot ? "Bound · " + snapshot.snapshot : "Pending", snapshot ? "done" : "pending"),
    researchStage(find("research")),
    reviewStage(find("review"), find("research")),
    memoStage(find("memo")),
    stage(
      "gate",
      projection.humanGate.state === "waiting" ? "Waiting for decision" : "Closed",
      projection.humanGate.state === "waiting" ? "attention" : "pending",
    ),
  ];
}

/** Which leg of the inlaid channel is live in this fixture. */
export function flowState(projection) {
  const find = (kind) => projection.artifacts.find((entry) => entry.kind === kind) ?? null;
  const research = find("research");
  const memo = find("memo");
  if (memo && memo.slot === "gate-desk") return "at-gate";
  if (research && research.slot === "review-tray") return "to-review";
  if (research && research.slot === "research-tray") return "at-research";
  if (projection.artifacts.length > 0 && projection.artifacts.every((entry) => entry.slot.startsWith("vault-"))) return "retained";
  return "idle";
}

/** Which channel nodes a flow state lights, by node key. */
const FLOW_LEG = Object.freeze({
  idle: [],
  "at-research": ["snapshot", "research"],
  "to-review": ["snapshot", "research", "artifact", "review"],
  "at-gate": ["snapshot", "research", "artifact", "review", "memo", "human"],
  retained: [],
});

export function litNodes(projection) {
  return new Set(FLOW_LEG[flowState(projection)] ?? []);
}

// ── room shell ───────────────────────────────────────────────

function drawBackdrop(ctx, power, deco) {
  const sky = ctx.createLinearGradient(0, 0, 0, DESIGN_HEIGHT);
  sky.addColorStop(0, "#04070D");
  sky.addColorStop(0.34, "#070C17");
  sky.addColorStop(0.72, "#0A111E");
  sky.addColorStop(1, "#05080F");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
  const tone = power === "active" ? "79, 195, 255" : power === "interrupted" ? "240, 162, 46" : "58, 74, 102";
  const strength = power === "active" ? 0.16 : power === "interrupted" ? 0.11 : 0.06;
  const far = iso(4, 3, 1.4);
  const pool = ctx.createRadialGradient(far.x, far.y, 30, far.x, far.y, 720);
  pool.addColorStop(0, "rgba(" + tone + ", " + (strength + deco.pulse * 0.02).toFixed(3) + ")");
  pool.addColorStop(0.55, "rgba(" + tone + ", 0.03)");
  pool.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = pool;
  ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
}

/** Two lit interior walls and the floor diamond. Structure, never state. */
function drawShell(ctx, power) {
  const lit = power === "active" || power === "interrupted";
  const head = lit ? "rgba(79, 195, 255, 0.34)" : power === "stand-down" ? "rgba(143, 180, 255, 0.26)" : "rgba(120, 156, 210, 0.14)";
  const left = [iso(0, 0, 0), iso(0, ROOM.d, 0), iso(0, ROOM.d, ROOM.h), iso(0, 0, ROOM.h)];
  const right = [iso(0, 0, 0), iso(ROOM.w, 0, 0), iso(ROOM.w, 0, ROOM.h), iso(0, 0, ROOM.h)];
  const leftFoot = iso(0, ROOM.d, 0);
  const rightFoot = iso(ROOM.w, 0, 0);
  const leftFill = ctx.createLinearGradient(0, iso(0, 0, ROOM.h).y, 0, leftFoot.y);
  leftFill.addColorStop(0, "#080E1A");
  leftFill.addColorStop(0.62, shade(THEME.wall, 1.02));
  leftFill.addColorStop(1, shade(THEME.wall, 1.34));
  const rightFill = ctx.createLinearGradient(0, iso(0, 0, ROOM.h).y, 0, rightFoot.y);
  rightFill.addColorStop(0, "#070C16");
  rightFill.addColorStop(0.62, shade(THEME.wall, 0.88));
  rightFill.addColorStop(1, shade(THEME.wall, 1.14));
  drawQuad(ctx, left, leftFill);
  drawQuad(ctx, right, rightFill);
  ctx.save();
  ctx.strokeStyle = "rgba(122, 158, 214, 0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let step = 1.5; step < ROOM.d; step += 1.5) {
    const foot = iso(0, step, 0);
    const top = iso(0, step, ROOM.h - WALL_LIFT);
    ctx.moveTo(foot.x, foot.y);
    ctx.lineTo(top.x, top.y);
  }
  for (let step = 1.5; step < ROOM.w; step += 1.5) {
    const foot = iso(step, 0, 0);
    const top = iso(step, 0, ROOM.h - WALL_LIFT);
    ctx.moveTo(foot.x, foot.y);
    ctx.lineTo(top.x, top.y);
  }
  for (const level of [0.42, 0.68]) {
    const z = ROOM.h * level;
    const backLeft = iso(0, ROOM.d, z);
    const backRight = iso(ROOM.w, 0, z);
    ctx.moveTo(backLeft.x, backLeft.y);
    ctx.lineTo(backLeft.x, backLeft.y - 0);
    ctx.moveTo(iso(0, 0, z).x, iso(0, 0, z).y);
    ctx.lineTo(backLeft.x, backLeft.y);
    ctx.moveTo(iso(0, 0, z).x, iso(0, 0, z).y);
    ctx.lineTo(backRight.x, backRight.y);
  }
  ctx.stroke();
  ctx.restore();
  glow(ctx, head, 10, () => {
    ctx.save();
    ctx.strokeStyle = head;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(iso(0, ROOM.d, ROOM.h - WALL_LIFT).x, iso(0, ROOM.d, ROOM.h - WALL_LIFT).y);
    ctx.lineTo(iso(0, 0, ROOM.h - WALL_LIFT).x, iso(0, 0, ROOM.h - WALL_LIFT).y);
    ctx.lineTo(iso(ROOM.w, 0, ROOM.h - WALL_LIFT).x, iso(ROOM.w, 0, ROOM.h - WALL_LIFT).y);
    ctx.stroke();
    ctx.restore();
  });
  ctx.save();
  ctx.strokeStyle = lit ? "rgba(79, 195, 255, 0.22)" : "rgba(120, 156, 210, 0.12)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(iso(0, 0, 0).x, iso(0, 0, 0).y);
  ctx.lineTo(leftFoot.x, leftFoot.y);
  ctx.moveTo(iso(0, 0, 0).x, iso(0, 0, 0).y);
  ctx.lineTo(rightFoot.x, rightFoot.y);
  ctx.stroke();
  ctx.restore();
}

function drawFloor(ctx, power, deco) {
  const plate = floorQuad(0, 0, ROOM.w, ROOM.d);
  const fill = ctx.createLinearGradient(iso(0, 0).x, iso(0, 0).y, iso(ROOM.w, ROOM.d).x, iso(ROOM.w, ROOM.d).y);
  fill.addColorStop(0, shade(THEME.floor, 1.38));
  fill.addColorStop(0.5, THEME.floor);
  fill.addColorStop(1, shade(THEME.floor, 0.8));
  drawQuad(ctx, plate, fill);
  const wash = ctx.createLinearGradient(0, iso(0, 0).y, 0, iso(ROOM.w, ROOM.d).y);
  wash.addColorStop(0, "rgba(9, 16, 30, 0.4)");
  wash.addColorStop(0.45, "rgba(9, 16, 30, 0.05)");
  wash.addColorStop(1, "rgba(6, 11, 21, 0.3)");
  const drop = 13;
  const below = plate.map((point) => ({ x: point.x, y: point.y + drop }));
  drawQuad(ctx, [plate[1], plate[2], below[2], below[1]], "#0A111E");
  drawQuad(ctx, [plate[3], plate[2], below[2], below[3]], "#070C16");
  drawQuad(ctx, plate, wash);
  ctx.save();
  ctx.strokeStyle = THEME.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let step = 1; step < ROOM.w; step++) {
    const a = iso(step, 0);
    const b = iso(step, ROOM.d);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  for (let step = 1; step < ROOM.d; step++) {
    const a = iso(0, step);
    const b = iso(ROOM.w, step);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = "rgba(120, 156, 210, 0.22)";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  const near = iso(ROOM.w, ROOM.d);
  ctx.moveTo(iso(0, 0).x, iso(0, 0).y);
  ctx.lineTo(iso(ROOM.w, 0).x, iso(ROOM.w, 0).y);
  ctx.lineTo(near.x, near.y);
  ctx.lineTo(iso(0, ROOM.d).x, iso(0, ROOM.d).y);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

// ── the semantic channel ─────────────────────────────────────

function nodeTone(index) {
  const stageForNode = { snapshot: 0, research: 1, artifact: 1, review: 2, memo: 3, human: 4 };
  return STAGE_COLORS[STAGE_KEYS[stageForNode[CHANNEL[index].key]]];
}

/**
 * The story is inlaid in the floor: a recessed channel through six nodes, lit
 * only along the leg the fixture is standing on.
 */
function drawChannel(ctx, projection, deco) {
  const points = channelPoints();
  const lit = litNodes(projection);
  const powered = projection.power === "active" || projection.power === "interrupted";
  const dormant = projection.power === "stand-down" || projection.power === "dormant";
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index++) ctx.lineTo(points[index].x, points[index].y);
  ctx.strokeStyle = "rgba(6, 11, 21, 0.92)";
  ctx.lineWidth = 15;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.strokeStyle = "rgba(140, 172, 224, 0.28)";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
  for (let index = 1; index < CHANNEL.length; index++) {
    const from = points[index - 1];
    const to = points[index];
    const on = powered && lit.has(CHANNEL[index].key);
    ctx.save();
    ctx.globalAlpha = on ? 0.95 : dormant ? 0.2 : 0.46;
    ctx.strokeStyle = on ? nodeTone(index) : "rgba(120, 156, 210, 0.55)";
    ctx.lineWidth = on ? 4 : 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    if (on) {
      glow(ctx, ctx.strokeStyle, 14, () => ctx.stroke());
    } else {
      ctx.stroke();
    }
    ctx.restore();
  }
  if (powered) {
    const leg = FLOW_LEG[flowState(projection)] ?? [];
    if (leg.length > 1) {
      const traveller = pointOnPath(points.slice(0, leg.length), deco.flow);
      drawDot(ctx, traveller.x, traveller.y, 3.2, "#EAF7FF", THEME.power, 16);
    }
  }
  for (let index = 0; index < CHANNEL.length; index++) {
    const node = CHANNEL[index];
    const point = points[index];
    const on = powered && lit.has(node.key);
    const tone = on ? nodeTone(index) : "rgba(120, 156, 210, 0.55)";
    drawQuad(
      ctx,
      [
        { x: point.x, y: point.y - 11 },
        { x: point.x + 11, y: point.y },
        { x: point.x, y: point.y + 11 },
        { x: point.x - 11, y: point.y },
      ],
      on ? tone : "rgba(14, 22, 39, 0.96)",
      on ? tone : "rgba(140, 172, 224, 0.6)",
      on ? 1.4 : 1.2,
    );
    label(ctx, node.label, point.x, point.y + 22, {
      size: 10,
      weight: on ? 700 : 500,
      color: on ? THEME.ink : THEME.faint,
      align: "center",
    });
  }
}

/**
 * The retention spine: a conduit along the archive wall with a tap under each
 * cabinet. In stand-down the floor channel goes dark and this is what stays lit.
 */
function drawSpine(ctx, layout, power) {
  const lit = power === "stand-down";
  const tone = ARCHIVE.accent;
  const resident = new Set(layout.artifacts.filter((item) => item.zone === "archive").map((item) => item.slot));
  const head = iso(0, ARCHIVE.from, 0.12);
  const tail = iso(0, ARCHIVE.to, 0.12);
  ctx.save();
  ctx.strokeStyle = "rgba(8, 14, 26, 0.9)";
  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(head.x, head.y);
  ctx.lineTo(tail.x, tail.y);
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = lit ? 0.95 : resident.size ? 0.5 : 0.2;
  ctx.strokeStyle = lit ? tone : "rgba(120, 156, 210, 0.5)";
  ctx.lineWidth = lit ? 3 : 1.4;
  ctx.beginPath();
  ctx.moveTo(head.x, head.y);
  ctx.lineTo(tail.x, tail.y);
  ctx.stroke();
  ctx.restore();
  for (let index = 0; index < VAULT_SLOTS.length; index++) {
    const open = resident.has(VAULT_SLOTS[index]);
    const tap = iso(0, ARCHIVE_SLOTS[index], 0.12);
    drawDot(ctx, tap.x, tap.y, 3.4, open || lit ? tone : "#2C3A52", open || lit ? tone : null, 12);
  }
}

// ── architecture ─────────────────────────────────────────────

/** One box raised off the floor: the archive lives on a wall, not on the slab. */
function prismAt(x, y, w, d, z0, h) {
  return {
    a: iso(x, y, z0),
    b: iso(x + w, y, z0),
    c: iso(x + w, y + d, z0),
    d: iso(x, y + d, z0),
    at: iso(x, y, z0 + h),
    bt: iso(x + w, y, z0 + h),
    ct: iso(x + w, y + d, z0 + h),
    dt: iso(x, y + d, z0 + h),
  };
}

/**
 * The archive's name, set in the margin beside the wall it belongs to. Like the
 * room captions it is a title, not a panel: no box, no rim, nothing that would
 * turn the far wall into a card.
 */
function drawArchiveTitle(ctx, layout, power) {
  const resident = layout.artifacts.filter((item) => item.zone === "archive").length;
  const x = 96;
  const y = 232;
  ctx.save();
  ctx.globalAlpha = power === "dormant" ? 0.62 : 1;
  ctx.fillStyle = ARCHIVE.accent;
  ctx.fillRect(x, y - 22, 30, 2.6);
  label(ctx, ARCHIVE.title, x, y, { size: 15, weight: 700, color: THEME.ink });
  label(ctx, ARCHIVE.cn + " · " + ARCHIVE.hint, x, y + 18, { size: 10.5, weight: 500, color: THEME.muted });
  label(ctx, resident + "/4 retained · read-only history", x, y + 34, {
    size: 10,
    weight: 600,
    color: ARCHIVE.accent,
  });
  ctx.restore();
}

function drawArchiveWall(ctx, layout, power) {
  const tone = ARCHIVE.accent;
  const resident = new Set(layout.artifacts.filter((item) => item.zone === "archive").map((item) => item.slot));
  const strong = power === "stand-down";
  const half = (ARCHIVE.to - ARCHIVE.from) / 8;
  for (let index = 0; index < ARCHIVE_SLOTS.length; index++) {
    const at = ARCHIVE_SLOTS[index];
    const open = resident.has(VAULT_SLOTS[index]);
    const body = prismAt(0, at - half + 0.12, 1.05, half * 2 - 0.24, ARCHIVE.z, ARCHIVE.h);
    drawPrism(ctx, body, prismFaces(open ? "#1D2942" : "#141D2F", open ? 1.22 : 0.82));
    ctx.save();
    ctx.globalAlpha = open ? 0.85 : 0.45;
    ctx.strokeStyle = open ? tone + "99" : "rgba(120, 156, 210, 0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const level of [0.24, 0.48, 0.72]) {
      const seam = prismAt(0, at - half + 0.12, 1.05, half * 2 - 0.24, ARCHIVE.z + ARCHIVE.h * level, 0);
      ctx.moveTo(seam.d.x, seam.d.y);
      ctx.lineTo(seam.c.x, seam.c.y);
    }
    ctx.stroke();
    ctx.restore();
    glow(ctx, open ? tone + (strong ? "CC" : "88") : "transparent", open ? (strong ? 26 : 18) : 0, () => {
      drawQuad(ctx, [body.at, body.bt, body.ct, body.dt], null, open ? tone : "rgba(120, 156, 210, 0.22)", open ? 1.6 : 1.1);
    });
    const foot = iso(0, at, 0);
    const text = VAULT_LABELS[index];
    const width = Math.max(64, measure(ctx, text, 10.5, 700) + 22);
    const cx = foot.x + 30;
    ctx.save();
    roundedPath(ctx, cx - width / 2, foot.y + 8, width, 19, 7);
    ctx.fillStyle = open ? "rgba(10, 20, 38, 0.92)" : "rgba(9, 14, 26, 0.74)";
    ctx.fill();
    roundedPath(ctx, cx - width / 2, foot.y + 8, width, 19, 7);
    ctx.strokeStyle = open ? tone + "99" : "rgba(120, 156, 210, 0.24)";
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.restore();
    label(ctx, text, cx, foot.y + 18, { size: 10.5, weight: 700, color: open ? THEME.ink : THEME.faint, align: "center" });
  }
}

/** A low back wall. The room is a place, and it stays open toward the camera. */
function wallRun(ctx, x, y, w, d, accent, lit) {
  const body = prismAt(x, y, w, d, 0, PARAPET);
  drawPrism(ctx, body, prismFaces("#22304C", lit ? 1 : 0.78));
  drawQuad(ctx, [body.at, body.bt, body.ct, body.dt], null, accent + (lit ? "66" : "2C"), 1.3);
  ctx.save();
  ctx.globalAlpha = lit ? 0.34 : 0.16;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(body.b.x, body.b.y);
  ctx.lineTo(body.c.x, body.c.y);
  ctx.stroke();
  ctx.restore();
}

/** A bench: the slab the work sits on. Furniture is layout, never state. */
function bench(ctx, x, y, w, d, accent, h = DESK.height) {
  const body = prismAt(x, y, w, d, 0, h);
  drawPrism(ctx, body, prismFaces("#26334F"));
  drawQuad(ctx, [body.at, body.bt, body.ct, body.dt], accent + "1F");
  drawQuad(ctx, [body.at, body.bt, body.ct, body.dt], null, accent + "66", 1.1);
}

/** A column of instruments standing in a room, with its own readout light. */
function column(ctx, x, y, size, h, accent, lit) {
  const body = prismAt(x, y, size, size, 0, h);
  drawPrism(ctx, body, prismFaces("#1E2B45"));
  drawQuad(ctx, [body.at, body.bt, body.ct, body.dt], null, accent + (lit ? "AA" : "33"), 1.3);
  const cap = iso(x + size / 2, y + size / 2, h);
  drawDot(ctx, cap.x, cap.y, 2.6, lit ? "#EAF7FF" : "#3A4861", lit ? accent : null, lit ? 12 : 0);
}

/** A board hung flat on a room's far wall, written in the plane of the wall. */
function wallPanel(ctx, plane, at, from, to, z0, z1, accent, lit) {
  const corners =
    plane === "x"
      ? [iso(at, from, z0), iso(at, to, z0), iso(at, to, z1), iso(at, from, z1)]
      : [iso(from, at, z0), iso(to, at, z0), iso(to, at, z1), iso(from, at, z1)];
  drawQuad(ctx, corners, "rgba(12, 20, 36, 0.94)");
  ctx.save();
  ctx.globalAlpha = lit ? 0.6 : 0.28;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let row = 1; row <= 3; row++) {
    const z = z0 + ((z1 - z0) * row) / 4;
    const a = plane === "x" ? iso(at, from + 0.12, z) : iso(from + 0.12, at, z);
    const b = plane === "x" ? iso(at, to - 0.5 + row * 0.12, z) : iso(to - 0.5 + row * 0.12, at, z);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  ctx.restore();
  drawQuad(ctx, corners, null, accent + (lit ? "66" : "2A"), 1.2);
}

/**
 * A hanging fixture over a room. The light a room is lit by belongs to the
 * room, which is why every pool on this floor has a lamp above it.
 */
function lamp(ctx, cx, cy, span, accent, lit) {
  const z = 2.35;
  const top = iso(cx, cy, z);
  const foot = iso(cx, cy, 0);
  const half = span * ISO.x * 0.78;
  const shaft = ctx.createLinearGradient(0, top.y, 0, foot.y);
  shaft.addColorStop(0, accent + (lit ? "3E" : "14"));
  shaft.addColorStop(1, accent + "00");
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(top.x - 20, top.y);
  ctx.lineTo(top.x + 20, top.y);
  ctx.lineTo(foot.x + half, foot.y);
  ctx.lineTo(foot.x - half, foot.y);
  ctx.closePath();
  ctx.fillStyle = shaft;
  ctx.fill();
  ctx.restore();
  if (lit) {
    glow(ctx, accent + "55", 18, () => {
      ctx.beginPath();
      ctx.ellipse(foot.x, foot.y, half * 0.92, half * 0.46, 0, 0, Math.PI * 2);
      ctx.fillStyle = accent + "22";
      ctx.fill();
    });
  }
  const bar = prismAt(cx - span / 2, cy - 0.09, span, 0.18, z, 0.07);
  drawPrism(ctx, bar, prismFaces("#1B2539"));
  drawQuad(ctx, [bar.at, bar.bt, bar.ct, bar.dt], null, accent + (lit ? "99" : "2E"), 1.2);
}

/** The room's name, set beside the room: a caption, never a card. */
function roomCaption(ctx, x, y, zone, align, dim) {
  ctx.save();
  ctx.globalAlpha = dim ? 0.66 : 1;
  const width = measure(ctx, zone.title, 13.5, 700);
  const left = align === "right" ? x - width : align === "center" ? x - width / 2 : x;
  ctx.fillStyle = zone.accent;
  ctx.fillRect(left, y - 18, 24, 2.4);
  label(ctx, zone.title, x, y, { size: 13.5, weight: 700, color: THEME.ink, align });
  label(ctx, zone.cn + " · " + zone.hint, x, y + 15, { size: 10, weight: 500, color: THEME.muted, align });
  ctx.restore();
}

function drawRoom(ctx, zone, lit) {
  ctx.save();
  if (!lit) ctx.globalAlpha = 0.66;
  const x0 = zone.cx - zone.w / 2;
  const y0 = zone.cy - zone.d / 2;
  lamp(ctx, zone.cx, zone.cy - 0.2, 1.7, zone.accent, lit);
  wallRun(ctx, x0, y0, 0.18, zone.d, zone.accent, lit);
  wallRun(ctx, x0, y0, zone.w, 0.18, zone.accent, lit);
  if (zone.key === "research") {
    wallPanel(ctx, "y", y0 + 0.2, x0 + 0.5, x0 + 2.0, 0.14, 0.54, zone.accent, lit);
    bench(ctx, x0 + 0.25, y0 + 0.3, 1.4, 0.66, zone.accent);
    bench(ctx, x0 + 1.8, y0 + 0.3, 1.4, 0.66, zone.accent);
    column(ctx, x0 + 2.75, y0 + 2.05, 0.45, 1.45, zone.accent, lit);
    bench(ctx, x0 + 0.25, y0 + 2.15, 0.55, 0.5, zone.accent, 1.05);
    bench(ctx, x0 + 1.35, y0 + 2.35, 0.9, 0.45, zone.accent, 0.46);
  }
  if (zone.key === "review") {
    wallPanel(ctx, "y", y0 + 0.2, x0 + 0.6, x0 + 2.5, 0.14, 0.62, zone.accent, lit);
    bench(ctx, x0 + 0.9, y0 + 0.3, 2.6, 0.8, zone.accent);
    column(ctx, x0 + 3.25, y0 + 2.25, 0.45, 0.95, zone.accent, lit);
    bench(ctx, x0 + 0.55, y0 + 2.5, 0.9, 0.45, zone.accent, 0.5);
    bench(ctx, x0 + 0.55, y0 + 3.05, 0.9, 0.45, zone.accent, 0.5);
  }
  ctx.restore();
}

/**
 * Three names for three rooms, set in the margin at the room's own corner
 * rather than in a card on top of it: the eye gets a label, the room keeps its
 * floor, and nothing the room is made of is hidden behind its own name.
 */
function drawRoomCaptions(ctx, projection) {
  const dim = projection.power === "dormant";
  const lab = iso(ZONES.research.cx - ZONES.research.w / 2 - 0.35, ZONES.research.cy + ZONES.research.d / 2);
  roomCaption(ctx, lab.x, lab.y + 8, ZONES.research, "right", dim);
  const chamber = iso(ZONES.review.cx + ZONES.review.w / 2, ZONES.review.cy - ZONES.review.d / 2);
  roomCaption(ctx, chamber.x + 22, chamber.y + 2, ZONES.review, "left", dim);
  const gate = iso(ZONES.gate.cx, ZONES.gate.cy + ZONES.gate.d / 2 + 1.2);
  roomCaption(ctx, gate.x, gate.y, ZONES.gate, "center", dim);
}

/**
 * The middle of the hall: the staging table the channel passes over, and the
 * records bank on the open side. Neither holds state; both make the floor a
 * place people work in rather than a diagram with rooms on it.
 */
function drawSharedFloor(ctx, lit) {
  const stage = iso(5.9, 5.1);
  bench(ctx, 5.9 - 0.75, 5.1 - 0.36, 1.5, 0.72, THEME.snapshot, 0.78);
  drawDot(ctx, stage.x, stage.y - 0.78 * ISO.z, 2.4, lit ? "#EAF7FF" : "#3A4861", lit ? THEME.snapshot : null, lit ? 10 : 0);
  const bank = prismAt(9.35, 6.3, 1.7, 0.6, 0, 1.05);
  drawPrism(ctx, bank, prismFaces("#1B2740"));
  drawQuad(ctx, [bank.at, bank.bt, bank.ct, bank.dt], null, "rgba(140, 172, 224, 0.4)", 1);
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = "rgba(140, 172, 224, 0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const step of [0.6, 1.1]) {
    const a = iso(9.35 + step, 6.3, 0.44);
    const b = iso(9.35 + step, 6.9, 0.44);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  ctx.restore();
}

/** The floor the rooms stand on: a plate, an inset border and the room's light. */
function drawRoomFloors(ctx, projection) {
  const power = projection.power;
  const lit = power === "active" || power === "interrupted";
  for (const key of ZONE_KEYS) {
    const zone = ZONES[key];
    const on = lit || key === "gate";
    const centre = iso(zone.cx, zone.cy);
    const plate = floorQuad(zone.cx - zone.w / 2, zone.cy - zone.d / 2, zone.w, zone.d, 0.02);
    ctx.save();
    ctx.globalAlpha = power === "dormant" ? 0.62 : 1;
    const pool = ctx.createRadialGradient(centre.x, centre.y, 14, centre.x, centre.y, zone.w * ISO.x * 1.05);
    pool.addColorStop(0, zone.accent + (on ? "2E" : "10"));
    pool.addColorStop(0.6, zone.accent + (on ? "12" : "08"));
    pool.addColorStop(1, zone.accent + "00");
    drawQuad(ctx, plate, pool);
    drawQuad(ctx, plate, zone.accent + (on ? "14" : "08"));
    drawQuad(ctx, plate, null, zone.accent + (on ? "66" : "26"), 1.5);
    ctx.restore();
  }
}

/** The energy core: infrastructure at the back of the hall, bright but quiet. */
function drawPowerTower(ctx, power, deco) {
  const tone = power === "active" ? THEME.power : power === "interrupted" ? THEME.blocked : "#43536E";
  const live = power === "active" || power === "interrupted";
  const base = prism(POWER.cx - POWER.w / 2, POWER.cy - POWER.d / 2, POWER.w, POWER.d, POWER.h);
  drawPrism(ctx, base, prismFaces("#16203A"));
  drawQuad(ctx, [base.at, base.bt, base.ct, base.dt], null, tone + (live ? "66" : "22"), 1.2);
  const centre = iso(POWER.cx, POWER.cy, POWER.h);
  const top = centre.y - 116;
  const column = ctx.createLinearGradient(0, top, 0, centre.y);
  column.addColorStop(0, tone + "00");
  column.addColorStop(0.5, tone + (live ? "2E" : "14"));
  column.addColorStop(1, tone + (live ? "56" : "22"));
  ctx.fillStyle = column;
  ctx.fillRect(centre.x - 15, top, 30, centre.y - top);
  ctx.save();
  ctx.strokeStyle = tone + (live ? "55" : "22");
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (const offset of [-15, 15]) {
    ctx.moveTo(centre.x + offset, top);
    ctx.lineTo(centre.x + offset, centre.y);
  }
  ctx.stroke();
  ctx.restore();
  for (let ring = 0; ring < 2; ring++) {
    const y = centre.y - 26 - ring * 34;
    ctx.save();
    ctx.globalAlpha = live ? 0.26 + deco.pulse * 0.14 : 0.14;
    ctx.strokeStyle = tone;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(centre.x, y, 30 - ring * 4, 8 - ring, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  const orbY = top + 2;
  const orb = ctx.createRadialGradient(centre.x, orbY, 2, centre.x, orbY, live ? 20 : 12);
  orb.addColorStop(0, live ? "#FFFFFF" : "#6C7C96");
  orb.addColorStop(0.32, tone);
  orb.addColorStop(1, tone + "00");
  ctx.fillStyle = orb;
  ctx.fillRect(centre.x - 26, orbY - 26, 52, 52);
  drawDot(ctx, centre.x, orbY, live ? 6 + deco.pulse * 0.6 : 4.4, live ? "#EAF7FF" : "#68789A", live ? tone : null, live ? 12 : 0);
}

/**
 * The tower's name, painted in the caption pass rather than with the tower: a
 * label that a room could cover is a label nobody can read.
 */
function drawPowerCaption(ctx, power) {
  const tone = power === "active" ? THEME.power : power === "interrupted" ? THEME.blocked : "#43536E";
  const status = power === "active" ? "ACTIVE" : power === "interrupted" ? "INTERRUPTED" : power === "stand-down" ? "OFFLINE" : "STANDBY";
  const foot = iso(POWER.cx, POWER.cy, 0);
  const x = foot.x - 26;
  const y = foot.y + 4;
  ctx.save();
  ctx.globalAlpha = power === "dormant" ? 0.7 : 1;
  ctx.fillStyle = tone;
  ctx.fillRect(x - 24, y - 26, 24, 2.2);
  label(ctx, "MODEL POWER", x, y - 14, { size: 11.5, weight: 700, color: THEME.ink, align: "right" });
  label(ctx, "模型动力核心 · " + status, x, y + 1, { size: 9.5, weight: 600, color: tone, align: "right" });
  label(ctx, "energy, not authority", x, y + 14, { size: 9, weight: 500, color: THEME.faint, align: "right" });
  ctx.restore();
}

/** The human gate: a raised dais, a portal, and the seat a person decides from. */
function drawGate(ctx, projection, deco) {
  const zone = ZONES.gate;
  const waiting = projection.humanGate.state === "waiting";
  const lit = projection.power === "active" || projection.power === "interrupted";
  const tone = THEME.gate;
  const dais = prism(zone.cx - zone.w / 2, zone.cy - zone.d / 2, zone.w, zone.d, 0.5);
  drawPrism(ctx, dais, prismFaces("#241F15", lit ? 1 : 0.86));
  drawQuad(ctx, [dais.at, dais.bt, dais.ct, dais.dt], null, tone + (lit ? "8A" : "3A"), 1.6);
  const left = iso(zone.cx - 1.05, zone.cy + 0.75, 0.5);
  const right = iso(zone.cx + 1.05, zone.cy + 0.75, 0.5);
  const rise = 2.3 * ISO.z;
  glow(ctx, tone + (lit ? "99" : "44"), waiting ? 26 : lit ? 18 : 9, () => {
    ctx.save();
    ctx.strokeStyle = tone;
    ctx.lineWidth = 6.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(left.x, left.y - rise);
    ctx.quadraticCurveTo((left.x + right.x) / 2, left.y - rise - 22, right.x, right.y - rise);
    ctx.lineTo(right.x, right.y);
    ctx.stroke();
    ctx.restore();
  });
  const inner = ctx.createLinearGradient(0, left.y - rise, 0, left.y);
  inner.addColorStop(0, tone + (lit ? "3A" : "18"));
  inner.addColorStop(1, tone + "00");
  ctx.fillStyle = inner;
  ctx.fillRect(left.x + 4, left.y - rise, right.x - left.x - 8, rise);
  const seat = iso(zone.cx - 0.05, zone.cy + 0.25, 0.5);
  drawDot(ctx, seat.x, seat.y - 5, 7, "#0A1120", tone, waiting ? 18 : 10);
  roundedPath(ctx, seat.x - 8, seat.y - 13, 16, 16, 4);
  ctx.strokeStyle = tone;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  label(ctx, waiting ? "waiting for a person" : "decision seat", seat.x, seat.y + 26, {
    size: 9.5,
    weight: 600,
    color: tone,
    align: "center",
  });
  if (waiting) drawDot(ctx, seat.x, seat.y - 21 - deco.breathe, 3, "#FFF6DE", tone, 12);
}

// ── subjects ─────────────────────────────────────────────────
//
// M1/M2 massing only. The room, the architecture and the lighting are the
// subject of this round; the four work-object silhouettes land in M3 and the
// seated researcher / standing reviewer land in M4. Until then these draw the
// footprint, the name and the state — enough to prove the composition, never
// enough to hide a bad one.

function fillRoundedChip(ctx, x, y, w, h, color) {
  roundedPath(ctx, x, y, w, h, 7);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawArtifactMass(ctx, item, { timeMs, hoveredId, selectedId, motion, reveal, reduced }) {
  const placed = motion && motion.has(item.id) ? motion.get(item.id) : null;
  const x = placed ? placed.x : item.x;
  const y = (placed ? placed.y : item.y) - item.lift;
  const style = KIND_STYLE[item.kind] ?? { label: item.kind, short: item.kind, color: THEME.muted };
  const tone = stateTone(item.state, style.color);
  const active = item.id === hoveredId || item.id === selectedId;
  const alpha = reveal && reveal.ids.has(item.id) ? 0.3 + 0.7 * reveal.t : 1;
  const { breathe } = decorationAt(timeMs, 0.6, reduced);
  const float = placed || active ? 0 : breathe * 0.6;
  const top = y - 66 + float;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.save();
  ctx.globalAlpha = alpha * 0.45;
  ctx.beginPath();
  ctx.ellipse(x, y - 4, 30, 10, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  ctx.fill();
  ctx.restore();
  glow(ctx, style.color + "AA", active ? 26 : 16, () => {
    roundedPath(ctx, x - ARTIFACT_SIZE.w / 2, top, ARTIFACT_SIZE.w, ARTIFACT_SIZE.h - 26, 8);
    ctx.fillStyle = "rgba(10, 18, 34, 0.94)";
    ctx.fill();
    roundedPath(ctx, x - ARTIFACT_SIZE.w / 2, top, ARTIFACT_SIZE.w, ARTIFACT_SIZE.h - 26, 8);
    ctx.strokeStyle = style.color + "99";
    ctx.lineWidth = 1.4;
    ctx.stroke();
  });
  label(ctx, style.short ?? style.label, x, top + 22, { size: 11, weight: 700, color: THEME.ink, align: "center" });
  label(ctx, item.id + " · " + (STATE_LABEL[item.state] ?? item.state), x, top + 42, {
    size: 10,
    weight: 600,
    color: tone,
    align: "center",
  });
  if (active) {
    roundedPath(ctx, x - ARTIFACT_SIZE.w / 2 - 7, top - 7, ARTIFACT_SIZE.w + 14, ARTIFACT_SIZE.h - 12, 10);
    ctx.strokeStyle = style.color;
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }
  ctx.restore();
}

function drawAgentMass(ctx, entry, { timeMs, hoveredId, selectedId, reduced }) {
  const { breathe } = decorationAt(timeMs, entry.role === "reviewer" ? 2.3 : 0.6, reduced);
  const active = entry.id === hoveredId || entry.id === selectedId;
  const accent = entry.role === "reviewer" ? THEME.review : THEME.research;
  const cx = entry.x + entry.w / 2;
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.ellipse(cx, entry.y + entry.h + 2, 24, 8, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(0, breathe);
  glow(ctx, accent + "66", 12, () => {
    roundedPath(ctx, cx - 15, entry.y + 14, 30, entry.h - 14, 13);
    ctx.fillStyle = "#233046";
    ctx.fill();
    roundedPath(ctx, cx - 15, entry.y + 14, 30, entry.h - 14, 13);
    ctx.strokeStyle = accent + "AA";
    ctx.lineWidth = 1.4;
    ctx.stroke();
  });
  drawDot(ctx, cx, entry.y + 12, 11, "#E8BE96", accent, 10);
  fillRoundedChip(ctx, cx - 3, entry.y + 42, 6, 16, accent);
  ctx.restore();
  if (active) {
    roundedPath(ctx, cx - 22, entry.y + 2, 44, entry.h + 4, 12);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }
  label(ctx, entry.role === "reviewer" ? "Reviewer" : "Researcher", cx, entry.y - 22, {
    size: 11,
    weight: 700,
    color: THEME.ink,
    align: "center",
  });
  label(ctx, providerStyle(entry.provider).label, cx, entry.y - 8, {
    size: 9.5,
    weight: 500,
    color: providerStyle(entry.provider).color,
    align: "center",
  });
}

// ── closure ──────────────────────────────────────────────────

function drawStandDown(ctx, projection, layout) {
  if (projection.power !== "stand-down") return;
  const width = 700;
  const height = 126;
  const x = DESIGN_WIDTH / 2 - width / 2;
  const y = 688;
  glow(ctx, ARCHIVE.accent + "44", 30, () => {
    roundedPath(ctx, x, y, width, height, 14);
    ctx.fillStyle = "rgba(6, 11, 20, 0.94)";
    ctx.fill();
    roundedPath(ctx, x, y, width, height, 14);
    ctx.strokeStyle = "rgba(143, 180, 255, 0.5)";
    ctx.lineWidth = 1.6;
    ctx.stroke();
  });
  label(ctx, "Agents are gone. The work remains.", DESIGN_WIDTH / 2, y + 38, {
    size: 20,
    weight: 700,
    color: THEME.ink,
    align: "center",
  });
  label(ctx, "智能体会离开，但组织的工作必须留下。", DESIGN_WIDTH / 2, y + 66, {
    size: 12.5,
    weight: 500,
    color: THEME.muted,
    align: "center",
  });
  label(ctx, layout.artifacts.length + " work objects retained in the memory archive · gate still closed", DESIGN_WIDTH / 2, y + 92, {
    size: 11.5,
    weight: 600,
    color: ARCHIVE.accent,
    align: "center",
  });
  label(ctx, "FlowCredit · Persistent Swarm · From Knowledge to Impact", DESIGN_WIDTH / 2, y + 114, {
    size: 10,
    weight: 500,
    color: THEME.faint,
    align: "center",
  });
}

function drawSlogan(ctx, power) {
  if (power === "stand-down") return;
  label(ctx, "智能体会离开，但工作会留下。", DESIGN_WIDTH / 2, 806, {
    size: 16,
    weight: 500,
    color: "rgba(233, 240, 251, 0.9)",
    align: "center",
  });
  label(ctx, "Agents are gone. The work remains.", DESIGN_WIDTH / 2, 832, {
    size: 11.5,
    weight: 500,
    color: "rgba(149, 166, 194, 0.9)",
    align: "center",
  });
  label(ctx, "FlowCredit · Persistent Swarm · From Knowledge to Impact", DESIGN_WIDTH / 2, 862, {
    size: 10,
    weight: 500,
    color: "rgba(94, 115, 145, 0.9)",
    align: "center",
  });
}

/**
 * Paints one frame. Every branch below reads fixture values only; the clock
 * feeds decoration offsets and the fixture transition feeds hand-off motion.
 */
export function drawWorld(ctx, frame) {
  const {
    projection,
    layout,
    timeMs,
    hoveredId = null,
    selectedId = null,
    motion = null,
    reveal = null,
    reduced = false,
    subjects = true,
  } = frame;
  const deco = decorationAt(timeMs, 0.9, reduced);
  const lit = projection.power === "active" || projection.power === "interrupted";
  ctx.save();
  drawBackdrop(ctx, projection.power, deco);
  drawShell(ctx, projection.power);
  drawArchiveWall(ctx, layout, projection.power);
  drawArchiveTitle(ctx, layout, projection.power);
  drawFloor(ctx, projection.power, deco);
  drawSpine(ctx, layout, projection.power);
  drawRoomFloors(ctx, projection);
  drawChannel(ctx, projection, deco);
  const props = [
    { depth: POWER.cx + POWER.cy, draw: () => drawPowerTower(ctx, projection.power, deco) },
    { depth: ZONES.gate.cx + ZONES.gate.cy, draw: () => drawGate(ctx, projection, deco) },
  ];
  for (const key of ZONE_KEYS) {
    const zone = ZONES[key];
    const on = lit || key === "gate";
    props.push({ depth: zone.cx + zone.cy - 2.5, draw: () => drawRoom(ctx, zone, on) });
  }
  props.push({ depth: 9.4, draw: () => drawSharedFloor(ctx, lit) });
  if (subjects) {
    for (const item of layout.artifacts)
      props.push({
        depth: item.depth,
        draw: () => drawArtifactMass(ctx, item, { timeMs, hoveredId, selectedId, motion, reveal, reduced }),
      });
    for (const entry of layout.agents)
      props.push({ depth: entry.depth, draw: () => drawAgentMass(ctx, entry, { timeMs, hoveredId, selectedId, reduced }) });
  }
  props.sort((left, right) => left.depth - right.depth);
  for (const item of props) item.draw();
  drawPowerCaption(ctx, projection.power);
  drawRoomCaptions(ctx, projection);
  drawStandDown(ctx, projection, layout);
  drawSlogan(ctx, projection.power);
  ctx.restore();
}
