import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ResearchMemory } from "./core.mjs";
import { AdmissionLayer } from "./core.mjs";
import { digest } from "./core.mjs";
import { ASOF, SUBJECT } from "../../fixtures/northstar/identity.mjs";
export const ADAPTER_VERSION = "flowcredit-readonly/1";
const clone = (x) => JSON.parse(JSON.stringify(x));
export class ResearchAdapter {
  #db;
  #memory;
  #admission;
  #index;
  #depth = 0;
  #manifest;
  constructor(dir) {
    this.#manifest = JSON.parse(readFileSync(join(dir, "manifest.json")));
    if (this.#manifest.subjectId !== SUBJECT || !this.#manifest.synthetic)
      throw Error("SYNTHETIC_ONLY");
    this.#db = new DatabaseSync(join(dir, "memory.sqlite"), {
      readOnly: true,
      allowExtension: false,
    });
    this.#db
      .prepare("ATTACH DATABASE ? AS retrieval")
      .run("file:" + join(dir, "retrieval.sqlite") + "?mode=ro");
    this.#db.exec("PRAGMA query_only=ON");
    const tx = (fn) => this.readTransaction(fn),
      decode = (row) => {
        if (!row) return null;
        const value = JSON.parse(row.payload);
        if (digest(value) !== (row.content_hash ?? row.hash))
          throw Error("MEMORY_INTEGRITY");
        return value;
      };
    const backend = {
      get: (kind, id) => {
        const row = this.#db
          .prepare("SELECT * FROM records WHERE kind=? AND id=?")
          .get(kind, id);
        return row ? { payload: decode(row), createdAt: row.created_at } : null;
      },
      list: (kind) =>
        this.#db
          .prepare("SELECT * FROM records WHERE kind=? ORDER BY id")
          .all(kind)
          .map((row) => ({ payload: decode(row), createdAt: row.created_at })),
      append: () => {
        throw Error("FORBIDDEN");
      },
      transaction: tx,
      close: () => {},
      admissionRecords: () => ({
        list: () =>
          this.#db
            .prepare(
              "SELECT * FROM admission_reviews ORDER BY created_at,candidate_id,version",
            )
            .all()
            .map(decode),
        get: (id) =>
          decode(
            this.#db
              .prepare("SELECT * FROM admission_reviews WHERE id=?")
              .get(id),
          ),
        append: () => {
          throw Error("FORBIDDEN");
        },
      }),
    };
    this.#index = {
      get: (kind, id) =>
        decode(
          this.#db
            .prepare("SELECT * FROM retrieval.objects WHERE kind=? AND id=?")
            .get(kind, id),
        ),
      list: (kind) =>
        this.#db
          .prepare("SELECT * FROM retrieval.objects WHERE kind=? ORDER BY id")
          .all(kind)
          .map(decode),
      transaction: tx,
    };
    this.#memory = new ResearchMemory(backend, { clock: () => ASOF });
    this.#admission = new AdmissionLayer(this.#index, this.#memory, {
      clock: () => ASOF,
    });
  }
  readTransaction(fn) {
    if (this.#depth) return fn();
    this.#db.exec("BEGIN");
    this.#depth++;
    try {
      // Both DB read snapshots are acquired by one statement, before domain expansion.
      this.#db
        .prepare(
          "SELECT (SELECT count(*) FROM records), (SELECT count(*) FROM retrieval.objects)",
        )
        .get();
      const result = fn();
      if (result?.then) throw Error("ASYNC_SNAPSHOT_FORBIDDEN");
      this.#db.exec("COMMIT");
      return result;
    } catch (e) {
      this.#db.exec("ROLLBACK");
      throw e;
    } finally {
      this.#depth--;
    }
  }
  snapshot(taskId, version, labels) {
    return this.readTransaction(() => {
      if (
        !["E", "F"].includes(taskId) ||
        !Number.isInteger(version) ||
        ![1, 2].includes(version)
      )
        throw Error("INVALID_BINDING");
      const claim = this.#memory.getClaim("CLM-001", { version, asOf: ASOF });
      if (!claim || claim.id !== `CLM-001:v${version}`)
        throw Error("REVISION_UNAVAILABLE");
      const queue = this.#admission.listCandidates(SUBJECT, { asOf: ASOF });
      const records = labels.map((label) => {
        const ref = this.#manifest.records[label];
        if (!ref) throw Error("FORBIDDEN");
        const row = queue.find((r) => r.candidate.id === ref.candidateId);
        if (!row || row.validation.validationStatus !== "valid")
          throw Error("CANDIDATE_INVALID");
        const c = row.candidate,
          chunk = this.#index.get("chunk", c.chunkId),
          doc = this.#index.get("document", chunk.documentId);
        const evidence = ref.evidenceId
          ? this.#memory.getEvidence(ref.evidenceId, { asOf: ASOF })
          : null;
        if (
          ref.evidenceId &&
          (!evidence ||
            row.state !== "accepted" ||
            evidence.evidence.sourceId !== c.sourceId)
        )
          throw Error("ADMISSION_BINDING");
        return {
          id: ref.recordId,
          label,
          evidenceId: ref.evidenceId,
          candidateId: c.id,
          sourceId: c.sourceId,
          chunkId: c.chunkId,
          documentId: doc.id,
          excerptReference: {
            chunkId: chunk.id,
            locator: c.locator,
            documentHash: c.documentHash,
          },
          status:
            row.state === "accepted" ? "accepted" : "candidate-not-admitted",
          admissionState: row.state,
          admissionReviewId: row.latestReviewId,
          text: c.quotedText,
          source: {
            id: doc.source.id,
            title: doc.source.title,
            url: doc.source.url,
            documentDate: doc.source.documentDate,
            publisher: doc.source.publisher,
            contentHash: doc.source.contentHash,
          },
          synthetic: true,
        };
      });
      const snap = {
        snapshotId: taskId === "E" ? "S1" : "S2",
        taskId,
        researchObjectId: SUBJECT,
        researchObjectIdentityKind:
          "subjectId (no separate research_object table)",
        subjectId: SUBJECT,
        claimId: "CLM-001",
        baseRevisionId: claim.id,
        baseVersion: claim.version,
        claim: {
          id: claim.claimId,
          version: claim.version,
          text: claim.claim.statement,
          status: claim.claim.status,
          supportingEvidenceIds: claim.claim.supportingEvidenceIds.filter(
            (id) => records.some((r) => r.evidenceId === id),
          ),
        },
        authorizedEvidenceIds: records.flatMap((r) =>
          r.evidenceId ? [r.evidenceId] : [],
        ),
        authorizedSourceIds: [...new Set(records.map((r) => r.sourceId))],
        authorizedRecordIds: records.map((r) => r.id),
        asOf: ASOF,
        createdAt: new Date().toISOString(),
        adapterVersion: ADAPTER_VERSION,
        records,
        synthetic: true,
      };
      return { ...snap, contentDigest: digest(snap) };
    });
  }
  latestVersion() {
    return this.readTransaction(
      () => this.#memory.getClaim("CLM-001", { asOf: ASOF }).version,
    );
  }
  fingerprints() {
    return this.readTransaction(() => ({
      memory: digest(
        this.#db.prepare("SELECT * FROM records ORDER BY kind,id").all(),
      ),
      links: digest(
        this.#db
          .prepare(
            "SELECT * FROM links ORDER BY from_kind,from_id,to_kind,to_id,role",
          )
          .all(),
      ),
      admissions: digest(
        this.#db.prepare("SELECT * FROM admission_reviews ORDER BY id").all(),
      ),
      admissionLinks: digest(
        this.#db
          .prepare("SELECT * FROM admission_fact_links ORDER BY fact_key")
          .all(),
      ),
      retrieval: digest(
        this.#db
          .prepare("SELECT * FROM retrieval.objects ORDER BY kind,id")
          .all(),
      ),
      counts: {
        records: this.#db.prepare("SELECT count(*) n FROM records").get().n,
        evidence: this.#db
          .prepare("SELECT count(*) n FROM records WHERE kind='evidence'")
          .get().n,
        revisions: this.#db
          .prepare("SELECT count(*) n FROM records WHERE kind='revision'")
          .get().n,
      },
    }));
  }
  denyWrite() {
    try {
      this.#db
        .prepare(
          "INSERT INTO records VALUES('identity','forbidden','forbidden','{}','invalid','2026-01-01')",
        )
        .run();
      throw Error("WRITE_UNEXPECTEDLY_ALLOWED");
    } catch (e) {
      if (/readonly/i.test(e.message))
        return { code: "FORBIDDEN", sqliteReadOnly: true };
      throw e;
    }
  }
  close() {
    this.#db.close();
  }
}
export function validateSnapshot(snapshot, task, ownerTaskId = task.id) {
  if (!snapshot) throw Error("SNAPSHOT_MISSING");
  const { contentDigest, ...body } = snapshot;
  if (
    digest(body) !== contentDigest ||
    contentDigest !== task.context.snapshotDigest
  )
    throw Error("SNAPSHOT_MISMATCH");
  if (
    snapshot.taskId !== ownerTaskId ||
    snapshot.snapshotId !== task.context.snapshotId ||
    snapshot.baseRevisionId !== task.context.baseRevisionId ||
    snapshot.subjectId !== task.context.subjectId
  )
    throw Error("REVISION_BINDING_INVALID");
  return snapshot;
}
export function readAuthorized(snapshot, task, args, ownerTaskId = task.id) {
  validateSnapshot(snapshot, task, ownerTaskId);
  if (
    Object.keys(args).some((k) => k !== "recordIds") ||
    !Array.isArray(args.recordIds) ||
    !args.recordIds.length ||
    args.recordIds.length > 4 ||
    args.recordIds.some((id) => !snapshot.authorizedRecordIds.includes(id))
  )
    throw Error("FORBIDDEN");
  return clone(snapshot.records.filter((r) => args.recordIds.includes(r.id)));
}
