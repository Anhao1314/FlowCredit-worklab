# Source inventory and assembly decisions

| Inspected source | Finding | Platform decision |
| --- | --- | --- |
| H0 capability / Harness composition | Foundation repeated in later experiments | Keep one credential provider and official package imports |
| H1 coordinator and CHECKS | Independent Sessions and artifact exchange; fault-injection and local correction test story | Retain role/session separation and review outcomes; exclude experimental fault controls |
| H2 store and recovery | Durable Control objects, budget reservation and transaction ordering | Keep the same state model and integrity boundary |
| H3 adapter, fixture seed, runtime, UI and tests | Includes H0 power, H1 pair, H2 recovery, H3 actual Core snapshot reads | Extract into plane-oriented modules rather than four lab directories |
| Original FlowCredit Core | Required Memory/Retrieval/Admission APIs are public at the pinned commit | Download verified public dependency subset; never import local development files |
| Relation runtime | Not required for H3 pass; adds an independent relation/fallback contract | Not integrated in P0 |
| Creation activation concept | Mock message lifecycle, embedded simulated Workspace, additional visual roles | Retain current functional UI and document future API seam |
| Lab runtime data | SQLite, actual artifacts, process reports and screenshots are execution history | Never copy or publish |

Core public availability was checked against commit `5f09036404401bb922ecdca9e423683c3693aafd` in `Anhao1314/flowcredit-research`. The inspected Memory store/backend, AdmissionLayer, RetrievalIndex and validation entry matched the local source used by H3. Installation and fresh-clone tests use the downloaded public commit, so success does not depend on unpublished local code.

Harness H3 imports used local built packages at version 0.1.5-alpha.1. Equivalent official registry versions exist. The platform resolves only those exact packages and their pinned peer closure; it neither forks nor copies Harness.

All machine-specific source imports were replaced. Core does not publish a root npm package, so `core.lock.json` and `scripts/setup-core.mjs` define a checksum-verified acquisition step. Required validation dependencies are pinned in the platform npm lockfile. The external Core retains its own MIT license inside the dependency directory.

P0 scope remains baseline assembly. No Event Inbox, automatic trigger, additional Agent, human apply flow, webhook or scheduler was added.
