import { createIgnitionState } from "./ignition-state.js";
export function createScene(canvas, onPhase) {
  const life = createIgnitionState(),
    s = life.state,
    ctx = canvas.getContext("2d"),
    paint = new Image();
  let drawCount = 0,
    edgeImage = null,
    pixelPaint = null,
    ready = false,
    w = 0,
    h = 0,
    dpr = 1,
    raf = null,
    idle = null,
    visible = true,
    completion = null;
  let motionOff = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let focusEnergy = false;
  const nodes = [
    { name: "Control", label: "任务协调", x: 0.22, y: 0.32 },
    { name: "Researcher", label: "研究执行", x: 0.72, y: 0.32 },
    { name: "Reviewer", label: "独立复核", x: 0.76, y: 0.67 },
    { name: "Memory", label: "只读研究记忆", x: 0.22, y: 0.67 },
    { name: "Harness", label: "受控执行", x: 0.48, y: 0.72 },
  ];
  const paths = [
    [0, 1],
    [1, 2],
    [2, 4],
    [4, 3],
    [3, 0],
    [0, 4],
    [4, 1],
  ];
  const dust = Array.from({ length: 42 }, (_, i) => ({
    x: ((i * 73.71) % 101) / 101,
    y: ((i * 31.29) % 97) / 97,
    r: i % 8 === 0 ? 1.1 : 0.5,
  }));
  function cancelDraw() {
    if (raf !== null) cancelAnimationFrame(raf);
    if (idle !== null) clearTimeout(idle);
    raf = null;
    idle = null;
  }
  function wake() {
    cancelDraw();
    if (visible && !document.hidden) raf = requestAnimationFrame(tick);
  }
  function tick(now) {
    raf = null;
    idle = null;
    if (!visible || document.hidden) return;
    const done = life.advance(now);
    onPhase(s.phase);
    if (ctx) draw(now);
    canvas.dataset.phase = s.phase;
    if (done && completion) {
      const resolve = completion;
      completion = null;
      resolve(true);
    }
    if (life.isAnimating()) raf = requestAnimationFrame(tick);
    else if (!motionOff)
      idle = setTimeout(wake, s.phase === "online" ? 100 : 400);
  }
  // Preserve the original crop and hand geometry; render its material on a
  // small, palette-limited canvas to match the office's nearest-neighbor art.
  function buildPixelMaterial() {
    pixelPaint = document.createElement("canvas");
    pixelPaint.width = 269;
    pixelPaint.height = 124;
    const p = pixelPaint.getContext("2d", { willReadFrequently: true });
    p.drawImage(paint, 0, 0, 269, 124);
    const pixels = p.getImageData(0, 0, 269, 124);
    const palette = [
      [81, 76, 67], [112, 94, 72], [145, 116, 86], [174, 139, 103],
      [196, 163, 124], [215, 187, 149], [231, 209, 175], [244, 231, 206],
    ];
    for (let i = 0; i < pixels.data.length; i += 4) {
      const l = pixels.data[i] * .299 + pixels.data[i + 1] * .587 + pixels.data[i + 2] * .114;
      const color = palette[Math.min(7, Math.floor(l / 32))];
      pixels.data[i] = color[0]; pixels.data[i + 1] = color[1]; pixels.data[i + 2] = color[2];
    }
    p.putImageData(pixels, 0, 0);
  }
  // Static edge material is calculated once. The expanding circle reveals this second rendering.
  function buildEdges() {
    const tmp = document.createElement("canvas");
    tmp.width = 1614;
    tmp.height = 741;
    const c = tmp.getContext("2d", { willReadFrequently: true });
    c.imageSmoothingEnabled = false;
    c.drawImage(pixelPaint || paint, 0, 0, tmp.width, tmp.height);
    const src = c.getImageData(0, 0, tmp.width, tmp.height),
      out = c.createImageData(tmp.width, tmp.height),
      lum = new Float32Array(tmp.width * tmp.height);
    for (let i = 0; i < lum.length; i++)
      lum[i] =
        src.data[i * 4] * 0.299 +
        src.data[i * 4 + 1] * 0.587 +
        src.data[i * 4 + 2] * 0.114;
    const W = tmp.width,
      H = tmp.height;
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x,
          gx =
            -lum[i - W - 1] +
            lum[i - W + 1] -
            2 * lum[i - 1] +
            2 * lum[i + 1] -
            lum[i + W - 1] +
            lum[i + W + 1],
          gy =
            -lum[i - W - 1] -
            2 * lum[i - W] -
            lum[i - W + 1] +
            lum[i + W - 1] +
            2 * lum[i + W] +
            lum[i + W + 1];
        const e = Math.min(185, Math.max(0, (Math.hypot(gx, gy) - 55) * 1.5));
        const warm = x / W < 0.38;
        out.data[i * 4] = warm ? 142 : 89;
        out.data[i * 4 + 1] = warm ? 112 : 121;
        out.data[i * 4 + 2] = warm ? 74 : 98;
        out.data[i * 4 + 3] = e;
      }
    c.putImageData(out, 0, 0);
    edgeImage = tmp;
  }
  const clamp = (x) => Math.max(0, Math.min(1, x)),
    ease = (x) => x * x * (3 - 2 * x);
  function geometry() {
    return {
      cx: w * 0.5,
      cy: h * 0.51,
      scale: Math.max(w / 880, 1.05),
      gap: Math.min(190, Math.max(150, w * 0.23)),
    };
  }
  // Fragment clipping is done in source coordinates, then scaled uniformly.
  function material(image, closed, alpha) {
    const { cx, cy, scale, gap } = geometry();
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = false;
    for (const side of [-1, 1]) {
      const shift =
          side * gap * (1 - closed) + (side === -1 ? 8 : -6) * scale * closed,
        dy = (side === -1 ? -3 : 3) * closed;
      ctx.save();
      ctx.translate(cx + shift, cy);
      ctx.scale(scale, scale);
      ctx.translate(-614, -337 + dy);
      ctx.beginPath();
      ctx.rect(side === -1 ? 0 : 614, 245, side === -1 ? 614 : 1000, 190);
      ctx.clip();
      ctx.drawImage(image, 0, 0, 1614, 741);
      ctx.restore();
    }
    ctx.restore();
  }
  function glow(x, y, r, alpha, warm = false) {
    ctx.save();
    // Stepped square light replaces the old soft blue bloom.
    for (let ring = 4; ring >= 1; ring--) {
      const radius = Math.round(r * ring / 24 / 4) * 4;
      ctx.globalAlpha = alpha * (5 - ring) * .07;
      ctx.fillStyle = warm ? "#c4a37c" : "#7e9a80";
      ctx.fillRect(Math.round(x / 4) * 4 - radius, Math.round(y / 4) * 4 - radius, radius * 2, radius * 2);
    }
    ctx.restore();
  }
  function network(now, opacity, partial = 1) {
    const { cx, cy } = geometry();
    ctx.save();
    ctx.globalAlpha = opacity;
    const p = nodes.map((n) => ({ x: n.x * w, y: n.y * h }));
    paths.forEach(([a, b], i) => {
      ctx.strokeStyle = "rgba(92,116,93,.4)";
      ctx.lineWidth = 0.7;
      const x = p[a],
        y = p[b];
      ctx.beginPath();
      ctx.moveTo(x.x, x.y);
      ctx.quadraticCurveTo(cx, cy, y.x, y.y);
      ctx.stroke();
      if (s.phase === "online" && !motionOff) {
        const t = (now / 7000 + i * 0.17) % 1,
          xx = (1 - t) ** 2 * x.x + 2 * (1 - t) * t * cx + t * t * y.x,
          yy = (1 - t) ** 2 * x.y + 2 * (1 - t) * t * cy + t * t * y.y;
        ctx.fillStyle = "#536f5e";
        ctx.beginPath();
        ctx.arc(xx, yy, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    for (let i = 0; i < 24; i++) {
      const angle = i * 2.39996,
        rx = Math.cos(angle) * (w * 0.35),
        ry = Math.sin(angle) * (h * 0.25);
      ctx.strokeStyle = "rgba(92,116,93,.18)";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.bezierCurveTo(
        cx + rx * 0.25,
        cy + ry * 0.8,
        cx + rx * 0.65,
        cy + ry * 0.2,
        cx + rx,
        cy + ry,
      );
      ctx.stroke();
    }
    p.forEach((n, i) => {
      const lit = partial > i / 5;
      ctx.globalAlpha = opacity * (lit ? 1 : 0.12);
      ctx.strokeStyle = "#817564";
      ctx.lineWidth = 0.7;
      ctx.fillStyle = "#f2e8d5";
      ctx.beginPath();
      ctx.rect(n.x - 10, n.y - 10, 20, 20);
      ctx.fill();
      ctx.stroke();
      glow(n.x, n.y, 22, 0.22);
      ctx.fillStyle = i === 0 ? "#8d6839" : "#536f5e";
      ctx.beginPath();
      ctx.rect(n.x - 3, n.y - 3, 6, 6);
      ctx.fill();
      ctx.font = "11px -apple-system, sans-serif";
      ctx.textAlign = "left";
      ctx.fillStyle = "#514c43";
      ctx.fillText(nodes[i].name, n.x + 18, n.y + 4);
      ctx.font = "9px -apple-system, sans-serif";
      ctx.fillStyle = "#686459";
      ctx.fillText(nodes[i].label, n.x + 18, n.y + 18);
    });
    ctx.restore();
  }
  function draw(now) {
    drawCount++;
    canvas.dataset.drawCount = String(drawCount);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#e4dfd2";
    ctx.fillRect(0, 0, w, h);
    if (!ready) return;
    const { cx, cy, scale } = geometry(),
      elapsed = Math.max(0, now - s.started),
      first =
        life.isAnimating() && life.acknowledged() && s.kind === "creation";
    let closed = s.ever ? 1 : first ? ease(clamp((elapsed - 400) / 1050)) : 0;
    if (s.reduced && life.isAnimating()) closed = 1;
    ctx.save();
    ctx.filter = "none";
    material(pixelPaint || paint, closed, s.phase === "online" ? 0.16 : s.ever ? 0.13 : 0.7);
    ctx.filter = "none";
    ctx.restore();
    const maxR = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy)),
      wave =
        first && !s.reduced ? clamp((elapsed - 1800) / 1750) : s.ever ? 1 : 0;
    if (wave > 0 && edgeImage) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, maxR * wave, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = "#e4dfd2";
      ctx.fillRect(0, 0, w, h);
      material(
        edgeImage,
        closed,
        s.ever && s.phase !== "online" && !life.isAnimating()
          ? 0.25
          : s.kind === "resume" && life.isAnimating()
            ? 0.25 + 0.65 * s.progress
            : 0.85,
      );
      network(
        now,
        s.ever && s.phase !== "online" && !life.isAnimating()
          ? 0.12
          : s.kind === "resume" && life.isAnimating()
            ? 0.12 + 0.74 * s.progress
            : 0.86,
        s.kind === "resume" && life.isAnimating() ? s.progress : 1,
      );
      ctx.restore();
    }
    // Fade the source crop naturally into the stage, without fading the network.
    const cropTop = cy + (245 - 337) * scale,
      cropBottom = cy + (435 - 337) * scale;
    for (const [start, end, reverse] of [
      [cropTop, cropTop + 85, false],
      [cropBottom - 85, cropBottom, true],
    ]) {
      const g = ctx.createLinearGradient(0, start, 0, end);
      g.addColorStop(0, reverse ? "rgba(228,223,210,0)" : "#e4dfd2");
      g.addColorStop(1, reverse ? "#e4dfd2" : "rgba(228,223,210,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, start, w, end - start);
    }
    if (wave > 0 && wave < 1) {
      ctx.strokeStyle = "rgba(126,154,128,.7)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, maxR * wave, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(126,154,128,.1)";
      ctx.lineWidth = 9;
      ctx.stroke();
    }
    const energy =
      s.phase === "typing" ? s.energy * 0.32 : focusEnergy ? 0.06 : 0;
    if (energy) {
      glow(cx - 20, cy, 100, energy, true);
      glow(cx + 20, cy, 120, energy);
      if (s.energy > 0.35) {
        ctx.strokeStyle = `rgba(126,154,128,${s.energy * 0.12})`;
        ctx.beginPath();
        ctx.moveTo(cx - 25, cy + 4);
        ctx.lineTo(cx, cy - 3);
        ctx.lineTo(cx + 24, cy);
        ctx.stroke();
        network(now, s.energy * 0.035);
      }
    }
    if (
      [
        "attraction",
        "contact",
        "wave",
        "settling",
        "online",
        "resuming",
      ].includes(s.phase)
    ) {
      const a = s.phase === "contact" ? 1 : s.phase === "online" ? 0.45 : 0.6;
      glow(cx - 12, cy, 150, a * 0.4, true);
      glow(cx + 8, cy, 180, a * 0.6);
      if (s.phase === "contact" && !s.reduced) {
        const flash = Math.sin(clamp((elapsed - 1450) / 350) * Math.PI) * 0.33;
        ctx.fillStyle = `rgba(244,231,206,${flash})`;
        ctx.fillRect(0, 0, w, h);
      }
    }
    const opacity = s.phase === "online" ? 0.24 : 0.1;
    dust.forEach((p, i) => {
      ctx.fillStyle = `rgba(126,137,112,${opacity})`;
      ctx.beginPath();
      ctx.arc(
        p.x * w + (motionOff ? 0 : Math.sin(now / 14000 + i) * 5),
        p.y * h,
        p.r,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    });
  }

  function resize() {
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    wake();
  }
  paint.onload = () => {
    try {
      if (ctx) { buildPixelMaterial(); buildEdges(); }
      ready = true;
    } catch {
      ready = true;
    }
    resize();
  };
  paint.onerror = () => {
    canvas.dataset.assetError = "true";
  };
  paint.src = "/assets/creation-of-adam.jpg";
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cancelDraw();
    else wake();
  });
  window.addEventListener("pagehide", cancelDraw);
  resize();
  return {
    begin() {
      life.begin(performance.now(), motionOff);
      wake();
    },
    confirm() {
      if (!life.acknowledge(performance.now())) return Promise.resolve(false);
      return new Promise((resolve) => {
        completion = resolve;
        wake();
      });
    },
    cancel() {
      life.cancel();
      if (completion) {
        completion(false);
        completion = null;
      }
      onPhase(s.phase);
      wake();
    },
    type(length) {
      life.type(length);
      wake();
    },
    online(value) {
      life.online(value);
      wake();
    },
    show(value) {
      visible = value;
      if (value) resize();
      else cancelDraw();
    },
    motion() {
      motionOff = !motionOff;
      if (life.isAnimating()) s.reduced = motionOff;
      wake();
      return motionOff;
    },
    reduced: () => motionOff,
  };
}
