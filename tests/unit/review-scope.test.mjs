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
  // Valid recordIds inside the authorized scope and supplied pass.
  const valid = validateReview(
    JSON.stringify(review(["record-a", "record-b"])),
    artifact,
    scope,
    ["record-a", "record-b"],
  );
  assert.deepEqual(valid.issues[0].recordIds, ["record-a", "record-b"]);
  // Empty recordIds are allowed: an issue may cite no record at all.
  assert.deepEqual(
    validateReview(JSON.stringify(review([])), artifact, scope, ["record-a"])
      .issues[0].recordIds,
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
      () =>
        validateReview(JSON.stringify(review(recordIds)), artifact, scope, [
          "record-a",
          "record-b",
        ]),
      /REVIEW_RECORD_OUT_OF_SCOPE/,
    );
  }
  // A review without a scope is never accepted implicitly.
  assert.throws(
    () => validateReview(JSON.stringify(review(["record-a"])), artifact),
    /INVALID_REVIEW_SCOPE/,
  );
  // A non-array supplied set is a contract error, not an implicit pass.
  assert.throws(
    () =>
      validateReview(
        JSON.stringify(review(["record-a"])),
        artifact,
        scope,
        "record-a",
      ),
    /INVALID_REVIEW_SUPPLIED/,
  );
});

test("a reviewer may only cite records whose source text was actually supplied", () => {
  // Only record-a was supplied to this Reviewer run: citing record-b, which is
  // authorized but unsupplied, is rejected before any artifact commit.
  assert.throws(
    () =>
      validateReview(
        JSON.stringify(review(["record-b"])),
        artifact,
        scope,
        ["record-a"],
      ),
    /REVIEW_RECORD_NOT_SUPPLIED/,
  );
  // Mixing a supplied and an unsupplied record is rejected as a whole.
  assert.throws(
    () =>
      validateReview(
        JSON.stringify(review(["record-a", "record-b"])),
        artifact,
        scope,
        ["record-a"],
      ),
    /REVIEW_RECORD_NOT_SUPPLIED/,
  );
  // Without any supplied excerpt, nothing can be cited.
  assert.throws(
    () => validateReview(JSON.stringify(review(["record-a"])), artifact, scope),
    /REVIEW_RECORD_NOT_SUPPLIED/,
  );
  // An issue that cites nothing is still allowed without supplied excerpts.
  assert.deepEqual(
    validateReview(JSON.stringify(review([])), artifact, scope).issues[0]
      .recordIds,
    [],
  );
});

test("informational issues are scope- and excerpt-checked exactly like blocking issues", () => {
  const informational = (recordIds) =>
    JSON.stringify({
      ...review(recordIds),
      decision: "PASS",
      issues: [
        {
          code: "NOTE",
          severity: "informational",
          detail: "参考",
          recordIds,
        },
      ],
      requestedCorrections: [],
    });
  assert.throws(
    () =>
      validateReview(
        informational(["record-outside"]),
        artifact,
        scope,
        ["record-a"],
      ),
    /REVIEW_RECORD_OUT_OF_SCOPE/,
  );
  assert.throws(
    () =>
      validateReview(
        informational(["record-b"]),
        artifact,
        scope,
        ["record-a"],
      ),
    /REVIEW_RECORD_NOT_SUPPLIED/,
  );
});
