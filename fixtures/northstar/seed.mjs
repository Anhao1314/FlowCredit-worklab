// Administrative synthetic fixture setup only. Never imported by Agent execution.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { openMemory } from "../../packages/research-adapter/core.mjs";
import { normalizeSource } from "../../packages/research-adapter/core.mjs";
import {
  parseDocument,
  byteHash,
} from "../../packages/research-adapter/core.mjs";
import { RetrievalIndex } from "../../packages/research-adapter/core.mjs";
import { RetrievalLayer } from "../../packages/research-adapter/core.mjs";
import {
  AdmissionLayer,
  candidateHash,
} from "../../packages/research-adapter/core.mjs";
export const SUBJECT = "northstar-synthetic",
  ASOF = "2026-08-10T23:59:59.999Z";
export function seed(dir) {
  mkdirSync(dir, { recursive: true });
  const manifestFile = join(dir, "manifest.json");
  if (existsSync(manifestFile)) return JSON.parse(readFileSync(manifestFile));
  const clock = () => "2026-08-09T12:00:00.000Z",
    index = new RetrievalIndex(join(dir, "retrieval.sqlite")),
    memory = openMemory({ filename: join(dir, "memory.sqlite"), clock }),
    layer = new RetrievalLayer(index, { clock }),
    admission = new AdmissionLayer(index, memory, {
      clock,
      allowSystemTest: true,
    });
  const manifest = {
    subjectId: SUBJECT,
    claimId: "CLM-001",
    synthetic: true,
    records: {},
  };
  try {
    const texts = {
      "R-01": "2025 Q2 最大客户收入占比 62%。",
      "R-02": "2026 Q2 最大客户收入占比 48%，上年同期 62%。",
      "R-03": "2026 Q2 前三大客户收入占比 76%。",
      "R-04": "预计新增客户将逐步改善收入来源结构。",
      "R-X": "未授权的合成隔离记录，不得进入研究任务。",
    };
    for (const [label, text] of Object.entries(texts)) {
      const raw = `<h1>Northstar synthetic ${label}</h1><p>${text}</p>`,
        filename = join(dir, label + ".html");
      writeFileSync(filename, raw);
      const source = normalizeSource({
        subjectId: SUBJECT,
        sourceType: "official_announcement",
        title: `Northstar Synthetic ${label}`,
        publisher: "Synthetic Fixture Publisher",
        url: `https://example.invalid/northstar/${label}`,
        documentDate: "2026-08-08",
        retrievedAt: clock(),
        fiscalPeriod: "Synthetic fixture",
        fiscalYear: 2026,
        isPrimarySource: true,
        contentHash: byteHash(Buffer.from(raw)),
        metadata: {
          documentKey: `northstar-fixture-${label}`,
          hashStatus: "verified_bytes",
          hashScope: "document_bytes",
          retrievalNote: "Entirely synthetic fixture. No real corporate data.",
          discoveryUrl: "https://example.invalid/",
        },
      });
      const doc = parseDocument({
        source,
        filename,
        format: "html",
        availability: {
          availableAt: "2026-08-08T00:00:00Z",
          basis: "Synthetic controlled date",
          scope: "entire_document",
          firstPage: 1,
        },
        retrievedAt: clock(),
        createdAt: clock(),
      });
      index.indexDocument(doc);
      const chunk = index
        .list("chunk")
        .find((c) => c.documentId === doc.id && c.text.includes(text));
      const candidate = layer.createCandidate(chunk.id, {
        query: text,
        subjectId: SUBJECT,
        asOf: ASOF,
        timeMode: "audit",
        mode: "lexical",
        quotedText: text,
      });
      const stored = index.get("candidate", candidate.id);
      if (!stored) throw Error("CANDIDATE_NOT_CREATED");
      let evidenceId = null,
        reviewId = null;
      if (label !== "R-04") {
        const accepted = admission.acceptCandidate(stored.id, {
          candidateHash: candidateHash(stored),
          subjectId: SUBJECT,
          reviewerType: "system_test",
          reviewerId: "northstar-fixture-setup",
          reasonCode: "verified_primary_source",
          note: "Explicit synthetic test setup, not Agent admission.",
        });
        evidenceId = accepted.evidenceId;
        reviewId = accepted.review.id;
      }
      manifest.records[label] = {
        recordId: evidenceId ?? stored.id,
        evidenceId,
        candidateId: stored.id,
        sourceId: source.id,
        chunkId: chunk.id,
        documentId: doc.id,
        reviewId,
      };
    }
    memory.createClaim({
      id: "CLM-001",
      subjectId: SUBJECT,
      statement: "客户集中度仍然较高，需要持续关注。",
      category: "customer_concentration",
      supportingEvidenceIds: [manifest.records["R-01"].evidenceId],
      counterEvidenceIds: [],
      confidence: 0.7,
      status: "supported",
      method: "Synthetic fixture initialization; no inference",
      createdAt: clock(),
      updatedAt: clock(),
    });
    writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
    return manifest;
  } finally {
    memory.close();
    index.close();
  }
}
export function createV2(dir) {
  const memory = openMemory({
    filename: join(dir, "memory.sqlite"),
    clock: () => "2026-08-10T12:00:00.000Z",
  });
  try {
    const current = memory.getClaim("CLM-001");
    if (current.version === 2) return current;
    return memory.reviseClaim(
      "CLM-001",
      {
        statement: "最大客户集中度有所下降，但前三大客户集中度仍然较高。",
        supportingEvidenceIds: [current.claim.supportingEvidenceIds[0]],
      },
      {
        revisionReason: "manual_review",
        expectedVersion: 1,
        note: "Explicit synthetic administrative test event; not an Agent write.",
      },
    );
  } finally {
    memory.close();
  }
}
