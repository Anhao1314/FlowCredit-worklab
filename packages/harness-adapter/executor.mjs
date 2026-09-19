import { SessionId } from "./harness.mjs";
import { hash, uuid } from "../task-context/contracts.mjs";

/** One program-owned delegation. The coordinator never receives a model task. */
export class HarnessSubagentExecutor {
  constructor(ctx, { hasPower, event }) {
    this.ctx = ctx;
    this.hasPower = hasPower;
    this.event = event;
    this.active = null;
  }

  cancel() {
    this.active?.controller.abort();
  }

  async execute({ task, role, input, instructions, readRecords, onStarted }) {
    if (this.active) throw Error("EXECUTOR_BUSY");
    if (!["Researcher", "Reviewer"].includes(role))
      throw Error("ROLE_NOT_SUPPORTED");
    const execution = { controller: new AbortController(), reads: [] };
    this.active = execution;
    const signal = execution.controller.signal;
    const route = {
      provider: "deepseek-official",
      model: "deepseek-v4-flash",
      maxTokens: 2600,
    };
    let parent, child, unregister, outcome;
    let failure = null;
    let releaseFailure = null;
    const start = Date.now();
    const timer = setTimeout(() => execution.controller.abort(), 65000);
    try {
      parent = await this.ctx.agents.create({
        sessionId: SessionId(uuid("fc-coordinator")),
        agentOptions: route,
        signal,
      });
      if (role === "Researcher") {
        unregister = this.ctx.tools.register({
          name: "get_authorized_records",
          description:
            "Read records authorized by the fixed task snapshot. Call once with all recordIds. No other snapshot or writes are permitted.",
          parameters: {
            type: "object",
            properties: {
              recordIds: {
                type: "array",
                items: { type: "string" },
                minItems: 1,
                maxItems: 4,
              },
            },
            required: ["recordIds"],
            additionalProperties: false,
          },
          output: {
            schema: {
              type: "object",
              properties: {
                records: { type: "array", items: { type: "object" } },
              },
              required: ["records"],
              additionalProperties: false,
            },
            render: (_args, value) => [
              { type: "text", text: JSON.stringify(value) },
            ],
          },
          execute: async (args, exec) => {
            if (
              signal.aborted ||
              exec.signal.aborted ||
              !this.hasPower() ||
              exec.agent?.session.header.parentSession !== parent.agent.id
            )
              throw Error("FORBIDDEN");
            if (execution.reads.length) throw Error("READ_BUDGET_EXHAUSTED");
            const records = readRecords(args);
            const read = {
              taskId: task.id,
              snapshotId: task.context.snapshotId,
              recordIds: records.map((r) => r.id),
              callId: exec.callId,
              sessionId: exec.agent.id,
            };
            execution.reads.push(read);
            this.event("HARNESS_RECORDS_READ", read);
            return { records };
          },
        });
      }
      child = await this.ctx.subagents.start("spawn", {
        parent: parent.agent,
        label: `FlowCredit ${role}`,
        prompt: [
          {
            type: "text",
            text: instructions + "\nINPUT_JSON\n" + JSON.stringify(input),
          },
        ],
        signal,
        agentOptions: route,
        maxDepth: 1,
        toolFilter: {
          allow: role === "Researcher" ? ["get_authorized_records"] : [],
        },
      });
      if (
        !child.localAgent ||
        child.localAgent.session.header.parentSession !== parent.agent.id
      )
        throw Error("DELEGATION_BINDING");
      const lineage = {
        executor: "harness-spawn",
        provider: "spawn",
        parentSessionId: parent.agent.id,
        childSessionId: child.id,
        taskId: task.id,
        role,
        contextDigest: task.digest,
        snapshotId: task.context.snapshotId,
      };
      onStarted(child.id, lineage);
      this.event("HARNESS_DELEGATION_STARTED", lineage);
      const result = await child.result;
      const agent = child.localAgent;
      const events = agent.session.snapshotEvents();
      const response = events.findLast((e) => e.type === "assistant/message");
      const toolCalls = events
        .filter((e) => e.type === "tool/call")
        .map((e) => ({ callId: e.data.callId, name: e.data.name }));
      const receipt = {
        ...lineage,
        modelRoute:
          events.findLast((e) => e.type === "request/context")?.data ?? null,
        stopReason: result.stopReason,
        parentModelRequests: parent.agent.session
          .snapshotEvents()
          .filter((e) => e.type === "request/context").length,
        freshSession: !agent.session.header.isSeeded,
        inheritedConversation: false,
        toolCalls,
        eventTypes: events.map((e) => e.type),
        usage: response?.data.usage ?? null,
        wallClockMs: Date.now() - start,
        inputDigest: hash(input),
      };
      this.event("HARNESS_DELEGATION_SETTLED", {
        ...lineage,
        stopReason: result.stopReason,
      });
      outcome = {
        raw: result.output
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join(""),
        toolReads: execution.reads,
        receipt,
      };
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      clearTimeout(timer);
      // Teardown is attempted for every owned resource even if an earlier release fails.
      const failures = [];
      for (const handle of [child, parent]) {
        if (!handle) continue;
        const id = handle.id ?? handle.agent.id;
        try {
          await handle.dispose();
          this.event("SESSION_RELEASED", {
            session: id,
            agentAbsent: !this.ctx.agents.get(id),
            sessionAbsent: !this.ctx.sessions.get(id),
          });
        } catch (error) {
          failures.push(error);
        }
      }
      try {
        unregister?.();
      } catch (error) {
        failures.push(error);
      }
      this.active = null;
      if (failures.length) {
        // A release failure must not replace the real execution error. When the
        // run already failed, keep the root cause and record the teardown issue
        // separately; otherwise surface it as a soft failure the runtime must
        // not report as a successful run.
        if (failure) {
          try {
            failure.releaseFailure ??= "EXECUTOR_RELEASE_FAILED";
          } catch {}
          this.event("EXECUTOR_RELEASE_FAILED", {
            role,
            taskId: task.id,
            rootCause: failure.message,
          });
        } else releaseFailure = "EXECUTOR_RELEASE_FAILED";
      }
    }
    if (releaseFailure) {
      this.event("EXECUTOR_RELEASE_FAILED", {
        role,
        taskId: task.id,
        rootCause: null,
      });
      return { ...outcome, releaseFailure };
    }
    return outcome;
  }
}
