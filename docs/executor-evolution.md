# 沿 Executor seam 渐进演化

本文件保留原设计决策。后续实现进度见 [0.2 本地平台](local-platform.md)，不能将下文当作自动更新的能力清单。

状态：长期设计约束与演进决策，2026-09-18。依据用户提供的 [目标架构原文](ideal-architecture-reference.md)。本文不新增运行能力，也不将目标层级视为已实现清单。

## 长期边界

FlowCredit 持有 Duty、Task、Checkpoint、Artifact、预算和研究权威边界。Agent 与 Runtime 可替换，模型仅提供临时推理能力。岗位和已完成工作不依赖会话存活。Experience 是真实状态的视图，不拥有业务权威。

Task ID 属于 FlowCredit；Snapshot 冻结执行世界。Agent 只能读取授权上下文并产生候选。Reviewer PASS 不产生 Evidence Admission、Claim Revision 或 Human Decision。正式写回未来必须由人的决定经受控 Domain Service 完成。

协调优先使用程序；Agent 通过带来源的结构化产物稀疏协作。Reviewer 可要求局部修正，不能扩大权限；新资料需要新 Task / Snapshot。恢复依赖持久任务与产物，不依赖完整聊天记录或思维过程，不能重复已完成的付费工作。

Key 是 RAM 中的临时能力，不是登录身份；不得进入 SQLite、Artifact、Snapshot、Task、会话元数据、日志、浏览器存储或配置文件。外部 Provider 必须单独验证这些语义，不能因本机原生执行器已通过而视为继承。

方案冲突按原文优先级评估：研究权威正确性、范围与授权、持久任务语义、恢复、凭据安全、产物来源链、Runtime 可替换性、Agent 智能、界面便利、视觉表现。这不是降低任何安全边界的许可。

## 当前证据与未实现部分

当前 reference implementation 是 `packages/harness-adapter/executor.mjs` 中的 HarnessSubagentExecutor。它已通过原生 Researcher / Reviewer 的平台级 live acceptance：Task E、Snapshot S1、三次真实请求、两个不推理的协调父会话、独立 fresh child、候选备忘、会话释放、无 Key 重启恢复及 Knowledge Plane 不变。

上述验证属于 35847d977186855ca323d4eca963535bfbfdeffa 的原生执行路径，不证明 Claude Code、Codex 或其他 Provider 已接入。现有单 Duty / 固定 E、F 任务也不等于通用 Duty Registry 或 Task Queue。

Agent Work Registry、Event Inbox、自动驻场、通用 Task Environment Model、局部修订循环、What Changed 和 Human Apply 均属于后续目标。目标中的生命周期示例不要求现在重命名所有状态。OrbStack 部署图是目标参考，不构成本轮部署操作。

## 对先前研究建议的修正

先前提出的“先并行双分支、再接外部 Agent”调整为可选后续路径，不作为当前主线。最小有效协作继续是 Researcher + Reviewer。只有信息可分区、可并行、需要独立验证、不同工具或上下文隔离时才增加角色。

进程隔离、任务图、租约和中央预算调度也是按需求引入的设计选项，不是立即重构要求。避免为了目录结构一次性建立全部 `agent-work/*` 模块。

## 下一步最小开发切片

1. 从现有 execute/cancel 路径提炼最小 AgentWork 合约；保留当前类名、目录和串行行为。status/result 可映射现有生命周期；resume 只在 Provider 真实支持时声明。
2. 把 Harness 专属会话采集留在适配器内，让 Control 依赖规范化结果与能力，而非外部 Provider 内部对象。外部运行不一定有 localAgent 或本地父子会话；缺失字段不伪造。
3. 下一种 Provider 先评估 Claude Code Reviewer。Researcher、固定 Snapshot、Research Artifact 与平台产物校验保持现有边界。目标参考中的 dsh-subagent-claude-code 路径需要在实施时核对具体版本和能力，不假设现有 spawn 参数可直接复用。
4. 在同一 Task / Snapshot / Research Artifact 绑定下比较 Native 与 Claude Reviewer。每次比较是显式新建的独立 AgentRun，不伪装成 Resume；保留各自 Review Artifact，不覆盖原检查点，也不自动重复已完成工作。
5. 两个实现稳定后再考虑 Codex、通用 Registry、Event → Duty → Task、What Changed、Human Apply。阶段次序是路线指导，不要求空实现所有概念接口。

本轮仅记录该切片，未实施 Provider 合约或 Claude Code Executor。

## Provider 能力与预算不强行同构

Native 可使用 `maxModelRequests`；外部 Provider 若只可观测委派次数，则使用 `maxDelegatedRuns`。同时记录 budgetUnit、enforcement、usageSource，未知用量为 unknown。一次委派不是一次模型请求，也不是费用上限。

如果任务明确要求精确模型请求上限，而 Provider 不能强制执行，应在启动前拒绝或由用户显式选择匹配的预算政策，不能静默降级。允许有明确 delegated-run 预算的外部试验，不把实现统一请求网关设为所有接入的先决条件。

能力契约必须声明工具限制、取消确认、输出格式、用量可观察性和恢复语义。取消信号已发送不等于进程已退出；未知的释放状态需明确记录。Tool allow 配置是否真正收窄权限，必须由具体后端验收。

## 每次演进的回归门槛

- 既有原生流程与离线测试不退化，按变更需要进行显式 live 验收。
- 固定 Snapshot、最小上下文、候选与正式证据的区别继续成立。
- Reviewer 实际消费指定 Artifact，输入和输出来源链可核对。
- Stand Down 清除凭据、取消执行；产物保留。重启无 Key，不重复已完成工作。
- 外部 Provider 只能通过受控 Adapter 读资料，不能直接访问研究数据库或整个仓库。
- Workbench 仅为开发观察工具，产品不依赖其服务；Web 不依赖 Harness internals。
- 不为接入新 Runtime 改变人的最终研究权威。
