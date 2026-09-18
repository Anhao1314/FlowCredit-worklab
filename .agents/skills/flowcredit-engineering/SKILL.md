---
name: flowcredit-engineering
description: "Use when modifying code, scripts, config, or docs in the FlowCredit Platform repository, or when a change touches research memory, task/snapshot binding, agent execution or review, budget and resume, credentials and persistence, or git commit/push. FlowCredit 工程纪律与架构不变量（不重复 UI/前端设计类技能）。"
metadata:
  short-description: "FlowCredit 改动前必读的工程纪律、不变量与验证流程"
---

# FlowCredit Engineering

用于 FlowCredit 平台的工程改动。目标不是更快交付，而是不让 Agent 的便利性侵蚀研究权威、可复核性与可恢复性。

## 触发场景

- 改动研究记忆、任务、快照、产物、预算、恢复、复核或凭据相关代码。
- 准备 commit、push、建分支或建 worktree。
- 不确定某次 Agent 输出能否当作结论或依据。

## 架构不变量（不可协商）

- **Model is energy, not the system.** 模型只是临时推理能力；系统是任务、固定快照与持久状态。不能把模型会话当作事实来源或调度中心。
- **Agent is executor, not authority.** Agent 只产出候选；任何代码路径都不得让 Agent 直接写研究记忆。
- **Duty persists longer than Agent sessions.** 持久对象是 Duty / Task / Checkpoint / Artifact，会话是可耗散的。恢复逻辑只能依赖持久状态。
- **Task scope / Snapshot cannot silently expand.** 授权范围与版本只由显式动作绑定；不得因重试、工具参数、`latest` 或时间推移而扩大。
- **Reviewer PASS != Human Approval.** 复核通过只说明候选产物可复核，不构成人工批准。
- **Agent COMPLETE != Research Accepted.** 运行成功、任务完成、产物提交都不改变证据接纳或观点修订状态。
- **Knowledge Plane authoritative writes require explicit human/domain path.** 权威写入必须走显式人工／领域路径；默认只有只读与候选。
- **Resume cannot duplicate completed paid work.** 恢复跳过已提交阶段；中断且结果不确定的尝试不得自动重跑。
- **Secrets must never enter persistent state.** 凭据只留在进程内存；日志、事件、产物、导出、SQLite、Git 都不得出现 key、token 或 PAT。

## 工程流程

1. 先看 `git status`、当前分支与 base SHA；确认工作区是否干净、是否在 worktree。
2. 既有改动不明来源时一律不覆盖：先读、先记录、先确认。
3. 改动最小化：只碰完成任务必需的文件，不做顺手重构。
4. 路径显式：`git add <显式路径>`；禁止 `git add .` 与 `git add -A`。
5. 跑相关测试；再跑 `npm run check`；涉及链路、持久化或恢复时跑 `npm test`。
6. 逐项检查 `git status --short`、`git diff`、`git diff --cached`，并单独确认 untracked 文件（`git diff` 不含 untracked），确保没有意外文件。
7. 密钥与隐私复查：不得出现凭据、真实运行数据、导出、SQLite、机器绝对路径。
8. 声明 PASS 前给出证据：命令、退出码、关键输出；没验证就写"未验证"。

## 硬性禁止

- 未经明确授权不 `git push`，尤其不推 `main`。
- 不擅自 commit、推送或改写历史。
- 运行状态不是源码：不手工篡改真实 `.runtime/` 状态，不提交 `.runtime` 运行数据。
- 测试可使用明确隔离的 disposable runtime 目录；其产生的 credential、SQLite、session 与私有数据不得进入 Git。
- 真实研究数据与生产库仍禁止修改。
- 不把候选产物写成已接纳证据，不创建正式关系或修订。
- 不为"跑通"放宽预算、取消限流或跳过校验。
- 不把密钥或任何运行时私有数据写入仓库。

## 边界

Agent 完成、Reviewer PASS、任务 `MEMO_READY` 都不是发布或接纳信号。需求与本技能不变量冲突时：先停下来说明冲突，等待显式决定。
