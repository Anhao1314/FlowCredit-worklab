import { readAuthorized } from "../research-adapter/adapter.mjs";
import { join } from "node:path";
import { readdir, readFile, mkdir, writeFile, stat } from "node:fs/promises";
import {
  Context,
  Llm,
  Session,
  SessionId,
  Projection,
  Prompt,
  Tools,
  Agents,
  Loop,
  DeepSeek,
  createUserMessage,
} from "../harness-adapter/harness.mjs";
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
    this.handle = null;
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
    if (ctx.tools.schemas().length) throw Error("TOOLS_NOT_EMPTY");
    this.originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options = {}) => {
      if (
        String(url) !== "https://api.deepseek.com/v1/chat/completions" ||
        options.method !== "POST" ||
        !this.credentials.hasPower() ||
        !this.currentRun
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
      if (this.requestIds.length >= (this.currentRole === "Researcher" ? 2 : 1))
        throw Error("RUN_REQUEST_LIMIT");
      const requestGeneration = this.generation;
      const id = this.store.reserve(this.currentRun);
      this.requestIds.push(id);
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
    return {
      ...this.store.snapshot(),
      runtime: {
        pid: process.pid,
        boot: this.boot,
        restored: this.restored,
        modelOnline: this.credentials.hasPower(),
        powerState: this.credentials.hasPower() ? "ONLINE" : "DORMANT",
        providerValidated: !!this.providerValidated,
        busy: this.busy,
        liveSessions: this.ctx.agents?.list().length ?? 0,
        environmentKeyPresent: Object.keys(process.env).some(
          (k) =>
            /DEEPSEEK.*KEY|FLOWCREDIT_EPHEMERAL_POWER/.test(k) &&
            !!process.env[k],
        ),
        requestLimit: 6,
      },
    };
  }
  async release() {
    if (this.handle) {
      const id = this.handle.agent.id;
      await this.handle.dispose();
      this.handle = null;
      this.store.event("SESSION_RELEASED", {
        session: id,
        agentAbsent: !this.ctx.agents.get(id),
        sessionAbsent: !this.ctx.sessions.get(id),
      });
    }
  }
  async standDown() {
    this.generation++;
    this.credentials.clear();
    this.providerValidated = false;
    if (this.handle) this.handle.agent.cancel({ kind: "user" });
    if (this.pending) await this.pending.catch(() => {});
    await this.release();
    this.store.dutyUpdate({ status: "PAUSED" });
    this.store.event("STAND_DOWN", {
      boot: this.boot,
      modelCapability: false,
      liveSessions: this.ctx.agents?.list().length ?? 0,
    });
    return this.status();
  }
  async invoke(task, role, input, instructions) {
    await this.release();
    if (!this.credentials.hasPower()) throw Error("MODEL_CAPABILITY_OFF");
    if (this.store.count() >= 6) throw Error("MODEL_BUDGET_EXHAUSTED");
    const run = uuid("run"),
      session = uuid(`fc-${role}`),
      generation = this.generation;
    this.currentRun = run;
    this.currentRole = role;
    this.requestIds = [];
    this.toolReads = [];
    this.installTool(task, role);
    const handle = (this.handle = await this.ctx.agents.create({
      sessionId: SessionId(session),
      agentOptions: {
        provider: "deepseek-official",
        model: "deepseek-v4-flash",
        maxTokens: 2600,
      },
    }));
    const fresh = handle.agent.session.snapshotEvents().length === 0;
    this.store.db.prepare("INSERT INTO runs VALUES(?,?,?,?,?,?,?)").run(
      run,
      task.id,
      role,
      session,
      this.boot,
      "RUNNING",
      JSON.stringify({
        freshSession: fresh,
        inputDigest: hash(input),
        researchArtifactId: input.researchArtifact?.id ?? null,
        sourceExcerptIds: (input.sourceExcerpts ?? input.records ?? []).map(
          (r) => r.id,
        ),
      }),
    );
    this.store.state(
      task.id,
      role === "Researcher" ? "RESEARCH_RUNNING" : "REVIEW_RUNNING",
      { ...task.checkpoint, nextAction: role },
    );
    const start = Date.now();
    handle.agent.followup(
      createUserMessage({
        content: [
          {
            type: "text",
            text: instructions + "\nINPUT_JSON\n" + JSON.stringify(input),
          },
        ],
        source: { kind: "user" },
      }),
    );
    const timer = setTimeout(
      () => handle.agent.cancel({ kind: "user" }),
      65000,
    );
    try {
      await handle.agent.whenIdle();
    } finally {
      clearTimeout(timer);
    }
    const events = handle.agent.session.snapshotEvents(),
      end = events.findLast((e) => e.type === "turn/end"),
      response = events.findLast((e) => e.type === "assistant/message");
    const summary = {
      toolReads: this.toolReads,
      initialPromptDigest: hash(input),
      freshSession: fresh,
      inputDigest: hash(input),
      researchArtifactId: input.researchArtifact?.id ?? null,
      sourceExcerptIds: (input.sourceExcerpts ?? input.records ?? []).map(
        (r) => r.id,
      ),
      completion: end?.data.reason?.kind ?? null,
      usage: response?.data.usage ?? null,
      eventTypes: events.map((e) => e.type),
      wallClockMs: Date.now() - start,
    };
    for (const id of this.requestIds)
      this.store.budgetUpdate(
        id,
        end?.data.reason?.kind === "completed"
          ? "COMPLETED"
          : "FAILED_OR_CANCELED",
        { run, ...summary },
      );
    this.currentRun = null;
    this.store.db
      .prepare("UPDATE runs SET summary=? WHERE id=?")
      .run(JSON.stringify(summary), run);
    if (
      generation !== this.generation ||
      !response ||
      end?.data.reason?.kind !== "completed"
    ) {
      this.store.db
        .prepare("UPDATE runs SET state='FAILED' WHERE id=?")
        .run(run);
      throw Error(
        generation !== this.generation ? "CANCELED" : "TURN_NOT_COMPLETED",
      );
    }
    const raw = response.data.message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    if (this.credentials.contains(raw)) throw Error("SECRET_IN_OUTPUT");
    return { raw, run };
  }
  installTool(task, role) {
    if (this.unregisterRead) {
      this.unregisterRead();
      this.unregisterRead = null;
    }
    if (role !== "Researcher") return;
    this.unregisterRead = this.ctx.tools.register({
      name: "get_authorized_records",
      description:
        "Read the records permitted by this task. Call once with all authorized recordIds. Snapshot identity is fixed by the runtime; no other snapshot or write operation is allowed.",
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
          properties: { records: { type: "array", items: { type: "object" } } },
          required: ["records"],
          additionalProperties: false,
        },
        render: (_args, value) => [
          { type: "text", text: JSON.stringify(value) },
        ],
      },
      execute: async (args, exec) => {
        if (
          exec.signal.aborted ||
          !this.credentials.hasPower() ||
          exec.agent?.id !== this.handle?.agent.id ||
          this.currentRole !== "Researcher"
        )
          throw Error("FORBIDDEN");
        if (this.toolReads.length) throw Error("READ_BUDGET_EXHAUSTED");
        const records = readAuthorized(
          this.store.bound(task.id),
          this.store.check(task.id),
          args,
        );
        this.toolReads.push({
          taskId: task.id,
          snapshotId: task.context.snapshotId,
          recordIds: records.map((r) => r.id),
          callId: exec.callId,
          sessionId: exec.agent.id,
        });
        this.store.event("HARNESS_RECORDS_READ", this.toolReads.at(-1));
        return { records };
      },
    });
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
  async review(id) {
    const t = this.store.check(id),
      a = this.store.artifact(t.checkpoint.research);
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
  async execute(action) {
    if (this.busy) throw Error("BUSY");
    if (!this.credentials.hasPower()) throw Error("MODEL_CAPABILITY_OFF");
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
        this.currentRun = null;
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
            matches.push({ path: p, type: p.endsWith('-wal') ? 'SQLite WAL' : p.endsWith('-shm') ? 'SQLite SHM' : p.endsWith('.sqlite') ? 'SQLite' : p.endsWith('.json') ? 'JSON' : 'other', size: info.size, mtime: info.mtime.toISOString(), runtimeOwned: true, storageClass: 'runtime-directory' });
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
