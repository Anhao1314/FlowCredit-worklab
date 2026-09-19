import test from "node:test";
import assert from "node:assert/strict";
import { validateReview } from "../../packages/task-context/contracts.mjs";

const artifact = { id: "research-1" };
const scope = ["record-a", "record-b"];
const review = (recordIds, extra = {}) => ({
  reviewedArtifactId: "research-1",
  decision: "REQUEST_REVISION",
  issues: [
    {
      code: "UNAUTHORIZED_SUPPORT",
      severity: "blocking",
      detail: "引用需要核对",
      recordIds,
    },
  ],
  requestedCorrections: ["在授权范围内修正"],
  reviewLimitations: [],
  ...extra,
});

test("reviewer recordIds are validated against the Task's authorized snapshot scope", () => {
  // Valid recordIds inside the authorized scope pass.
  const valid = validateReview(
    JSON.stringify(review(["record-a", "record-b"])),
    artifact,
    scope,
  );
  assert.deepEqual(valid.issues[0].recordIds, ["record-a", "record-b"]);
  // Empty recordIds are allowed: an issue may cite no record at all.
  assert.deepEqual(
    validateReview(JSON.stringify(review([])), artifact, scope).issues[0]
      .recordIds,
    [],
  );
  // Unknown / forged recordId, and a record that exists in another snapshot
  // but not in this Task's authorized scope, are all rejected as out of scope.
  for (const recordIds of [
    ["record-unknown"],
    ["records/R-99"],
    ["record-a", "record-outside"],
  ]) {
    assert.throws(
      () => validateReview(JSON.stringify(review(recordIds)), artifact, scope),
      /REVIEW_RECORD_OUT_OF_SCOPE/,
    );
  }
  // A review without a scope is never accepted implicitly.
  assert.throws(
    () => validateReview(JSON.stringify(review(["record-a"])), artifact),
    /INVALID_REVIEW_SCOPE/,
  );
});

test("informational issues are scope-checked exactly like blocking issues", () => {
  const informational = JSON.stringify({
    ...review(["record-a"]),
    decision: "PASS",
    issues: [
      {
        code: "NOTE",
        severity: "informational",
        detail: "参考",
        recordIds: ["record-outside"],
      },
    ],
    requestedCorrections: [],
  });
  assert.throws(
    () => validateReview(informational, artifact, scope),
    /REVIEW_RECORD_OUT_OF_SCOPE/,
  );
});
