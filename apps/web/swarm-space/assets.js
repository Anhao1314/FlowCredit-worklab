// FlowCredit Swarm Space V0.6 — vector asset kit, drawn for this repository.
//
// A cinematic isometric office: prisms for the furniture, holo plates for the
// labels, glowing work objects for the artifacts and flat-vector colleagues for
// the executors. No third-party art, no image assets and no rasterisation: every
// shape below is canvas drawing that reviews like code.
//
// Nothing here reads state. Callers pass projection values in as coordinates,
// colours and strings.

export const THEME = {
  sky: "#05080F",
  room: "#0A1120",
  floor: "#111A2B",
  floorEdge: "#1D2A44",
  grid: "#182339",
  wall: "#0D1524",
  wallTop: "#1E2C46",
  panel: "#0E1727",
  panelLit: "#152135",
  line: "#243350",
  ink: "#E9F0FB",
  muted: "#95A6C2",
  faint: "#5E7391",
  shadow: "rgba(0, 0, 0, 0.6)",
  research: "#4D8DFF",
  review: "#17C6B8",
  gate: "#E8B23C",
  memo: "#E8B23C",
  snapshot: "#A78BFA",
  archive: "#8FB4FF",
  power: "#4FC3FF",
  working: "#39D98A",
  blocked: "#F0A22E",
  paused: "#8A9BB5",
  idle: "#5E7391",
};

/** Provider colours are runtime provenance only — never a permission level. */
export const PROVIDER_STYLE = Object.freeze({
  "native-harness": { label: "native-harness", color: "#4D8DFF" },
  "claude-code": { label: "claude-code", color: "#17C6B8" },
});

export function providerStyle(id) {
  return PROVIDER_STYLE[id] ?? { label: id, color: "#8FA2BE" };
}

/** Work objects are never drawn smaller than the people who carry them. */
export const AGENT_SIZE = Object.freeze({ w: 58, h: 92 });
export const ARTIFACT_SIZE = Object.freeze({ w: 104, h: 112 });

export const KIND_STYLE = Object.freeze({
  snapshot: { label: "Snapshot", short: "Snapshot", color: THEME.snapshot },
  research: { label: "Research artifact", short: "Research", color: THEME.research },
  review: { label: "Review artifact", short: "Review", color: THEME.review },
  memo: { label: "Candidate memo", short: "Memo", color: THEME.memo },
});

export const STATE_LABEL = Object.freeze({
  forming: "forming",
  bound: "bound",
  ready: "ready",
  "under-review": "in review",
  flagged: "flagged",
  "awaiting-human": "awaiting",
  archived: "archived",
  "result-unknown": "uncertain",
});

/** State colour is presentation only; it is a pure function of the fixture state. */
export function stateTone(state, fallback = THEME.muted) {
  switch (state) {
    case "bound":
      return THEME.snapshot;
    case "ready":
      return fallback;
    case "under-review":
      return THEME.review;
    case "awaiting-human":
      return THEME.gate;
    case "flagged":
    case "result-unknown":
      return THEME.blocked;
    case "archived":
      return THEME.archive;
    default:
      return THEME.muted;
  }
}

const FONT = 'ui-sans-serif, -apple-system, "PingFang SC", "Hiragino Sans GB", "Segoe UI", Roboto, "Microsoft YaHei", sans-serif';

// ── primitives ───────────────────────────────────────────────

export function roundedPath(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

function fillRounded(ctx, x, y, w, h, r, fill) {
  roundedPath(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}

function strokeRounded(ctx, x, y, w, h, r, stroke, lineWidth) {
  roundedPath(ctx, x, y, w, h, r);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

export function label(ctx, value, x, y, { size = 12, weight = 500, color = THEME.ink, align = "left", alpha = 1 } = {}) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = weight + " " + size + "px " + FONT;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(value, x, y);
  ctx.restore();
}

export function measure(ctx, value, size = 12, weight = 500) {
  ctx.font = weight + " " + size + "px " + FONT;
  return ctx.measureText(value).width;
}

export function textWidth(ctx, value, size, weight = 500) {
  ctx.save();
  const width = measure(ctx, value, size, weight);
  ctx.restore();
  return width;
}

/** Neon wrapper: everything drawn inside picks up the colour as a glow. */
export function glow(ctx, color, blur, fn, offsetY = 0) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetY = offsetY;
  fn();
  ctx.restore();
}

export function drawQuad(ctx, points, fill, stroke, lineWidth = 1) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * One isometric box. `corners` are screen points for the four floor corners
 * (a, b, c, d) and the matching top corners (at, bt, ct, dt). The three visible
 * faces are painted back to front.
 */
export function drawPrism(ctx, corners, colors) {
  drawQuad(ctx, [corners.b, corners.c, corners.ct, corners.bt], colors.left);
  drawQuad(ctx, [corners.d, corners.c, corners.ct, corners.dt], colors.right);
  drawQuad(ctx, [corners.at, corners.bt, corners.ct, corners.dt], colors.top);
}

function circlePath(ctx, cx, cy, r) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
}

export function drawDot(ctx, cx, cy, r, color, glowColor = null, blur = 10) {
  ctx.save();
  if (glowColor) {
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = blur;
  }
  circlePath(ctx, cx, cy, r);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

/** A dark holo plate with an accent rim: zone labels, tower labels, wall signs. */
export function drawHoloPlate(ctx, x, y, w, h, accent, { alpha = 1, radius = 10, filled = true } = {}) {
  ctx.save();
  ctx.globalAlpha = alpha;
  if (filled) {
    fillRounded(ctx, x, y, w, h, radius, "rgba(8, 14, 26, 0.82)");
    fillRounded(ctx, x + 1, y + 1, w - 2, 12, radius - 2, accent + "14");
  }
  glow(ctx, accent + "66", 12, () => strokeRounded(ctx, x, y, w, h, radius, accent + "66", 1.4));
  fillRounded(ctx, x + 10, y + h - 5, Math.max(18, w * 0.3), 2, 1, accent + "AA");
  ctx.restore();
}

/** Stage and work-object glyphs: one visual vocabulary for both. */
export function drawGlyph(ctx, kind, cx, cy, r, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.4, r * 0.24);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (kind === "snapshot") {
    roundedPath(ctx, cx - r * 0.7, cy - r, r * 1.4, r * 2, r * 0.45);
    ctx.stroke();
    circlePath(ctx, cx, cy, r * 0.3);
    ctx.fill();
  } else if (kind === "research") {
    circlePath(ctx, cx - r * 0.15, cy - r * 0.15, r * 0.66);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.34, cy + r * 0.34);
    ctx.lineTo(cx + r * 0.95, cy + r * 0.95);
    ctx.stroke();
  } else if (kind === "review") {
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.8, cy + r * 0.05);
    ctx.lineTo(cx - r * 0.15, cy + r * 0.7);
    ctx.lineTo(cx + r * 0.85, cy - r * 0.65);
    ctx.stroke();
  } else if (kind === "memo") {
    roundedPath(ctx, cx - r, cy - r * 0.72, r * 2, r * 1.44, r * 0.24);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.92, cy - r * 0.58);
    ctx.lineTo(cx, cy + r * 0.16);
    ctx.lineTo(cx + r * 0.92, cy - r * 0.58);
    ctx.stroke();
  } else if (kind === "gate") {
    circlePath(ctx, cx, cy - r * 0.45, r * 0.38);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.66, r * 0.62, Math.PI * 1.06, Math.PI * 1.94);
    ctx.stroke();
  } else if (kind === "power") {
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.25, cy - r);
    ctx.lineTo(cx - r * 0.45, cy + r * 0.1);
    ctx.lineTo(cx + r * 0.1, cy + r * 0.1);
    ctx.lineTo(cx - r * 0.25, cy + r);
    ctx.stroke();
  }
  ctx.restore();
}

const ROLE_LOOK = {
  researcher: {
    coat: "#2E4A85",
    coatLit: "#4A6FB8",
    pants: "#1B2740",
    skin: "#F0C9A0",
    hair: "#161E2E",
    accent: THEME.research,
    glasses: false,
  },
  reviewer: {
    coat: "#1F5C5C",
    coatLit: "#2E8A84",
    pants: "#172A38",
    skin: "#E8BE96",
    hair: "#2A2118",
    accent: THEME.review,
    glasses: true,
  },
};

export function roleLook(role) {
  return ROLE_LOOK[role] ?? ROLE_LOOK.researcher;
}

/** One flat-illustration colleague, three-quarter view. `x, y` is the top-left. */
export function drawAgentFigure(ctx, x, y, role, { breathe = 0, pose = "idle" } = {}) {
  const look = roleLook(role);
  const cx = x + AGENT_SIZE.w / 2;
  ctx.save();
  ctx.translate(0, breathe);
  // legs and feet
  fillRounded(ctx, x + 17, y + 60, 10, 20, 4.5, look.pants);
  fillRounded(ctx, x + 31, y + 60, 10, 20, 4.5, look.pants);
  fillRounded(ctx, x + 13, y + 78, 15, 8, 4, "#0E1725");
  fillRounded(ctx, x + 30, y + 78, 15, 8, 4, "#0E1725");
  // coat
  const coat = ctx.createLinearGradient(x, y + 30, x + AGENT_SIZE.w, y + 64);
  coat.addColorStop(0, look.coatLit);
  coat.addColorStop(0.55, look.coat);
  coat.addColorStop(1, "#16233A");
  fillRounded(ctx, x + 14, y + 30, 30, 34, 11, coat);
  // arms and hands
  fillRounded(ctx, x + 5, y + 34, 10, 25, 5, look.coat);
  fillRounded(ctx, x + 43, y + 34, 10, 25, 5, look.coat);
  drawDot(ctx, x + 10, y + 60, 4.2, look.skin);
  drawDot(ctx, x + 48, y + 60, 4.2, look.skin);
  // role badge on the chest
  fillRounded(ctx, cx - 3.5, y + 35, 7, 12, 2.5, look.accent);
  // head, hair and rim light
  drawDot(ctx, cx, y + 18, 13, look.skin);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, y + 17.5, 13, Math.PI, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = look.hair;
  ctx.fill();
  ctx.restore();
  glow(ctx, look.accent + "55", 8, () => {
    ctx.beginPath();
    ctx.arc(cx, y + 18, 13, Math.PI * 1.05, Math.PI * 1.75);
    ctx.strokeStyle = look.accent + "99";
    ctx.lineWidth = 1.6;
    ctx.stroke();
  });
  if (look.glasses) {
    ctx.save();
    ctx.strokeStyle = "#0B1220";
    ctx.lineWidth = 1.6;
    circlePath(ctx, cx - 5.2, y + 19, 4);
    ctx.stroke();
    circlePath(ctx, cx + 5.2, y + 19, 4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 1.4, y + 19);
    ctx.lineTo(cx + 1.4, y + 19);
    ctx.stroke();
    ctx.restore();
  }
  if (pose === "working") {
    drawDot(ctx, x + 52, y + 66, 2.6, THEME.working, THEME.working, 10);
    drawDot(ctx, x + 58, y + 60, 2.1, THEME.working, THEME.working, 10);
  }
  ctx.restore();
}

/** Name plate that floats above one executor: role, runtime provenance, pose. */
export function drawAgentTag(ctx, cx, y, entry, { dots = 0 } = {}) {
  const role = entry.role === "reviewer" ? "Reviewer" : "Researcher";
  const provider = providerStyle(entry.provider);
  const width = 26 + textWidth(ctx, role, 11.5, 600) + textWidth(ctx, " · " + provider.label, 11.5, 500);
  const height = 22;
  const x = cx - width / 2;
  ctx.save();
  fillRounded(ctx, x, y, width, height, 8, "rgba(8, 14, 26, 0.86)");
  glow(ctx, provider.color + "55", 10, () => strokeRounded(ctx, x, y, width, height, 8, provider.color + "77", 1.2));
  drawDot(ctx, x + 12, y + 11, 3.6, provider.color, provider.color, 8);
  label(ctx, role, x + 21, y + 11.5, { size: 11.5, weight: 600 });
  label(ctx, " · " + provider.label, x + 21 + textWidth(ctx, role, 11.5, 600), y + 11.5, {
    size: 11.5,
    weight: 500,
    color: THEME.muted,
  });
  if (entry.pose === "working") {
    for (let i = 0; i < dots; i++) drawDot(ctx, x + width + 8, y + 5 + i * 6, 2.2, THEME.working, THEME.working, 8);
  }
  if (entry.pose === "blocked" || entry.pose === "paused") {
    const tone = entry.pose === "blocked" ? THEME.blocked : THEME.paused;
    const text = entry.pose;
    const chip = textWidth(ctx, text, 10, 700) + 16;
    fillRounded(ctx, x + width + 6, y + 2, chip, 18, 6, tone + "22");
    strokeRounded(ctx, x + width + 6, y + 2, chip, 18, 6, tone + "88", 1);
    label(ctx, text, x + width + 14, y + 11.5, { size: 10, weight: 700, color: tone });
  }
  ctx.restore();
}

/**
 * One work object as a physical thing: a data capsule, a research dossier, a
 * review clipboard or a sealed candidate memo. Drawn as a billboard that floats
 * over its slot, so the object — not the person — is what the eye lands on.
 */
export function drawArtifactObject(ctx, cx, cy, item, { alpha = 1, emphasis = 0, bob = 0 } = {}) {
  const style = KIND_STYLE[item.kind] ?? { label: item.kind, short: item.kind, color: THEME.muted };
  const tone = stateTone(item.state, style.color);
  const y = cy + bob;
  ctx.save();
  ctx.globalAlpha = alpha;
  // floor contact: the object is lit, the floor remembers where it is
  ctx.save();
  ctx.globalAlpha = alpha * 0.5;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 30, 26, 9, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  ctx.fill();
  ctx.restore();
  glow(ctx, style.color + "AA", emphasis > 0 ? 26 : 18, () => {
    if (item.kind === "snapshot") {
      drawQuad(
        ctx,
        [
          { x: cx, y: y - 26 },
          { x: cx + 24, y: y - 13 },
          { x: cx, y: y },
          { x: cx - 24, y: y - 13 },
        ],
        style.color,
      );
      drawQuad(
        ctx,
        [
          { x: cx - 24, y: y - 13 },
          { x: cx, y: y },
          { x: cx, y: y + 24 },
          { x: cx - 24, y: y + 11 },
        ],
        "#3A2E6B",
      );
      drawQuad(
        ctx,
        [
          { x: cx + 24, y: y - 13 },
          { x: cx, y: y },
          { x: cx, y: y + 24 },
          { x: cx + 24, y: y + 11 },
        ],
        "#2A2252",
      );
      fillRounded(ctx, cx - 3, y - 16, 6, 12, 3, "#EDE9FF");
    } else if (item.kind === "research") {
      fillRounded(ctx, cx - 22, y - 26, 44, 56, 6, "#12203C");
      glow(ctx, style.color + "88", 10, () => fillRounded(ctx, cx - 18, y - 22, 36, 48, 4, style.color));
      fillRounded(ctx, cx - 12, y - 12, 24, 4, 2, "#C9DCFF");
      fillRounded(ctx, cx - 12, y - 3, 24, 4, 2, "#9CC0FF");
      fillRounded(ctx, cx - 12, y + 6, 14, 4, 2, "#9CC0FF");
      drawGlyph(ctx, "research", cx + 6, y + 17, 8, "#0A1120");
    } else if (item.kind === "review") {
      fillRounded(ctx, cx - 22, y - 26, 44, 56, 6, "#0E2A2C");
      glow(ctx, style.color + "88", 10, () => fillRounded(ctx, cx - 18, y - 22, 36, 48, 4, "#123A3C"));
      fillRounded(ctx, cx - 8, y - 30, 16, 7, 3, style.color);
      strokeRounded(ctx, cx - 12, y - 12, 24, 4, 2, "#8FE6DE", 3);
      drawGlyph(ctx, "review", cx, y + 12, 11, style.color);
    } else {
      fillRounded(ctx, cx - 24, y - 18, 48, 38, 6, "#3A2A08");
      glow(ctx, style.color + "88", 10, () => fillRounded(ctx, cx - 20, y - 14, 40, 30, 5, style.color));
      ctx.save();
      ctx.strokeStyle = "#8A6414";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(cx - 20, y - 14);
      ctx.lineTo(cx, y + 3);
      ctx.lineTo(cx + 20, y - 14);
      ctx.stroke();
      ctx.restore();
      drawDot(ctx, cx, y + 6, 6, "#FFF0C9", "#FFFFFF", 8);
    }
  });
  drawDot(ctx, cx + 26, y - 30, 4, tone, tone, 12);
  if (emphasis > 0) {
    ctx.save();
    ctx.globalAlpha = alpha * 0.9;
    glow(ctx, style.color + "88", 14, () => strokeRounded(ctx, cx - 40, cy - 52, 80, 96, 12, style.color, 1.6));
    ctx.restore();
  }
  ctx.restore();
}

/** The plate under a work object: what it is, which object it is, what state. */
export function drawArtifactPlate(ctx, cx, y, item, { alpha = 1, compact = false } = {}) {
  const style = KIND_STYLE[item.kind] ?? { label: item.kind, short: item.kind, color: THEME.muted };
  const tone = stateTone(item.state, style.color);
  const state = STATE_LABEL[item.state] ?? item.state;
  const title = style.label;
  const id = item.id;
  const width = Math.max(
    textWidth(ctx, title, 11, 700) + textWidth(ctx, " " + id, 11, 600) + 24,
    textWidth(ctx, state, 10, 600) + 34,
  );
  const height = compact ? 20 : 30;
  const x = cx - width / 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  fillRounded(ctx, x, y, width, height, 7, "rgba(7, 12, 22, 0.88)");
  glow(ctx, style.color + "66", 10, () => strokeRounded(ctx, x, y, width, height, 7, style.color + "77", 1.2));
  label(ctx, title, x + 10, y + 11, { size: 11, weight: 700, color: THEME.ink });
  label(ctx, " " + id, x + 10 + textWidth(ctx, title, 11, 700), y + 11, { size: 11, weight: 600, color: THEME.muted });
  if (!compact) {
    drawDot(ctx, x + 14, y + 22, 3.2, tone, tone, 8);
    label(ctx, state, x + 22, y + 22, { size: 10, weight: 600, color: tone });
  }
  ctx.restore();
}
