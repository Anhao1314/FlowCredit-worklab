# FlowCredit

FlowCredit is a persistent research swarm where models provide temporary inference power, agents execute work, and research memory retains authority.

This is a research system, not an agent chat room. Work belongs to persistent Duties and Tasks; Researcher and Reviewer use independent DeepSeek Harness sessions. A version-bound, read-only FlowCredit snapshot supplies the evidence. An AI candidate or Reviewer PASS never admits evidence or revises a claim.

**Current locally validated baseline: H0–H3.** P0 assembles that baseline into this repository. Event-driven resident loops and Human Apply are roadmap items, not implemented capabilities.

## Start

Requirements: **Node 24.19.0**, **npm 11.11.0**, and `tar` (macOS/Linux). The first install requires npm registry and GitHub access; the offline tests require no API key or model service.

```sh
git clone https://github.com/Anhao1314/d.git
cd d
npm ci
npm test
npm run dev
```

Open **http://127.0.0.1:8799**. The platform starts Dormant, initializes only a disposable Northstar **SYNTHETIC DATA** store, and supports browsing with the model off.

1. Create E to bind Snapshot S1 to Claim v1.
2. Optionally use **测试库新增 v2**, an explicit synthetic fixture administration action. E stays on v1.
3. Enter a DeepSeek API key in Activation. The key stays in runtime RAM; never put it in `.env`, a command, or a file. Activation creates a capability; the first inference validates the provider credential.
4. Resume E. Researcher obtains text through a real Harness read tool, then a fresh Reviewer examines the candidate and cited excerpts. A PASS yields a candidate memo, not research approval.
5. Create F explicitly bound to v2 and resume it. Stand Down clears the key and releases sessions. Control-C stops the server. Restart restores work, never the key.

The synthetic baseline has a **persistent six-request cap**: each task normally uses two Researcher requests (including the tool continuation) and one Reviewer request. Repeated Resume of completed work costs no new request. Do not delete the ledger to bypass a budget. A failed/uncertain attempt may require manual inspection.

## Planes in code

| Plane | Implementation |
| --- | --- |
| Experience | `apps/web`: Activation, status, source links, minimal Workspace |
| Control | `packages/control-plane`: Duty, Task, runs, checkpoints, artifacts, request ledger, recovery |
| Execution | `packages/harness-adapter`: official DeepSeek Harness packages and ephemeral credentials |
| Knowledge | `packages/research-adapter`: version-bound reads through the actual FlowCredit domain services |
| Model | Official Harness DeepSeek adapter; only the DeepSeek completions endpoint is allowed |

## Reproducible dependencies

- DeepSeek Harness components: **0.1.5-alpha.1**, exact dependency closure pinned in `package.json` and `package-lock.json`; Cordis **4.0.2**. No Harness fork or copied source.
- FlowCredit Core: public commit **`5f09036404401bb922ecdca9e423683c3693aafd`** of [flowcredit-research](https://github.com/Anhao1314/flowcredit-research/tree/5f09036404401bb922ecdca9e423683c3693aafd). Upstream has no root npm package, so the install script downloads the fixed archive, verifies the SHA-256 in `core.lock.json`, and extracts only the domain dependency directories into ignored `.deps/flowcredit-core`. It never reads a local development checkout.
- Node and npm versions are recorded in `.nvmrc` and `package.json`.

`npm ci` needs lifecycle scripts enabled. No original FlowCredit server or sidecar is started. Do not confuse installed Harness peer packages with granted tools: filesystem, shell, session persistence, and arbitrary network plugins are not registered.

## Checks and live opt-in

```sh
npm run check       # syntax, source privacy patterns, path and dependency checks
npm test            # offline: actual Core + Harness with substituted model responses
npm run test:live    # instructions only; no live call by default
```

`FLOWCREDIT_LIVE=1 npm run test:live` starts the manual live smoke entry. Supply the key only in the UI. GitHub Actions runs source checks and offline tests; no DeepSeek secret or live inference is configured. P0 itself made **zero new live requests**; H0–H3 live results are explicitly historical local validation.

All mutable data stays in ignored `.runtime/`: synthetic Knowledge SQLite, Control SQLite, candidate exports and non-secret comparison reports. Non-secret configuration: `FLOWCREDIT_PORT`, `FLOWCREDIT_RUNTIME_DIR`. `.env.example` is explanatory; the app does not load `.env` files. To inspect a completed run, keep its runtime directory rather than regenerate it.

See [architecture](docs/architecture.md), [security model](docs/security-model.md), [source inventory](docs/source-inventory.md), and [validated milestones](docs/validated-milestones.md).

Limitations: local single-user operation; synthetic Knowledge store rather than private production research; model review is fallible and incomplete/interrupted work is not automatically retried. There is no scheduler, event inbox, Human Apply, or automatic authoritative write.

## One connected workspace

Open the platform once and use the left navigation:

1. **研究概览** — current synthetic Claim, pending work and persistent Duty context.
2. **研究记忆** — browse accepted evidence, pending candidate R-04 and provenance with AI off.
3. **任务协作** — create E to freeze v1 and R-01–R-04, provide a temporary key, then explicitly start research. Researcher and Reviewer exchange structured artifacts; their outputs and unresolved questions appear in the same task.
4. **执行记录** — actual lifecycle events, tool reads, independent sessions and request ledger.

Citation links open the task's original source excerpt. A candidate memo does not
update the Claim or evidence admission state. Stand Down clears the capability while
retaining work. After restarting, browsing remains available; resuming eligible work
requires a new key. Interrupted or integrity-blocked work is shown for inspection,
not automatically retried. The expandable synthetic-version check creates v2 only
by explicit user action, leaving E bound to v1.

The offline HTTP workflow test traverses the actual server, Core, Harness and
persistent store. Only model transport is stubbed in the test child process. A separate
late-response test verifies that stopping cannot produce a successful memo or revive
provider-validation status. No stub is imported by the production startup command.

### Creation homepage

The default entry now opens the Creation of Adam fingertip scene. Enter a DeepSeek
key at the gap, activate, and the real runtime acknowledgement releases the contact
and wave animation before opening this platform's workspace. No model request is
made until you explicitly start a research task. The key is not validated by the
animation. Use “只读查看研究记忆” to enter without a key.

The workspace logo returns to the homepage. “停止 / 状态” clears the capability;
reconnecting from a workspace page returns to that page after activation. Cancellation
also clears the key, including when the activation response is delayed. Reduced motion
can be enabled on the homepage and respects the operating-system preference.

Artwork attribution: [local asset notes](apps/web/assets/ATTRIBUTION.md). Assets are
served by the same loopback runtime; there is no CDN or embedded old demo. Use
`npm run dev`, not `file://`, because this entry requires the actual platform backend.

## Public GitHub Pages demo

[Open the public demo](https://anhao1314.github.io/d/).

Pages is a separate **synthetic, browser-only demonstration**, not the Node/Harness
runtime. It shares the Creation scene and workspace presentation, but replaces the
transport at build time with an explicit, bounded simulation. It has no key input,
model calls, database connection or persistence; refresh/reset clears the session.
A persistent banner identifies this mode. CSP blocks network connections and form
submissions. Researcher and Reviewer outputs are preset, not model judgments.

`npm run build:pages` generates `.pages/` from allowlisted web assets and freshly
seeded public Northstar fixtures only. It never exports `.runtime/` or private data.
The Pages workflow tests and publishes this artifact on main updates. The regular
`npm run dev` entry continues to run the real local backend and ephemeral credential
flow. Pages does not replace or relax that runtime's security model.
