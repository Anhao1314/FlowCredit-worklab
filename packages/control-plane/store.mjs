import { validateSnapshot } from "../research-adapter/adapter.mjs";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { hash, uuid } from "../task-context/contracts.mjs";
const now = () => new Date().toISOString();
export class Store {
  constructor(dir) {
    mkdirSync(dir, { recursive: true });
    this.db = new DatabaseSync(join(dir, "control.sqlite"));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
 CREATE TABLE IF NOT EXISTS snapshots(id TEXT PRIMARY KEY, task TEXT UNIQUE, content TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS duty(id TEXT PRIMARY KEY, body TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, context TEXT NOT NULL, digest TEXT NOT NULL, state TEXT NOT NULL, checkpoint TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY, task TEXT, role TEXT, session TEXT, boot TEXT, state TEXT, summary TEXT);
 CREATE TABLE IF NOT EXISTS artifacts(id TEXT PRIMARY KEY, task TEXT, producer TEXT, type TEXT, created TEXT, content TEXT, digest TEXT);
 CREATE TABLE IF NOT EXISTS budget(id INTEGER PRIMARY KEY, run TEXT, state TEXT, detail TEXT);
 CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, created TEXT, kind TEXT, detail TEXT);

 CREATE TRIGGER IF NOT EXISTS immutable_context BEFORE UPDATE OF context,digest ON tasks BEGIN SELECT RAISE(ABORT,'CONTEXT_FROZEN'); END;`);
    if (!this.db.prepare("SELECT id FROM duty").get())
      this.db
        .prepare("INSERT INTO duty VALUES(?,?)")
        .run(
          "northstar",
          JSON.stringify({
            id: "northstar",
            name: "Northstar Continuous Research",
            subject: "Northstar Compute",
            responsibility:
              "围绕客户集中度处理授权合成资料，交付候选研究，等待人工判断。",
            status: "DORMANT",
            createdAt: now(),
            currentTask: null,
            lastCheckpoint: null,
          }),
        );
  }
  tx(fn) {
    if (this.inTransaction) return fn();
    this.db.exec("BEGIN IMMEDIATE");
    this.inTransaction = true;
    try {
      const r = fn();
      this.db.exec("COMMIT");
      return r;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    } finally {
      this.inTransaction = false;
    }
  }
  event(kind, detail = {}) {
    this.db
      .prepare("INSERT INTO events(created,kind,detail) VALUES(?,?,?)")
      .run(now(), kind, JSON.stringify(detail));
  }
  duty() {
    return JSON.parse(this.db.prepare("SELECT body FROM duty").get().body);
  }
  dutyUpdate(patch) {
    this.db
      .prepare("UPDATE duty SET body=?")
      .run(JSON.stringify({ ...this.duty(), ...patch }));
  }
  task(id) {
    const t = this.db.prepare("SELECT * FROM tasks WHERE id=?").get(id);
    return t
      ? {
          id: t.id,
          context: JSON.parse(t.context),
          digest: t.digest,
          state: t.state,
          checkpoint: JSON.parse(t.checkpoint),
        }
      : null;
  }
  state(id, state, checkpoint) {
    this.db
      .prepare("UPDATE tasks SET state=?,checkpoint=? WHERE id=?")
      .run(state, JSON.stringify(checkpoint), id);
    this.dutyUpdate({ currentTask: id, lastCheckpoint: state });
    this.event("TASK_STATE", { task: id, state });
  }
  createBound(snapshot) {
    if (this.task(snapshot.taskId)) throw Error("TASK_EXISTS");
    const context = {
      taskId: snapshot.taskId,
      dutyId: "northstar",
      subjectId: snapshot.subjectId,
      claimId: snapshot.claimId,
      baseRevisionId: snapshot.baseRevisionId,
      claim: snapshot.claim,
      snapshotId: snapshot.snapshotId,
      snapshotDigest: snapshot.contentDigest,
      scope: snapshot.authorizedRecordIds,
      authorizedRecordIds: snapshot.authorizedRecordIds,
      asOf: snapshot.asOf,
    };
    this.tx(() => {
      this.db
        .prepare("INSERT INTO snapshots VALUES(?,?,?)")
        .run(snapshot.snapshotId, snapshot.taskId, JSON.stringify(snapshot));
      this.db
        .prepare("INSERT INTO tasks VALUES(?,?,?,?,?)")
        .run(
          snapshot.taskId,
          JSON.stringify(context),
          hash(context),
          "RESEARCH_PENDING",
          JSON.stringify({
            lastCompleted: null,
            nextAction: "Researcher",
            unresolvedIssues: [],
          }),
        );
      this.dutyUpdate({
        currentTask: snapshot.taskId,
        lastCheckpoint: "RESEARCH_PENDING",
      });
      this.event("TASK_BOUND", {
        task: snapshot.taskId,
        snapshot: snapshot.snapshotId,
        revision: snapshot.baseRevisionId,
        digest: snapshot.contentDigest,
      });
    });
    return this.task(snapshot.taskId);
  }
  bound(id) {
    const t = this.task(id);
    if (!t) throw Error("TASK_MISSING");
    const row = this.db
      .prepare("SELECT content FROM snapshots WHERE id=? AND task=?")
      .get(t.context.snapshotId, id);
    return validateSnapshot(row ? JSON.parse(row.content) : null, t);
  }
  artifact(id) {
    const a = this.db.prepare("SELECT * FROM artifacts WHERE id=?").get(id);
    return a
      ? {
          id: a.id,
          taskId: a.task,
          producerAgentRun: a.producer,
          type: a.type,
          createdAt: a.created,
          digest: a.digest,
          content: JSON.parse(a.content),
        }
      : null;
  }
  putArtifact(task, run, type, content) {
    const id = uuid(type.toLowerCase());
    this.db
      .prepare("INSERT INTO artifacts VALUES(?,?,?,?,?,?,?)")
      .run(id, task, run, type, now(), JSON.stringify(content), hash(content));
    return this.artifact(id);
  }
  check(id) {
    const t = this.task(id);
    if (!t) throw Error("TASK_MISSING");
    this.bound(id);
    if (hash(t.context) !== t.digest) throw Error("CONTEXT_INTEGRITY");
    for (const key of ["research", "review", "memo"]) {
      const ref = t.checkpoint[key];
      if (!ref) continue;
      const a = this.artifact(ref);
      if (!a) throw Error("ARTIFACT_MISSING");
      if (
        a.taskId !== id ||
        hash(a.content) !== a.digest ||
        a.content.contextDigest !== t.digest
      )
        throw Error("ARTIFACT_INTEGRITY");
      if (a.type !== key.toUpperCase()) throw Error("ARTIFACT_TYPE");
      const r = this.db
        .prepare("SELECT * FROM runs WHERE id=?")
        .get(a.producerAgentRun);
      if (!r || r.task !== id || r.state !== "SUCCESS")
        throw Error("PRODUCER_BINDING");
    }
    if (
      [
        "REVIEW_PENDING",
        "REVIEW_RUNNING",
        "MEMO_PENDING",
        "MEMO_READY",
      ].includes(t.state) &&
      !t.checkpoint.research
    )
      throw Error("ARTIFACT_MISSING");
    return t;
  }
  recover() {
    for (const { id } of this.db.prepare("SELECT id FROM tasks").all()) {
      try {
        const t = this.check(id);
        if (t.state.endsWith("_RUNNING")) {
          this.state(id, "NEEDS_ATTENTION", {
            ...t.checkpoint,
            reason: "INTERRUPTED_ATTEMPT_COST_UNKNOWN",
            nextAction: "人工检查执行尝试，不自动重试",
          });
          this.db
            .prepare(
              "UPDATE runs SET state='INTERRUPTED' WHERE task=? AND state='RUNNING'",
            )
            .run(id);
        }
      } catch (e) {
        const t = this.task(id);
        this.state(id, "RECOVERY_BLOCKED", {
          ...t.checkpoint,
          reason: e.message,
          nextAction: "修复持久产物，禁止推测或再生成",
        });
      }
    }
    this.dutyUpdate({ status: "PAUSED" });
  }
  reserve(run) {
    return this.tx(() => {
      if (this.count() >= 6) throw Error("MODEL_BUDGET_EXHAUSTED");
      const id = this.count() + 1;
      this.db
        .prepare("INSERT INTO budget VALUES(?,?,?,?)")
        .run(id, run, "RESERVED", JSON.stringify({ at: now() }));
      return id;
    });
  }
  budgetUpdate(id, state, detail) {
    this.db
      .prepare("UPDATE budget SET state=?,detail=? WHERE id=?")
      .run(state, JSON.stringify(detail), id);
  }
  count() {
    return this.db.prepare("SELECT count(*) AS n FROM budget").get().n;
  }
  snapshot() {
    return {
      snapshots: this.db
        .prepare("SELECT content FROM snapshots ORDER BY id")
        .all()
        .map((r) => JSON.parse(r.content)),
      duty: this.duty(),
      tasks: this.db
        .prepare("SELECT id FROM tasks ORDER BY id")
        .all()
        .map((t) => this.task(t.id)),
      runs: this.db
        .prepare("SELECT * FROM runs")
        .all()
        .map((r) => ({ ...r, summary: JSON.parse(r.summary) })),
      artifacts: this.db
        .prepare("SELECT id FROM artifacts")
        .all()
        .map((a) => this.artifact(a.id)),
      budget: this.db
        .prepare("SELECT * FROM budget")
        .all()
        .map((b) => ({ ...b, detail: JSON.parse(b.detail) })),
      events: this.db
        .prepare("SELECT * FROM events ORDER BY id DESC LIMIT 100")
        .all()
        .map((e) => ({ ...e, detail: JSON.parse(e.detail) })),
    };
  }
  close() {
    this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    this.db.close();
  }
}
