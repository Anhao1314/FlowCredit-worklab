# Security model

## Credential lifecycle

Activation accepts a key only through a loopback JSON request. The browser immediately clears the input and does not write web storage. A closure-backed Harness CredentialProvider returns the key to the official provider adapter when needed. It cannot persist credentials. No `.env` loader or environment-key fallback is registered.

Stand Down clears the capability, cancels/drains pending work and releases the child and its coordinator Session. Process exit discards it. Startup always begins without a key. JavaScript reference clearing is not an OS heap/swap erasure guarantee. Public source never contains real credentials; tests use non-secret sentinels.

## Least privilege

Researcher receives one native read tool with a program-bound Task/Session and immutable Snapshot. Record IDs are checked against the snapshot's authorization set; unknown fields, cross-snapshot requests and unauthorized records return refusal. The model receives no database filename. The read callback also verifies that the calling child belongs to the invocation’s coordinator parent. Reviewer receives the candidate artifact and only its cited authorized excerpts; its explicit tool allowlist is empty. The Researcher tool is unregistered at the end of its invocation.

No shell, arbitrary filesystem, database, browser, generic network or write tool is registered. Dependency packages may include peer libraries for those features; installation is not permission. Harness is the execution runtime, **not the final security boundary**. Policy resides in the application adapter, tool checks, immutable bindings, read-only database connections and transport gate. This is not an adversarial multi-tenant OS sandbox.

## Authority and data

Only publicly shareable Northstar synthetic documents are seeded. R-04 is a real Retrieval Candidate with pending admission, not Evidence. Models cannot create/admit evidence, revise a claim, apply proposals, write relations or record human decisions. Model output is normalized into bounded candidate schemas; unsupported Reviewer decisions are rejected.

The fixture setup uses an explicitly test-enabled AdmissionLayer before Agent execution. The v2 action is explicitly named as a synthetic test-store administration operation. Fingerprints of records, links, admission tables and retrieval objects are compared before and after each execution. Candidate artifacts are stored solely in the separate Control store.

## Budget, cancellation, recovery

Requests reserve durable budget **before** dispatch. Failed or uncertain requests still consume it. Retry is disabled. A single task allows at most two Researcher requests and one Reviewer request; the baseline runtime caps total requests at six. Additional tools or continuations fail closed rather than silently expanding the budget.

Cancellation invalidates the execution generation and prevents late candidate commits. Startup marks interrupted attempts for inspection instead of rerunning them. Missing artifacts, context hashes, snapshots or revision bindings block recovery before inference. There is no exactly-once guarantee for remote billing if a process dies during a request.

## HTTP and repository

The server listens only on 127.0.0.1. Host and Origin checks, JSON-only writes, request size limits, no-store responses and a restrictive content policy reduce unintended cross-origin activation. Local processes with user-level access remain outside the threat model.

Runtime databases, exports, logs, sessions, dependency trees, temporary fixtures and environment files are ignored. `npm run check` scans source candidates for credential patterns, machine paths, oversized files and runtime payloads. Pattern scans supplement explicit privacy review; they are not proof that arbitrary private text cannot exist.

Default tests substitute transport responses and never contact DeepSeek. CI has no DeepSeek secret. Live testing is an explicit manual UI action.

## Native delegation boundary

Official Harness `spawn` executes in this Node process. The application remains serial and uses a process-global transport gate; it is not safe to interpret this migration as support for concurrent runtimes or arbitrary external executors. The native provider enables no shell execution or inherited chat history. Version 0.2 additionally offers a tool-free Claude Code SDK reviewer through a separate process adapter; see [local platform](local-platform.md) for its independent environment, delegated-run accounting and process-exit limits. A parent Agent handle receives no model task and incurs no inference request. Delegation completion still requires application validation before candidate artifacts can advance a checkpoint. See [native collaboration](harness-collaboration.md).
