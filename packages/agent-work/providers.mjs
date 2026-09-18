import { hash } from "../task-context/contracts.mjs";

export const PROVIDERS = Object.freeze([
  {
    id: "native-harness",
    name: "Harness 原生",
    roles: ["Researcher", "Reviewer"],
    budgetUnit: "modelRequests",
    requestCountObservable: true,
    tools: "task-bound",
    resume: false,
  },
  {
    id: "claude-code",
    name: "Claude Code · 只读复核",
    roles: ["Reviewer"],
    budgetUnit: "delegatedRuns",
    requestCountObservable: false,
    tools: "none",
    resume: false,
  },
]);
export function provider(id, role) {
  const p = PROVIDERS.find((p) => p.id === id);
  if (!p || !p.roles.includes(role)) throw Error("PROVIDER_ROLE_UNSUPPORTED");
  return p;
}
export class AgentWork {
  constructor(executors) {
    this.executors = executors;
  }
  async execute(id, request) {
    const p = provider(id, request.role);
    const t = request.task;
    if (
      t.digest !== hash(t.context) ||
      request.input.snapshotId !== t.context.snapshotId
    )
      throw Error("EXECUTION_CONTRACT_INVALID");
    if (!this.executors[id]) throw Error("PROVIDER_UNAVAILABLE");
    const result = await this.executors[id].execute(request);
    if (
      typeof result.raw !== "string" ||
      result.receipt.inputDigest !== hash(request.input)
    )
      throw Error("EXECUTION_RECEIPT_INVALID");
    return {
      ...result,
      receipt: {
        ...result.receipt,
        workProvider: id,
        budgetUnit: p.budgetUnit,
      },
    };
  }
  cancel() {
    for (const e of Object.values(this.executors)) e.cancel();
  }
}
