/**
 * requestAnimationFrame loop with a clamped delta.
 *
 * PORTED from pixel-agents (MIT License).
 *   upstream: https://github.com/pixel-agents-hq/pixel-agents
 *   commit:   3537e140c2094761beae748592aeb92ece8edfdd (v1.4.1)
 *   path:     webview-ui/src/office/engine/gameLoop.ts
 * Changes for FlowCredit V0:
 *   - the upstream constant import becomes a local constant;
 *   - callbacks receive `(dtSeconds, elapsedMs)` because the spike drives
 *     purely time-based decoration and needs a monotonic clock;
 *   - the loop returns a disposer that also reports frame counts (FPS readout).
 * Changes for FlowCredit V0.6:
 *   - the upstream pixel-rasterisation rule is dropped: the office draws
 *     vector shapes and text, not zoomed sprites.
 * See THIRD_PARTY_NOTICES.md for the full attribution.
 */

export const MAX_DELTA_TIME_SEC = 0.1;

export function startGameLoop(canvas, { update, render, onFrame }) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error("CANVAS_2D_UNAVAILABLE");

  let lastTime = 0;
  let startedAt = 0;
  let rafId = 0;
  let stopped = false;
  let frames = 0;

  const frame = (time) => {
    if (stopped) return;
    if (!startedAt) startedAt = time;
    const dt = lastTime === 0 ? 0 : Math.min((time - lastTime) / 1000, MAX_DELTA_TIME_SEC);
    lastTime = time;

    update(dt, time - startedAt);

    render(ctx);

    frames++;
    if (onFrame) onFrame(frames, time);
    rafId = requestAnimationFrame(frame);
  };

  rafId = requestAnimationFrame(frame);

  return () => {
    stopped = true;
    cancelAnimationFrame(rafId);
  };
}
