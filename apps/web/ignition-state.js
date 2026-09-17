// Visual progress is gated by backend acknowledgement, never a substitute for it.
export function createIgnitionState() {
  const state = {
    phase: "dormant",
    started: 0,
    progress: 0,
    energy: 0,
    ever: false,
    kind: "creation",
    reduced: false,
  };
  let active = false,
    acknowledged = false;
  return {
    state,
    begin(now, reduced = false) {
      if (active) return false;
      active = true;
      acknowledged = false;
      Object.assign(state, {
        phase: "silence",
        started: now,
        progress: 0,
        reduced,
        kind: state.ever ? "resume" : "creation",
      });
      return true;
    },
    acknowledge(now) {
      if (!active) return false;
      acknowledged = true;
      state.started = now;
      return true;
    },
    advance(now) {
      if (!active) return false;
      if (!acknowledged) {
        state.phase = "silence";
        return false;
      }
      const duration = state.reduced
        ? 350
        : state.kind === "resume"
          ? 1600
          : 3800;
      const elapsed = Math.max(0, now - state.started);
      state.progress = Math.min(1, elapsed / duration);
      state.phase = state.reduced
        ? "settling"
        : state.kind === "resume"
          ? "resuming"
          : elapsed < 400
            ? "silence"
            : elapsed < 1450
              ? "attraction"
              : elapsed < 1800
                ? "contact"
                : elapsed < 3550
                  ? "wave"
                  : "settling";
      if (state.progress === 1) {
        active = false;
        state.phase = "online";
        state.ever = true;
        return true;
      }
      return false;
    },
    cancel() {
      active = false;
      acknowledged = false;
      Object.assign(state, { phase: "dormant", progress: 0, energy: 0 });
    },
    type(length) {
      if (active) return;
      state.energy = Math.min(1, length / 24);
      state.phase = length ? "typing" : "dormant";
    },
    online(value) {
      if (active) return;
      if (value || state.phase === "online")
        state.phase = value ? "online" : "dormant";
      if (value) state.ever = true;
    },
    isAnimating: () => active,
    acknowledged: () => acknowledged,
  };
}
