// Test-process-only wire stub; never imported by the application.
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
  if (input.researchArtifact)
    return sse({
      delta: {
        content: JSON.stringify({
          reviewedArtifactId: input.researchArtifact.id,
          decision: "PASS",
          issues: [],
          requestedCorrections: [],
          reviewLimitations: ["离线测试策略，并非真实模型判断"],
        }),
      },
    });
  if (!body.messages.some((m) => m.role === "tool"))
    return sse({
      reason: "tool_calls",
      delta: {
        tool_calls: [
          {
            index: 0,
            id: "offline-read",
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
            observation: "已读取授权资料，解释仍待人工复核。",
            citations: [input.authorizedRecords[0].recordId],
            limitations: ["合成测试"],
          },
        ],
        unresolvedQuestions: ["未来客户结构尚未确认。"],
      }),
    },
  });
};
