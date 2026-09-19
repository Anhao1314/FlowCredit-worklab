# FlowCredit Research Office — persistent organization design

Run `node apps/web/swarm-space/serve.mjs` and open `http://127.0.0.1:8123/`.
The workspace home also links to `/swarm-space/`; both the runtime static allowlist and Pages build include the office assets.

## Design and interaction

The warm cream, sage, wood and procedural pixel cast remain. Five permanent desks encode Research, Risk, Evidence, Synthesis and independent Review. Temporary AgentRuns occupy these duties; provider names remain secondary. Physical folders, review dossiers and memo envelopes carry the work. The archive wall stores accumulated history; coordination retains task records; Human Gate is never an AI workstation.

`organization-story.js` defines eleven immutable, explicitly selected design scenes. `organization-scene.js` renders them using the existing office drawing primitives and Munder cast. `main.js` handles navigation, inspection and event-triggered movement. The older renderer and fixtures remain as a tested baseline.

The story shows parallel contributions sharing one task and snapshot, assembly with explicit input provenance, independent review, a separate revision record, a linked new repair task, interruption and replacement preserving the same saved checkpoint, a new revised artifact, human decision pending, and stand-down. Stand-down retains tasks, object identities, digests and the preceding gate state. PASS never opens the gate.

Use previous/next, restart, or the scene picker. Click desks, workers, task cards or documents to inspect their metadata; the expandable object directory provides keyboard-accessible alternatives. Pause freezes motion. Reduced-motion preference makes arrivals and handoffs immediate. Scene changes are explicit; time never advances organizational state. `?scene=WORKER_REPLACED` selects a scene and `?empty=1` hides workers and documents for room inspection. Earlier scene URLs remain compatible.

## Truth boundary

**DESIGN MOCK / READ ONLY**, not live telemetry. Parallel specialist roles, synthesis, linked repair orchestration and Codex replacement are proposed interactions, not claims that these executors are connected. The office does not call providers, persist records, approve candidates or modify runtime lifecycle semantics. IDs and digests are illustrative. The Human Gate intentionally has no approval control.

## Source and licensing

Upstream: https://github.com/chaitanyagiri/munder-difflin

The pinned revision, MIT license and adaptation details are in `vendor/munder-difflin/README.md`. `portrait-art.js` is the procedural cast generator with TypeScript annotations stripped. Furniture, rooms and organizational storytelling are FlowCredit code. No LimeZu tilesets or maps are distributed. This integrates visual code, not the upstream Electron app or harness.

## Verification

`node --test tests/**/*.test.mjs`

Tests cover immutable projections, provenance, linked repair, checkpoint retention across replacement, stand-down authority, rendering, handoff endpoints and moving hit targets, reduced-motion behavior, HTTP asset allowlisting and Pages packaging. `node scripts/check.mjs` additionally rejects local runtime files; the existing untracked `.peridot/memory.db` is preserved and currently blocks that check.
