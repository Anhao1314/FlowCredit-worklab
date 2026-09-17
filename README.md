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
