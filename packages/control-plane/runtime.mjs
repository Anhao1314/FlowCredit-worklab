import { readAuthorized } from "../research-adapter/adapter.mjs";
import { join } from "node:path";
import { readdir, readFile, mkdir, writeFile, stat } from "node:fs/promises";
import {
  Context,
  Llm,
  Session,
  Projection,
  Prompt,
  Tools,
  Agents,
  Loop,
  DeepSeek,
  Subagents,
  SpawnSubagent,
} from "../harness-adapter/harness.mjs";
import { HarnessSubagentExecutor } from "../harness-adapter/executor.mjs";
import {
  AgentWork,
  PROVIDERS,
  provider as workProvider,
} from "../agent-work/providers.mjs";
import { ClaudeCodeExecutor } from "../agent-work/claude-code.mjs";
import { EphemeralCredentials } from "../harness-adapter/credentials.mjs";
import {
  hash,
  uuid,
  validateResearch,
  validateReview,
  RESEARCH_INSTRUCTIONS,
  REVIEW_INSTRUCTIONS,
} from "../task-context/contracts.mjs";
export class Runtime {
  constructor(root, store) {
    this.toolReads = [];
    this.root = root;
    this.store = store;
    this.boot = uuid("boot");
    this.busy = false;
    this.generation = 0;
    this.execution = null;
  }
  async init() {
    process.env.DSH_HOME = join(this.root, "data", "harness-home");
    const ctx = (this.ctx = new Context());
    ctx.provide("launchEnvironment", {
      get: () => undefined,
      getFrom: () => undefined,
    });
    for (const plugin of [Llm, Session, Projection]) await ctx.plugin(plugin);
    await ctx.plugin(Prompt, {
      includeHarnessIdentity: false,
      includeRuntimeContext: false,
      personaPrefix:
        "你是 FlowCredit 研究协作执行单元。仅输出结构化候选产物，不修改正式研究记录。",
    });
    for (const plugin of [Tools, Agents, EphemeralCredentials])
      await ctx.plugin(plugin);
    this.credentials = ctx.credentials;
    await ctx.plugin(DeepSeek, {
      apiKeyEnv: "FLOWCREDIT_EPHEMERAL_POWER",
      baseURL: "https://api.deepseek.com/v1",
      thinking: "disabled",
      maxTokens: 2600,
      streamIdleTimeoutMs: 45000,
      retryPolicy: { mode: "normal", maxRetries: 0 },
    });
    await ctx.plugin(Loop, { agents: [] });
    await ctx.plugin(Subagents);
    await ctx.plugin(SpawnSubagent, { providerName: "spawn" });
    this.executor = new HarnessSubagentExecutor(ctx, {
      hasPower: () => this.credentials.hasPower(),
      event: (kind, detail) => this.store.event(kind, detail),
    });
    this.claudeExecutor = new ClaudeCodeExecutor(this.root, {
      credentials: this.credentials,
      event: (kind, detail) => this.store.event(kind, detail),
    });
    this.agentWork = new AgentWork({
      "native-harness": this.executor,
      "claude-code": this.claudeExecutor,
    });
    if (ctx.tools.schemas().length) throw Error("TOOLS_NOT_EMPTY");
    this.originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options = {}) => {
      const execution = this.execution;
      if (
        String(url) !== "https://api.deepseek.com/v1/chat/completions" ||
        options.method !== "POST" ||
        !this.credentials.hasPower() ||
        !execution ||
        execution.providerId !== "native-harness"
      )
        throw Error("MODEL_CAPABILITY_OFF");
      const body = JSON.parse(options.body);
      if (
        body.tools?.some(
          (t) => t.function?.name !== "get_authorized_records",
        ) ||
        body.model !== "deepseek-v4-flash" ||
        this.credentials.contains(options.body)
      )
        throw Error("REQUEST_POLICY");
      if (
        execution.requestIds.length >= (execution.role === "Researcher" ? 2 : 1)
      )
        throw Error("RUN_REQUEST_LIMIT");
      const requestGeneration = this.generation;
      const id = this.store.reserve(execution.run);
      execution.requestIds.push(id);
      try {
        const response = await this.originalFetch(url, {
          ...options,
          redirect: "error",
        });
        if (
          response.ok &&
          requestGeneration === this.generation &&
          this.credentials.hasPower()
        )
          this.providerValidated = true;
        this.store.budgetUpdate(id, response.ok ? "HTTP_OK" : "HTTP_ERROR", {
          status: response.status,
          bodyDigest: hash(options.body),
          model: body.model,
        });
        if (!response.ok) {
          await response.body?.cancel();
          return new Response(
            JSON.stringify({
              error: { message: `DeepSeek HTTP ${response.status}` },
            }),
            {
              status: response.status,
              headers: { "content-type": "application/json" },
            },
          );
        }
        return response;
      } catch {
        this.store.budgetUpdate(id, "TRANSPORT_ERROR", {});
        throw Error("MODEL_TRANSPORT_FAILED");
      }
    };
    this.restored = this.store.snapshot().tasks.length > 0;
    this.store.recover();
    this.store.event("BOOT", {
      pid: process.pid,
      boot: this.boot,
      modelCapability: false,
      restored: this.store.snapshot().tasks.length > 0,
    });
  }
  activate(key) {
    if (this.busy) throw Error("BUSY");
    if (typeof key !== "string" || !key.trim() || key.length > 512)
      throw Error("KEY_REQUIRED");
    this.providerValidated = false;
    this.credentials.power(key.trim());
    this.store.dutyUpdate({ status: "ACTIVE" });
    this.store.event("CAPABILITY_ACTIVATED", { boot: this.boot });
  }
  status() {
    const snapshot = this.store.snapshot();
    return {
      ...snapshot,
      providers: PROVIDERS,
      environment: snapshot.tasks.map((t) => {
        const reviewer = this.store.reviewer(t.id);
        const pending = [
          "RESEARCH_PENDING",
          "REVIEW_PENDING",
          "MEMO_PENDING",
        ].includes(t.state);
        const nativeNeed =
          t.state === "RESEARCH_PENDING"
            ? reviewer === "native-harness"
              ? 3
              : 2
            : t.state === "REVIEW_PENDING" && reviewer === "native-harness"
              ? 1
              : 0;
        const needsDelegation =
          ["RESEARCH_PENDING", "REVIEW_PENDING"].includes(t.state) &&
          reviewer === "claude-code";
        const budgetReady =
          this.store.count() + nativeNeed <= 6 &&
          (!needsDelegation || this.store.delegationCount() < 2);
        return {
          taskId: t.id,
          reviewer,
          budgetReady,
          canResume:
            !this.busy &&
            pending &&
            budgetReady &&
            (t.state === "MEMO_PENDING" || this.credentials.hasPower()),
          canSelectReviewer:
            !this.busy &&
            ["RESEARCH_PENDING", "REVIEW_PENDING"].includes(t.state) &&
            !snapshot.runs.some(
              (r) => r.task === t.id && r.role === "Reviewer",
            ),
          canCompare:
            !this.busy &&
            t.state === "MEMO_READY" &&
            this.credentials.hasPower(),
          allowedActions: [
            "VIEW_SNAPSHOT",
            ...(t.checkpoint.research ? ["VIEW_ARTIFACT"] : []),
            ...(!this.credentials.hasPower() && pending ? ["ACTIVATE"] : []),
            ...(t.state === "MEMO_READY" ? ["HUMAN_REVIEW"] : []),
          ],
        };
      }),
      runtime: {
        pid: process.pid,
        boot: this.boot,
        restored: this.restored,
        modelOnline: this.credentials.hasPower(),
        powerState: this.credentials.hasPower() ? "ONLINE" : "DORMANT",
        providerValidated: !!this.providerValidated,
        busy: this.busy,
        liveSessions: this.ctx.agents?.list().length ?? 0,
        liveExternalRuns: this.claudeExecutor.active ? 1 : 0,
        delegationLimit: 2,
        environmentKeyPresent: Object.keys(process.env).some(
          (k) =>
            /DEEPSEEK.*KEY|FLOWCREDIT_EPHEMERAL_POWER/.test(k) &&
            !!process.env[k],
        ),
        requestLimit: 6,
      },
    };
  }
  async standDown() {
    this.generation++;
    this.credentials.clear();
    this.providerValidated = false;
    this.agentWork.cancel();
    if (this.pending) await this.pending.catch(() => {});
    this.store.dutyUpdate({ status: "PAUSED" });
    this.store.event("STAND_DOWN", {
      boot: this.boot,
      modelCapability: false,
      liveSessions: this.ctx.agents?.list().length ?? 0,
    });
    return this.status();
  }
  async invoke(task, role, input, instructions, options = {}) {
    const providerId =
      options.provider ??
      (role === "Reviewer" ? this.store.reviewer(task.id) : "native-harness");
    workProvider(providerId, role);
    if (!this.credentials.hasPower()) throw Error("MODEL_CAPABILITY_OFF");
    if (providerId === "native-harness" && this.store.count() >= 6)
      throw Error("MODEL_BUDGET_EXHAUSTED");
    if (providerId === "claude-code" && this.store.delegationCount() >= 2)
      throw Error("DELEGATION_BUDGET_EXHAUSTED");
    if (this.execution) throw Error("EXECUTOR_BUSY");
    const run = uuid("run"),
      generation = this.generation;
    const execution = { run, role, providerId, requestIds: [] };
    this.execution = execution;
    this.toolReads = [];
    this.store.db.prepare("INSERT INTO runs VALUES(?,?,?,?,?,?,?)").run(
      run,
      task.id,
      role,
      null,
      this.boot,
      "RUNNING",
      JSON.stringify({
        workProvider: providerId,
        comparison: !!options.comparison,
        inputDigest: hash(input),
      }),
    );
    if (!options.comparison)
      this.store.state(
        task.id,
        role === "Researcher" ? "RESEARCH_RUNNING" : "REVIEW_RUNNING",
        { ...task.checkpoint, nextAction: role },
      );
    let summary, delegation;
    try {
      if (providerId === "claude-code")
        delegation = this.store.reserveDelegation(run, providerId);
      const result = await this.agentWork.execute(providerId, {
        task,
        role,
        input,
        instructions,
        readRecords: (args) =>
          readAuthorized(
            this.store.bound(task.id),
            this.store.check(task.id),
            args,
          ),
        onStarted: (session, lineage) => {
          this.store.db
            .prepare("UPDATE runs SET session=?,summary=? WHERE id=?")
            .run(
              session,
              JSON.stringify({
                ...lineage,
                workProvider: providerId,
                comparison: !!options.comparison,
                inputDigest: hash(input),
              }),
              run,
            );
        },
      });
      this.toolReads = result.toolReads;
      summary = {
        ...result.receipt,
        comparison: !!options.comparison,
        toolReads: result.toolReads,
        initialPromptDigest: hash(input),
        researchArtifactId: input.researchArtifact?.id ?? null,
        sourceExcerptIds: (input.sourceExcerpts ?? input.records ?? []).map(
          (r) => r.id,
        ),
        completion: result.receipt.stopReason,
      };
      if (generation !== this.generation) throw Error("CANCELED");
      if (result.receipt.stopReason !== "completed")
        throw Error("TURN_NOT_COMPLETED");
      if (this.credentials.contains(result.raw))
        throw Error("SECRET_IN_OUTPUT");
      return { raw: result.raw, run };
    } catch (error) {
      this.store.db
        .prepare("UPDATE runs SET state='FAILED' WHERE id=?")
        .run(run);
      const failureCode =
        generation !== this.generation
          ? "CANCELED"
          : /^[A-Z_]+$/.test(error.message)
            ? error.message
            : "EXECUTION_FAILED";
      const prior = JSON.parse(
        this.store.db.prepare("SELECT summary FROM runs WHERE id=?").get(run)
          .summary,
      );
      summary = { ...prior, ...summary, workProvider: providerId, failureCode };
      if (generation !== this.generation) throw Error("CANCELED");
      throw error;
    } finally {
      const completed =
        generation === this.generation && summary?.completion === "completed";
      for (const id of execution.requestIds)
        this.store.budgetUpdate(
          id,
          completed ? "COMPLETED" : "FAILED_OR_CANCELED",
          { run, ...summary },
        );
      if (delegation)
        this.store.settleDelegation(
          delegation,
          completed ? "COMPLETED" : "FAILED_OR_CANCELED",
        );
      if (summary)
        this.store.db
          .prepare(
            "UPDATE runs SET session=COALESCE(?,session),summary=? WHERE id=?",
          )
          .run(summary.childSessionId ?? null, JSON.stringify(summary), run);
      this.execution = null;
    }
  }
  async research(id) {
    const t = this.store.check(id),
      snapshot = this.store.bound(id);
    const input = {
      taskId: id,
      subjectId: t.context.subjectId,
      claim: t.context.claim,
      baseRevisionId: t.context.baseRevisionId,
      snapshotId: t.context.snapshotId,
      asOf: t.context.asOf,
      authorizedRecords: snapshot.records.map((r) => ({
        recordId: r.id,
        label: r.label,
        status: r.status,
      })),
      instructions:
        "Read all authorized recordIds using get_authorized_records in one batch before writing observations. Source text is not in this prompt. Cite actual recordId, never R-01 aliases. One tool read, then final JSON. No extra calls.",
    };
    const { raw, run } = await this.invoke(
      t,
      "Researcher",
      input,
      RESEARCH_INSTRUCTIONS,
    );
    if (!this.toolReads.length) throw Error("TOOL_READ_REQUIRED");
    const content = {
      ...validateResearch(raw, t.context),
      contextDigest: t.digest,
      snapshotId: snapshot.snapshotId,
      snapshotDigest: snapshot.contentDigest,
      baseRevisionId: snapshot.baseRevisionId,
      candidate: true,
    };
    const readIds = this.toolReads.flatMap((x) => x.recordIds);
    if (
      content.observations.some((o) =>
        o.citations.some((c) => !readIds.includes(c)),
      )
    )
      throw Error("UNREAD_CITATION");
    content.citationLineage = snapshot.records
      .filter((r) =>
        content.observations.some((o) => o.citations.includes(r.id)),
      )
      .map(({ text, source, ...identity }) => identity);
    this.store.tx(() => {
      const a = this.store.putArtifact(id, run, "RESEARCH", content);
      this.store.db
        .prepare("UPDATE runs SET state='SUCCESS' WHERE id=?")
        .run(run);
      this.store.state(id, "REVIEW_PENDING", {
        ...t.checkpoint,
        research: a.id,
        review: null,
        memo: null,
        lastCompleted: "RESEARCH_COMPLETE",
        nextAction: "Reviewer",
        unresolvedIssues: content.unresolvedQuestions,
      });
    });
  }
  reviewInput(id) {
    const t = this.store.check(id),
      a = this.store.artifact(t.checkpoint.research);
    if (!a) throw Error("ARTIFACT_MISSING");
    const cited = [
      ...new Set(a.content.observations.flatMap((o) => o.citations)),
    ];
    const input = {
      task: {
        taskId: id,
        scope: t.context.scope,
        contextDigest: t.digest,
        asOf: t.context.asOf,
      },
      claim: t.context.claim,
      baseRevisionId: t.context.baseRevisionId,
      snapshotId: t.context.snapshotId,
      researchArtifact: { id: a.id, ...a.content },
      sourceExcerpts: this.store
        .bound(id)
        .records.filter((r) => cited.includes(r.id)),
    };
    return { t, a, input };
  }
  async review(id) {
    const { t, a, input } = this.reviewInput(id);
    const { raw, run } = await this.invoke(
      t,
      "Reviewer",
      input,
      REVIEW_INSTRUCTIONS,
    );
    const content = {
      ...validateReview(raw, a),
      contextDigest: t.digest,
      consumedResearchDigest: a.digest,
      snapshotId: t.context.snapshotId,
      snapshotDigest: t.context.snapshotDigest,
      baseRevisionId: t.context.baseRevisionId,
      candidate: true,
    };
    this.store.tx(() => {
      const v = this.store.putArtifact(id, run, "REVIEW", content);
      this.store.db
        .prepare("UPDATE runs SET state='SUCCESS' WHERE id=?")
        .run(run);
      const cp = {
        ...t.checkpoint,
        review: v.id,
        lastCompleted: "REVIEW_COMPLETE",
        nextAction:
          content.decision === "PASS" ? "Assemble Memo" : "人工处理复核意见",
        unresolvedIssues: [
          ...a.content.unresolvedQuestions,
          ...content.issues.map((i) => i.detail),
        ],
      };
      this.store.state(
        id,
        content.decision === "PASS" ? "MEMO_PENDING" : "NEEDS_ATTENTION",
        cp,
      );
    });
    if (content.decision === "PASS") this.memo(id);
  }
  memo(id) {
    const t = this.store.check(id),
      r = this.store.artifact(t.checkpoint.research),
      v = this.store.artifact(t.checkpoint.review);
    if (
      v.content.decision !== "PASS" ||
      v.content.reviewedArtifactId !== r.id ||
      v.content.consumedResearchDigest !== r.digest
    )
      throw Error("REVIEW_BINDING");
    this.store.tx(() => {
      const memo = this.store.putArtifact(id, v.producerAgentRun, "MEMO", {
        contextDigest: t.digest,
        title: `Task ${id} · 候选研究备忘`,
        researchArtifactId: r.id,
        reviewArtifactId: v.id,
        observations: r.content.observations,
        unresolvedIssues: t.checkpoint.unresolvedIssues,
        reviewLimitations: v.content.reviewLimitations,
        snapshotId: t.context.snapshotId,
        snapshotDigest: t.context.snapshotDigest,
        baseRevisionId: t.context.baseRevisionId,
        citationLineage: r.content.citationLineage,
        authority: {
          claimVersion: t.context.claim.version,
          humanApproved: false,
          evidenceAdmitted: false,
          relationCreated: false,
          revisionCreated: false,
        },
      });
      this.store.state(id, "MEMO_READY", {
        ...t.checkpoint,
        memo: memo.id,
        lastCompleted: "MEMO_READY",
        nextAction: "等待人工判断",
      });
    });
  }
  async compare(id, providerId) {
    if (this.busy) throw Error("BUSY");
    workProvider(providerId, "Reviewer");
    const { t, a, input } = this.reviewInput(id);
    if (t.state !== "MEMO_READY") throw Error("MEMO_NOT_READY");
    this.busy = true;
    this.pending = (async () => {
      let run;
      try {
        const result = await this.invoke(
          t,
          "Reviewer",
          input,
          REVIEW_INSTRUCTIONS,
          { provider: providerId, comparison: true },
        );
        run = result.run;
        const content = {
          ...validateReview(result.raw, a),
          contextDigest: t.digest,
          consumedResearchDigest: a.digest,
          snapshotId: t.context.snapshotId,
          candidate: true,
          comparison: true,
          workProvider: providerId,
        };
        this.store.tx(() => {
          this.store.putArtifact(id, run, "REVIEW_COMPARISON", content);
          this.store.db
            .prepare("UPDATE runs SET state='SUCCESS' WHERE id=?")
            .run(run);
          this.store.event("REVIEW_COMPARISON_COMPLETED", {
            task: id,
            provider: providerId,
          });
        });
        await this.export();
      } catch (error) {
        if (run)
          this.store.db
            .prepare("UPDATE runs SET state='FAILED' WHERE id=?")
            .run(run);
        throw error;
      } finally {
        this.busy = false;
      }
    })();
    await this.pending;
    return this.status();
  }
  async execute(action) {
    if (this.busy) throw Error("BUSY");
    if (
      !this.credentials.hasPower() &&
      !["MEMO_READY", "MEMO_PENDING"].includes(this.store.task(action)?.state)
    )
      throw Error("MODEL_CAPABILITY_OFF");
    this.busy = true;
    this.pending = (async () => {
      let id;
      try {
        id = ["E", "F"].includes(action)
          ? action
          : this.store.duty().currentTask;
        if (!id) throw Error("TASK_MISSING");
        let t;
        try {
          t = this.store.check(id);
        } catch (e) {
          const bad = this.store.task(id);
          if (!bad) throw e;
          this.store.state(id, "RECOVERY_BLOCKED", {
            ...bad.checkpoint,
            reason: e.message,
            nextAction: "修复持久产物",
          });
          throw e;
        }
        if (
          ["RESEARCH_PENDING", "REVIEW_PENDING"].includes(t.state) &&
          !this.status().environment.find((e) => e.taskId === id).budgetReady
        )
          throw Error("WORK_BUDGET_EXHAUSTED");
        if (t.state === "RESEARCH_PENDING") await this.research(id);
        t = this.store.check(id);
        if (t.state === "REVIEW_PENDING") await this.review(id);
        else if (t.state === "MEMO_PENDING") this.memo(id);
        else if (t.state !== "MEMO_READY") throw Error("TASK_NOT_RESUMABLE");
      } catch (e) {
        if (id) {
          const t = this.store.task(id);
          if (t && t.state.endsWith("_RUNNING")) {
            this.store.state(id, "NEEDS_ATTENTION", {
              ...t.checkpoint,
              reason:
                e.message === "CANCELED"
                  ? "CANCELED"
                  : "EXECUTION_NOT_COMMITTED",
              nextAction: "人工核查，不自动重试",
            });
            this.store.db
              .prepare(
                "UPDATE runs SET state='FAILED' WHERE task=? AND state='RUNNING'",
              )
              .run(id);
          }
        }
        throw e;
      } finally {
        this.busy = false;
        this.execution = null;
      }
    })();
    await this.pending;
    await this.export();
    return this.status();
  }
  async export() {
    await mkdir(join(this.root, "exports"), { recursive: true });
    for (const a of this.store.snapshot().artifacts)
      await writeFile(
        join(this.root, "exports", a.id + ".json"),
        JSON.stringify(a, null, 2),
      );
  }
  async scan() {
    const matches = [];
    let files = 0,
      hits = 0,
      patternHits = 0;
    const walk = async (dir) => {
      for (const f of await readdir(dir, { withFileTypes: true })) {
        if (f.isSymbolicLink()) continue;
        const p = join(dir, f.name);
        if (f.isDirectory()) await walk(p);
        else {
          files++;
          const text = (await readFile(p)).toString();
          if (this.credentials.contains(text)) {
            hits++;
            const info = await stat(p);
            matches.push({
              path: p,
              type: p.endsWith("-wal")
                ? "SQLite WAL"
                : p.endsWith("-shm")
                  ? "SQLite SHM"
                  : p.endsWith(".sqlite")
                    ? "SQLite"
                    : p.endsWith(".json")
                      ? "JSON"
                      : "other",
              size: info.size,
              mtime: info.mtime.toISOString(),
              runtimeOwned: true,
              storageClass: "runtime-directory",
            });
          }
          if (/sk-[a-zA-Z0-9]{25,}/.test(text)) patternHits++;
        }
      }
    };
    await walk(this.root);
    return {
      files,
      hits,
      patternHits,
      matches,
      exactMatchAvailable: this.credentials.hasPower(),
      scope: "Runtime data directory only",
      harnessSessionPersistence: "not installed",
    };
  }
  async close() {
    await this.standDown();
    globalThis.fetch = this.originalFetch;
    await this.ctx.fiber.dispose();
  }
}
