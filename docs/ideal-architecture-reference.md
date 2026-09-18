# FlowCredit Ideal Architecture Reference
# Persistent Swarm / Agent Work / Research Memory
#
# 这不是当前实现清单。
# 这是 FlowCredit 的目标架构与设计原则。
#
# 你在后续开发中可以调整具体代码组织，
# 但不要破坏这些核心边界。


==================================================
0. 一句话定义
==================================================

FlowCredit 是一个：

“由可替换 Agent 构成、以持久岗位为核心、
在固定上下文与显式状态中协同工作，
并由人类保留最终研究权威的数字研究组织。”

英文可理解为：

A persistent organization of replaceable agents
working under bounded context,
explicit state,
structured coordination,
and human-retained authority.


我们不是在做：

多个 Agent 互相聊天然后给一个答案。


我们真正要做的是：

岗位长期存在；
任务状态长期存在；
研究记忆长期存在；

模型可以换；
Agent 可以销毁；
执行 Runtime 可以替换；

但组织本身不能消失。


==================================================
1. 八条核心原则
==================================================

1. Model is energy, not the system.
   模型是能源，不是系统。

2. Agent is executor, not authority.
   Agent 是执行者，不是研究权威。

3. Duty persists longer than Agent sessions.
   岗位比 Agent 会话活得更久。

4. Task state must be explicit.
   工作状态必须显式持久化，不能只存在聊天上下文。

5. Scope never expands silently.
   Agent 不能静默扩大上下文、权限或数据范围。

6. Agents exchange artifacts, not authority.
   Agent 通过结构化 Artifact 协作，不通过共识获得权威。

7. Feedback may repair execution, not expand permission.
   Reviewer 可以要求局部修正，但不能替 Researcher 扩大权限。

8. Human retains research authority.
   Evidence 接纳、Claim 修订等正式研究变化最终由人类决定。


==================================================
2. 理想总体架构
==================================================

                         Human
               Goal / Scope / Approval
                         │
                         ▼
┌──────────────────────────────────────────────┐
│              Experience Plane                │
│                                              │
│ Creation / Activation                        │
│ Research Workspace                           │
│ Duty / Task / What Changed                   │
│ Human Review                                 │
│ Research Memory Browser                      │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│               Control Plane                  │
│                                              │
│ Duty Registry                                │
│ Event Inbox                                  │
│ Task Queue                                   │
│ Task Environment State                       │
│ Snapshot Binding                             │
│ Budget                                       │
│ Cancellation                                 │
│ Checkpoint                                   │
│ Recovery                                     │
│ Human Review Queue                           │
│ Lifecycle / Audit Events                     │
└──────────────────────┬───────────────────────┘
                       │
                  Task Contract
                       │
                       ▼
┌──────────────────────────────────────────────┐
│              Agent Work Layer                │
│                                              │
│ Provider Registry                            │
│ Execution Contract                           │
│ Capability Model                             │
│ Run Lifecycle                                │
│ Event Normalization                          │
│ Artifact Normalization                       │
│ Provider-specific Budget Semantics           │
└───────────────┬───────────────┬──────────────┘
                │               │
                ▼               ▼
      ┌────────────────┐   ┌────────────────┐
      │ Harness Native │   │  Claude Code   │
      │    Executor    │   │    Executor    │
      └───────┬────────┘   └───────┬────────┘
              │                    │
              │                    │
              ▼                    ▼
       Harness Subagent       Bundled Claude Code
              │                    │
              └────────┬───────────┘
                       │
                       ▼
                 Model Plane
              DeepSeek / GPT / etc.


同时：

┌──────────────────────────────────────────────┐
│              Knowledge Plane                 │
│                                              │
│ FlowCredit Research Memory                   │
│ Source                                       │
│ Evidence                                     │
│ Admission                                    │
│ Claim                                        │
│ Claim Revision                               │
│ Grounding                                    │
│ Relation                                     │
│ Proposal                                     │
│ Human Decision                               │
│ Provenance                                   │
└──────────────────────────────────────────────┘


Control / Agent Work 只能通过受控 Adapter
读取 Knowledge Plane。

Agent 不能直接操作 Research Memory。


==================================================
3. 五个 Plane 的职责
==================================================


--------------------------------
A. Experience Plane
--------------------------------

它负责：

用户看到什么；
用户如何激活系统；
用户如何观察研究进度；
用户如何审核候选变化。


主要界面：

Creation / Activation

Research Overview

Research Memory

Task Collaboration

Execution History

What Changed

Human Review


Experience Plane 不拥有权威业务状态。

它只是：

Control Plane
+
Knowledge Plane

的视图。


--------------------------------
B. Control Plane
--------------------------------

这是“蜂群长期存在”的核心。


长期保存：

Duty

Task

Checkpoint

AgentRun

Artifact

Budget

UnresolvedIssue

Event

HumanReviewState


它回答：

这个组织现在有哪些岗位？

什么工作还没完成？

什么已经完成？

下一步应该做什么？

哪些资料可访问？

哪些 Agent provider 可用？

模型现在有没有能源？

发生故障以后从哪里恢复？


关键原则：

Agent session != Task

Model session != Duty


--------------------------------
C. Agent Work Layer
--------------------------------

这是我们未来最重要的抽象之一。


FlowCredit 不应该绑定：

DeepSeek Harness

Claude Code

Codex

豆包 Work

某一个具体 Agent Runtime。


统一概念：

AgentWorkProvider


概念接口：

capabilities()

execute(taskContract)

cancel(run)

status(run)

result(run)

optional resume()


Provider 可以包括：

native-harness

claude-code

codex

doubao-work

future-agent-runtime


Control Plane 不关心：

下面具体是什么模型或 Agent 产品。


它只关心：

Task Contract
↓
AgentRun
↓
Structured Artifact


--------------------------------
D. Knowledge Plane
--------------------------------

FlowCredit 的 Research Memory。


它保存：

我们正式记录了什么；

为什么这么记录；

观点在什么时候改变；

哪些 Evidence 被正式接纳；

哪些 Claim Revision 是权威版本。


这是 FlowCredit 最核心的长期资产。


Agent 只能：

READ

PROPOSE


不能：

AUTHORITATIVE WRITE


--------------------------------
E. Model Plane
--------------------------------

DeepSeek / GPT / Claude / local models。


模型只是：

Inference Capability


它不拥有：

Task

Duty

Research Memory

Authority


API Key 的含义：

接通推理能源。


不是：

登录身份。


==================================================
4. 两套完全不同的状态系统
==================================================

FlowCredit 必须始终区分：

Execution State

和：

Research Authority State


--------------------------------
Execution State
--------------------------------

例如：

WAITING
↓
RESEARCH_RUNNING
↓
RESEARCH_COMPLETE
↓
REVIEW_PENDING
↓
REVIEW_RUNNING
↓
MEMO_READY


这是：

“工作做到哪里了？”


--------------------------------
Research Authority State
--------------------------------

例如：

Source
↓
Candidate
↓
Admission
↓
Evidence
↓
Claim
↓
Proposal
↓
Human Decision
↓
Claim Revision


这是：

“正式研究记录改变了吗？”


两者绝对不能等价。


必须保持：

Agent COMPLETE
!= Research Accepted

Reviewer PASS
!= Human Approval

Task COMPLETE
!= Claim Revision


==================================================
5. Persistent Duty Theory
==================================================

蜂群真正长期存在的是：

Duty


例如：

Northstar Continuous Research


这个 Duty 可以存在几个月。


而一次 Research Agent：

可能只存在几十秒。


生命周期：

Duty
│
├── Task 001
│    ├── Research AgentRun
│    └── Reviewer AgentRun
│
├── Task 002
│    ├── Research AgentRun
│    └── Reviewer AgentRun
│
└── Task 003


Agent 可以：

spawn

complete

die

restart


Duty 不消失。


所以：

Agent restart
!=
Work restart


==================================================
6. Task Contract
==================================================

任何 Agent Work Provider
都应该收到一个显式 Task Contract。


概念结构：

TaskContract {
  taskId
  dutyId

  goal

  snapshotId
  baseRevisionId

  authorizedContext

  candidateMaterials

  toolPolicy

  budget

  completionCriteria

  providerPolicy
}


Agent 不应该收到：

整个数据库

整个 repo

所有历史

其他 Task

整个 FlowCredit state


最小上下文原则。


==================================================
7. Snapshot 是执行世界边界
==================================================

Task 创建后：

Snapshot 冻结。


例如：

Task T1

Claim:
CLM-001:v1

Allowed:
R-01
R-02
R-03

Snapshot:
S1


之后数据库出现：

v2

R-04

R-05


T1 仍然只能看到：

S1。


原则：

No Silent Latest

No Silent Context Expansion


如果要使用新资料：

创建新的 Task / Snapshot。


==================================================
8. Task Environment Model
==================================================

我们所谓第一版 World Model
不是市场预测模型。


它是：

Task Environment Model


它描述：

当前 Duty 是什么？

Task 做到哪一步？

Snapshot 是什么？

哪些 Artifact 已存在？

哪些 Agent Provider 可用？

剩多少预算？

有哪些 unresolved issue？

有哪些合法动作？


例如：

Task:
T-42

State:
REVIEW_PENDING

ResearchArtifact:
exists

Reviewer:
not started

Model:
OFFLINE

AllowedActions:
ACTIVATE
VIEW_ARTIFACT

Forbidden:
RUN_RESEARCHER_AGAIN


状态变化必须来自：

真实 Event。


Prediction
!=
Actual State


==================================================
9. Coordinator 原则
==================================================

Coordinator 不一定是 Agent。


能 deterministic 的东西：

全部优先用代码。


例如：

资料有没有授权？

Task 到哪一步？

预算够不够？

下一步是 Researcher 还是 Reviewer？

Artifact 是否存在？

是否允许 Resume？


这些不需要 LLM。


LLM Coordinator 只应该处理：

开放式任务分解

复杂目标理解

未知路线选择


所以我们的协调哲学是：

Deterministic Control
+
Goal-driven Intelligence


==================================================
10. Agent 协作不是群聊
==================================================

不要建立：

Researcher
↔ Reviewer
↔ Planner
↔ Critic
↔ Monitor

所有 Agent 全连接聊天。


我们希望：

Sparse Artifact-Based Coordination


例如：

Researcher
↓
ResearchArtifact
↓
Reviewer
↓
ReviewArtifact
↓
Control Plane


Agent 交换：

Artifact

Event

State


而不是：

完整 conversation

完整 CoT

整个上下文


==================================================
11. Researcher / Reviewer
==================================================


Researcher：

目标：

在当前授权范围内
形成候选观察。


输出：

ResearchArtifact {
  observations
  citations
  limitations
  unresolvedQuestions
}


Reviewer：

独立执行。


输入：

Task Scope

ResearchArtifact

实际引用 excerpts


检查：

citation support

scope

candidate/evidence distinction

silent latest

overclaim

authority language


输出：

ReviewArtifact {
  decision

  issues

  requestedCorrections

  limitations
}


Decision：

PASS

REQUEST_REVISION

BLOCKED


==================================================
12. Local Repair Without Authority Expansion
==================================================

如果 Reviewer 发现：

Researcher 的结论
依赖未授权的 R-02


Reviewer：

REQUEST_REVISION


Researcher 可以：

修改自己的 Artifact


但是不能：

自己获得 R-02 权限。


反馈允许：

repair execution


反馈不允许：

expand authority


==================================================
13. Agent Runtime 可替换
==================================================

理想状态：

同一个 Task：

T-100

同一个 Snapshot：

S-100


可以运行：

HarnessNativeExecutor


也可以运行：

ClaudeCodeExecutor


甚至未来：

CodexExecutor


Control Plane 不变化。


例如：

AgentRun A

provider:
native-harness


AgentRun B

provider:
claude-code


两者最终都归一化成：

Structured Artifact


==================================================
14. Executor 结构
==================================================

目标结构：


AgentWorkExecutor
│
├── HarnessSpawnExecutor
│
│    └── Harness native child
│
├── ClaudeCodeExecutor
│
│    └── dsh-subagent-claude-code
│
├── CodexExecutor
│
│    └── future
│
└── DoubaoWorkExecutor
     └── future


第一阶段：

HarnessSpawnExecutor
已经作为 reference implementation。


Claude Code：

先作为 Reviewer。


==================================================
15. Provider-specific Budget
==================================================

不同 Agent Runtime
不能假装拥有相同计费语义。


例如：


Harness Native：

可以可靠知道：

modelRequestCount


Claude Code：

外层可能只知道：

delegatedRunCount


所以 Budget 应支持：


Native:

maxModelRequests


Claude:

maxDelegatedRuns


不能：

把 Claude Code 一次 run
假装成一次 LLM request。


Usage 不知道时：

unknown


不要编造。


==================================================
16. Artifact 是真正的 Agent 交流协议
==================================================

FlowCredit 不依赖：

Agent chat history


恢复工作依赖：

Task

Checkpoint

Artifact


例如：

Researcher 完成：

ResearchArtifact durable

Checkpoint:
REVIEW_PENDING


然后：

整个系统关闭。


重启：


不需要恢复 Researcher conversation。


Control Plane 看到：

ResearchArtifact exists

REVIEW_PENDING


于是：

spawn new Reviewer


这就是：

Agent replaceability。


==================================================
17. Credential / Model Power
==================================================

API Key：

只作为 ephemeral capability。


用户：

Activate


↓

Key 进入 runtime RAM


↓

Credential Provider


↓

Agent Runtime


Stand Down：

clear credential


Process exit：

credential gone


禁止 Key 进入：

SQLite

Artifact

Snapshot

Task

Session metadata

Logs

Browser storage

.env


但：

Duty

Task

Artifact

Research Memory


继续存在。


==================================================
18. Lifecycle
==================================================

正常生命周期：


DORMANT

↓

NEW WORK

↓

WAITING_FOR_MODEL

↓

ACTIVATED

↓

RESEARCHING

↓

REVIEWING

↓

AWAITING_HUMAN

↓

DORMANT


断电恢复：


RESEARCH_COMPLETE

↓

CHECKPOINT

↓

POWER OFF

↓

PROCESS DEAD

↓

RESTART

↓

STATE RESTORED

↓

RE-KEY

↓

REVIEWER SPAWN

↓

CONTINUE


Persistent Swarm
!=
Persistent Inference


==================================================
19. Human Authority
==================================================

Agent 最终只能产生：

Candidate


例如：

Candidate Observation

Candidate Memo

What Changed Candidate

Revision Proposal Candidate


只有 Human：

可以正式执行：

Evidence Admission

Claim Revision Apply

Research Decision


未来 Human Apply
应该通过：

受控 Domain Service


绝不能：

Agent 直接写 DB。


==================================================
20. 两个闭环
==================================================


Execution Loop：

Event
↓
Duty
↓
Task
↓
Agent
↓
Tool
↓
Observation
↓
Artifact
↓
Feedback
↓
Repair / Complete / Escalate


Research Loop：

Source
↓
Candidate
↓
Admission
↓
Evidence
↓
Claim
↓
Relation
↓
Proposal
↓
Human Decision
↓
Revision


连接点：

Candidate Artifact


但：

Execution Loop
不能直接推进
Research Loop。


==================================================
21. Experience Layer 最终形态
==================================================

首页：

Creation / Activation


Dormant：

Research Memory readable

Agent OFF


输入 Key：

Activate Swarm


指尖接触只是视觉隐喻。


真实后台发生：

Model Capability ON

Control Plane restore

Pending Duty detected


首页结束后：

不是：

Start Chat


而是：

1 Pending Duty Restored

Resume Duty


==================================================
22. DSH Workbench 的位置
==================================================

DSH Workbench 是：

Developer Console

Debug UI

Runtime Inspector


不是 FlowCredit 产品依赖。


FlowCredit 不应该：

iframe Workbench

或者：

必须启动 Workbench server
才能工作。


真正复用的是：

DeepSeek Harness runtime
subagent seam
jobs
session lifecycle


Workbench 只是观察工具。


==================================================
23. OrbStack / Deployment
==================================================

理想部署：

OrbStack / Container
│
├── FlowCredit Web
├── FlowCredit Runtime
├── Control Plane
├── Agent Work Layer
├── Harness Runtime
├── Research Adapter
│
└── Persistent Volume
    ├── control.sqlite
    ├── research.sqlite
    └── artifacts/


代码：

可重新 build。


状态：

persistent volume。


API Key：

RAM only。


==================================================
24. 我们不要做什么
==================================================

不要把 FlowCredit 变成：

Agent 聊天 UI。


不要认为：

Agent 越多越强。


不要默认：

所有 Agent 都互相通信。


不要：

LLM 控制所有状态机。


不要：

一个 Agent PASS
自动改 Claim。


不要：

一个 Runtime ID
成为 Task ID。


不要：

把 Conversation
当 Research Memory。


不要：

为了支持 Claude/Codex
破坏原来的权限模型。


不要：

为外部 Agent
直接暴露整个 repo / DB。


==================================================
25. 多 Agent 的增加原则
==================================================

只有满足以下条件时
才增加 Agent：


信息可以真正分区；

任务可以并行；

需要独立验证；

需要不同工具能力；

上下文隔离有价值。


否则：

一个 Agent 更简单。


我们当前最小有效蜂群：

Researcher

Reviewer


足够。


==================================================
26. 当前目标演进路径
==================================================

Stage 1

HarnessSpawnExecutor

Researcher
Reviewer


Stage 2

ClaudeCodeExecutor

先 Reviewer


Stage 3

同一个 Task / Snapshot：

Native Reviewer

vs

Claude Code Reviewer


验证：

Runtime 可替换。


Stage 4

CodexExecutor


Stage 5

Agent Work Registry


Stage 6

Event → Duty → Task


Stage 7

What Changed


Stage 8

Human Apply


==================================================
27. 理想代码边界
==================================================

大致可以形成：


apps/
├── web
└── runtime


packages/
├── control-plane
│
├── task-context
│
├── research-adapter
│
├── harness-adapter
│
└── agent-work
    ├── contracts
    ├── registry
    ├── native-harness
    ├── claude-code
    ├── codex
    └── future


不要为了目录漂亮
强行重构。


核心是：

dependency direction。


Control Plane

可以依赖：

AgentWork contract


但不能：

直接依赖 Claude Code internals。


==================================================
28. 理想依赖方向
==================================================

Experience

↓

Control Plane

↓

Agent Work Contract

↓

Provider Adapter

↓

Runtime


Knowledge Plane：

通过 read-only Adapter
进入 Task Context。


禁止出现：

Claude Code
→ Research DB


禁止：

Web
→ Harness internals


禁止：

Agent Runtime
→ Human Authority state


==================================================
29. 最重要的系统不变量
==================================================

未来任何实现都必须满足：


1.

Task ID
永远属于 FlowCredit。


2.

Snapshot
决定 Agent 的研究世界。


3.

Agent 不可以静默扩大 Snapshot。


4.

Agent output
永远先是 Candidate。


5.

Reviewer PASS
不能产生 Authority。


6.

Agent Session 可以消失。


7.

Artifact 必须 survive Agent death。


8.

Resume 不能重复已完成的付费工作。


9.

Provider 可以替换。


10.

Human 可以永远知道：

为什么这个结果出现。


==================================================
30. 最终产品哲学
==================================================

FlowCredit 不是：

“一个拥有很多 Agent 的 AI 产品。”


它更接近：

“一个可以容纳不同 Agent、
长期保存岗位与研究状态、
并把 AI 执行与人类权威分开的数字组织运行系统。”


模型：

提供 intelligence。


Agent：

提供 labor。


Control Plane：

提供 organization。


Research Memory：

提供 institutional memory。


Human：

保留 authority。


==================================================
31. 你在后续开发中的判断原则
==================================================

如果实现方案有冲突，

优先级从高到低：


1. Research Authority correctness

2. Scope / authorization correctness

3. Persistent task semantics

4. Recovery correctness

5. Secret safety

6. Artifact lineage

7. Runtime replaceability

8. Agent intelligence

9. UI convenience

10. Visual polish


不要为了：

更聪明的 Agent

牺牲：

可恢复性

可审计性

权限边界。


==================================================
32. 当前理想架构的最短表达
==================================================

Human
  ↓
Persistent Duty
  ↓
Version-Bound Task
  ↓
Deterministic Control
  ↓
Replaceable Agent Runtime
  ↓
Structured Artifact
  ↓
Independent Review
  ↓
Human Decision
  ↓
Research Memory


其中：

Model 可以换。

Agent 可以换。

Runtime 可以换。


Task
Authority
Memory

不能跟着换。