# Validated milestones

These are **locally validated experimental results**, reconfirmed from the original CHECKS documents during P0 inventory. They are not claims of CI model validation, production readiness or general semantic accuracy. Private runtime payloads, session dumps, screenshots and credentials are not included here.

| Milestone | Locally established property | Historical real DeepSeek requests |
| --- | --- | --- |
| H0 | RAM-only capability, actual Harness Agent invocation, release on Stand Down, no new execution without power | 2 / 4 allowed |
| H1 | Independent Researcher/Reviewer Sessions; structured artifacts; one injected scope fault caused a bounded correction; Session release | 6 / 8 allowed |
| H2 | Durable Duty/Task/Checkpoint, actual backend process exit, no-key restore, fresh Reviewer consumes existing research; missing-artifact refusal; material dedup | 4 / 6 allowed |
| H3 | Actual Core synthetic Knowledge store, native Harness read tools, fixed revision snapshots, no-silent-latest, read-only execution, cross-context and integrity refusal | 6 / 6 allowed |

Those runs used Harness 0.1.5-alpha.1 and the official DeepSeek adapter. Reviewer outputs retained limitations and occasional interpretation errors; PASS was never human approval.

P0 integrates the final H3 baseline, including H0 ephemeral power, H1 independent collaboration, H2 persistence/recovery, and H3 version-bound Knowledge access. Fault-injection controls and lab acceptance reports were excluded. A non-PASS review currently stops for attention; the older lab-specific automatic correction demonstration is not advertised as an autonomous resident workflow.

P0 default tests exercise actual public Core code and installed Harness packages with substituted model responses, plus actual HTTP-process shutdown/restart. **P0 makes no additional live inference claim.** GitHub Actions runs these offline checks only; its status is separate from the historical local milestones.

Future work, not implemented: event-driven resident loop, scheduler, Human Review Queue, Human Apply and authoritative research updates.
