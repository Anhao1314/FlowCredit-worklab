import { query } from "@anthropic-ai/claude-agent-sdk";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { hash, uuid } from "../task-context/contracts.mjs";

// Dedicated, no-tool reviewer. No project settings, MCP, inherited credentials or sessions.
export class ClaudeCodeExecutor {
  constructor(root, { credentials, event, queryFactory = query }) {
    this.root = root;
    this.credentials = credentials;
    this.event = event;
    this.queryFactory = queryFactory;
    this.active = null;
  }
  cancel() {
    this.active?.controller.abort();
  }
  async execute({ task, role, input, instructions, onStarted }) {
    if (role !== "Reviewer") throw Error("PROVIDER_ROLE_UNSUPPORTED");
    if (this.active) throw Error("EXECUTOR_BUSY");
    const active = { controller: new AbortController(), children: [] };
    this.active = active;
    const runSession = uuid("claude-run"),
      start = Date.now();
    let q,
      result,
      nativeSessionId = null,
      initialized = false;
    const timer = setTimeout(() => active.controller.abort(), 90000);
    const home = join(this.root, "claude-home"),
      cwd = join(this.root, "claude-workspace");
    let failure;
    const lineage = {
      executor: "claude-code-sdk",
      provider: "claude-code",
      taskId: task.id,
      role,
      parentSessionId: null,
      childSessionId: null,
      executionId: runSession,
      snapshotId: task.context.snapshotId,
      contextDigest: task.digest,
    };
    try {
      await mkdir(home, { recursive: true, mode: 0o700 });
      await mkdir(cwd, { recursive: true, mode: 0o700 });
      const credential = await this.credentials.resolve(
        "FLOWCREDIT_EPHEMERAL_POWER",
      );
      if (!credential || active.controller.signal.aborted)
        throw Error("MODEL_CAPABILITY_OFF");
      onStarted(runSession, lineage);
      this.event("EXTERNAL_DELEGATION_STARTED", lineage);
      q = this.queryFactory({
        prompt: instructions + "\nINPUT_JSON\n" + JSON.stringify(input),
        options: {
          abortController: active.controller,
          cwd,
          model: "deepseek-v4-flash",
          maxTurns: 1,
          tools: [],
          disallowedTools: ["*"],
          mcpServers: {},
          strictMcpConfig: true,
          settingSources: [],
          persistSession: false,
          permissionMode: "dontAsk",
          permissionPrompts: "none",
          enableFileCheckpointing: false,
          canUseTool: async () => ({
            behavior: "deny",
            message: "FlowCredit reviewer has no tools.",
          }),
          env: {
            PATH: process.env.PATH,
            HOME: home,
            TMPDIR: home,
            CLAUDE_CONFIG_DIR: home,
            ANTHROPIC_AUTH_TOKEN: credential.value,
            ANTHROPIC_BASE_URL: "https://api.deepseek.com/anthropic",
            CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
            DISABLE_AUTOUPDATER: "1",
            CLAUDE_CODE_DISABLE_CLAUDEAI_MCP: "1",
            CLAUDE_AGENT_SDK_CLIENT_APP: "flowcredit/0.2.0",
          },
          stderr: () => {},
          spawnClaudeCodeProcess: (options) => {
            const child = spawn(options.command, options.args, {
              cwd: options.cwd,
              env: options.env,
              stdio: ["pipe", "pipe", "pipe"],
              detached: process.platform !== "win32",
            });
            child.stderr.on("data", () => {});
            active.children.push(child);
            return child;
          },
        },
      });
      for await (const message of q) {
        if (active.controller.signal.aborted) throw Error("CANCELED");
        if (message.type === "system" && message.subtype === "init") {
          if (!Array.isArray(message.tools) || message.tools.length)
            throw Error("EXTERNAL_TOOLS_NOT_EMPTY");
          initialized = true;
          nativeSessionId = message.session_id;
        }
        if (
          message.type === "assistant" &&
          message.message?.content?.some((b) => b.type === "tool_use")
        )
          throw Error("EXTERNAL_TOOL_ATTEMPT");
        if (message.type === "result") result = message;
      }
      if (
        !initialized ||
        !result ||
        result.subtype !== "success" ||
        result.is_error ||
        typeof result.result !== "string"
      )
        throw Error("EXTERNAL_REVIEW_FAILED");
      if (this.credentials.contains(result.result))
        throw Error("SECRET_IN_OUTPUT");
    } catch (e) {
      failure = /^[A-Z_]+$/.test(e.message)
        ? e
        : Error("EXTERNAL_REVIEW_FAILED");
    } finally {
      clearTimeout(timer);
      active.controller.abort();
      try {
        q?.close();
      } catch {
        failure ??= Error("EXTERNAL_RELEASE_FAILED");
      }
      for (const child of active.children) {
        const running = () =>
          child.exitCode === null && child.signalCode === null;
        const kill = (signal) => {
          try {
            if (child.pid && process.platform !== "win32")
              process.kill(-child.pid, signal);
            else child.kill(signal);
          } catch (e) {
            if (e.code !== "ESRCH")
              failure ??= Error("EXTERNAL_RELEASE_FAILED");
          }
        };
        kill("SIGTERM");
        for (let i = 0; i < 20 && running(); i++) await delay(50);
        if (running()) kill("SIGKILL");
        for (let i = 0; i < 20 && running(); i++) await delay(50);
        if (running()) failure ??= Error("EXTERNAL_RELEASE_FAILED");
      }
      this.active = null;
      this.event("EXTERNAL_DELEGATION_RELEASED", {
        executionId: runSession,
        nativeSessionId,
        processCount: active.children.length,
        released: active.children.every(
          (c) => c.exitCode !== null || c.signalCode !== null,
        ),
      });
    }
    if (failure) throw failure;
    return {
      raw: result.result,
      toolReads: [],
      receipt: {
        ...lineage,
        childSessionId: nativeSessionId,
        freshSession: true,
        inheritedConversation: false,
        parentModelRequests: null,
        modelRequestCount: null,
        delegatedRunCount: 1,
        modelRoute: {
          provider: "deepseek-anthropic-compatible",
          model: "deepseek-v4-flash",
        },
        stopReason: "completed",
        tools: [],
        toolCalls: [],
        usage: null,
        usageSource: "unknown",
        inputDigest: hash(input),
        wallClockMs: Date.now() - start,
        released: true,
      },
    };
  }
}
