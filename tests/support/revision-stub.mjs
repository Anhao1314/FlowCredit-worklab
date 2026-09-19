// Test-process-only wire stub: the first review requests a revision, the review
// of a repair artifact passes. Never imported by the application.
const sse = (content) =>
  new Response(
    `data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: "assistant", ...content.delta }, finish_reason: content.reason || "stop" }] })}\n\ndata: [DONE]\n\n`,
    { headers: { "content-type": "text/event-stream" } },
  );
globalThis.fetch = async (url, options) => {
  if (String(url) !== "https://api.deepseek.com/v1/chat/completions")
    throw Error("TEST_NETWORK_DENIED");
  const body = JSON.parse(options.body);
  const user = body.messages.findLast((m) => m.role === "user");
  const text =
    typeof user.content === "string"
      ? user.content
      : user.content.map((x) => x.text || "").join("");
  const input = JSON.parse(text.split("INPUT_JSON\n")[1]);
  if (input.researchArtifact) {
    const revised = !!input.task?.repair;
    return sse({
      delta: {
        content: JSON.stringify(
          revised
            ? {
                reviewedArtifactId: input.researchArtifact.id,
                decision: "PASS",
                issues: [],
                requestedCorrections: [],
                reviewLimitations: ["修订稿离线复核策略，非真实模型判断"],
              }
            : {
                reviewedArtifactId: input.researchArtifact.id,
                decision: "REQUEST_REVISION",
                issues: [
                  {
                    code: "SCOPE_WORDING",
                    severity: "blocking",
                    detail: "表述超出授权资料支持范围",
                    recordIds: [input.task.scope[0]],
                  },
                ],
                requestedCorrections: ["仅依据授权原文改写结论"],
                reviewLimitations: ["初稿离线复核策略，非真实模型判断"],
              },
        ),
      },
    });
  }
  if (!body.messages.some((m) => m.role === "tool"))
    return sse({
      reason: "tool_calls",
      delta: {
        tool_calls: [
          {
            index: 0,
            id: "offline-repair-read",
            type: "function",
            function: {
              name: "get_authorized_records",
              arguments: JSON.stringify({
                recordIds: input.authorizedRecords.map((r) => r.recordId),
              }),
            },
          },
        ],
      },
    });
  return sse({
    delta: {
      content: JSON.stringify({
        observations: [
          {
            observation: input.originalResearchArtifact
              ? "修订稿：按复核意见在授权范围内改写结论表述。"
              : "初稿：客户集中度需要更保守的表述。",
            citations: [input.authorizedRecords[0].recordId],
            limitations: ["合成离线测试策略"],
          },
        ],
        unresolvedQuestions: [],
      }),
    },
  });
};
