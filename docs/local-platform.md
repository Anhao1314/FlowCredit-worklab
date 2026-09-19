# FlowCredit 0.2 本地完整运行版

本版本把持久研究任务、两种执行器、候选备忘、对照复核和处理意见连成一个本地产品流程。它仍使用 Northstar 合成研究库，面向本机单用户；不代表目标架构的所有阶段已经实现。

## 安装与启动

要求 Node 24.19.0、npm 11.11.0，macOS 或 Linux。Claude Code 使用官方 SDK 0.3.263 的对应平台可选二进制依赖；安装时不要省略 optional dependencies。首次安装需要访问 npm 和固定 Core 源码。

```sh
npm ci
npm run check
npm test
npm run local:start
```

打开 http://127.0.0.1:8893/ 。`local:start` 在后台启动独立 Node 进程，关闭启动终端不会结束它。`npm run local:status` 查看状态，`npm run local:stop` 先 Stand Down 再停止进程。重复启动不会复制进程；启动器拒绝接管或停止端口上不属于其管理记录的服务。

本地启动器默认数据目录 `.runtime/local-platform`。`npm start` 仍保留开发兼容行为（前台、8799、`.runtime`），不要把两种启动方式的数据目录混淆。可以用非敏感的 `FLOWCREDIT_PORT` / `FLOWCREDIT_RUNTIME_DIR` 指定地址和存储位置；Key 只在页面输入，不接受配置文件或环境变量 fallback。

## 一次完整工作

1. 不激活也能浏览研究记忆和历史候选。
2. 创建 E，冻结 S1 / Claim v1 和四条资料。
3. 在任务中选择 Reviewer：Harness 原生或 Claude Code 只读复核。首次 Reviewer 开始后策略锁定。
4. 在激活页输入 DeepSeek Key，再主动开始研究。激活本身没有模型请求。
5. Researcher 通过原生 Harness 读取固定资料；Reviewer 读取研究产物及实际引用摘录。Reviewer 的 `issues[].recordIds` 在服务端按任务快照校验，并且必须来自本次实际提供的 `sourceExcerpts`：越权引用（`REVIEW_RECORD_OUT_OF_SCOPE`）或引用授权范围内但未提供的原文（`REVIEW_RECORD_NOT_SUPPLIED`）都会让整份复核被拒绝，不会写入复核产物。只有平台校验通过且 Reviewer PASS，才组装 Candidate Memo。
6. 可在已完成任务中显式发起对照复核。跨执行器对照要求复核执行器与原 Reviewer 不同；同一执行器只能显式命名为“重复复核”，或以 `REPEAT_REVIEW` 模式发起，产物会标为重复复核而不是跨执行器对照。
7. Reviewer 要求修订（REQUEST_REVISION）时，平台保留原任务、原研究产物与原复核，零成本创建一个绑定同一固定快照的修复任务壳（记录 `snapshotId` / `snapshotOwnerId` / `contextDigest`，每次派发前重新校验）；它不会自动执行。你显式发起 `START_REPAIR` 后，新的 Researcher 运行产生带 `supersedesArtifactId` 谱系的新产物，修订稿再走同一 Reviewer 机制，PASS 后形成候选备忘并停在人工门。BLOCKED 或执行失败不会自动创建修复任务、也不会自动重试，只提供两个确定性出口：显式创建修复任务（存在非 PASS 复核时）或放弃任务；当存在未完成的子修复任务时，放弃原任务会被拒绝（`ACTIVE_CHILD_TASK_EXISTS`），需要先开始或放弃该修复任务。
8. “保留跟进 / 需要补充 / 暂不采用”记录你的处理意见。它们不是 Evidence Admission、Claim Revision 或正式 Human Apply。
9. 停止协作会清除 Key、等待在途执行退出，并保留任务、修复任务与产物。再次启动无 Key，浏览不需激活，已完成任务不再请求模型。

## 执行器与真实能力

| 项目 | Harness 原生 | Claude Code Reviewer |
| --- | --- | --- |
| 角色 | Researcher / Reviewer | Reviewer |
| 实现 | 官方 native spawn | 官方 Claude Agent SDK + bundled CLI |
| 模型连接 | DeepSeek completions | DeepSeek Anthropic-compatible endpoint |
| 工具 | Researcher 一个授权读取工具；Reviewer 无工具 | tools=[]、deny all、无 MCP；启动事件再次校验 |
| 上下文 | fresh child，固定输入 | fresh process/session，只给待复核产物和摘录 |
| 预算单位 | modelRequests，全局 6 | delegatedRuns，全局 2 |
| 重试 | 原生请求自动重试禁用 | 平台不重派；SDK/provider 内部请求与重试数未知 |
| 使用量 | 原生请求账本；receipt usage 为最后一条消息 | unknown，不把一次委派称为一次模型请求或费用上限 |

外部执行器采用官方 SDK 直接适配平台 AgentWork seam，而没有直接启用当前 DSH Claude 插件：该插件版本的配置不能满足全部禁工具要求。DSH 保持现有版本，没有升级或修改官方源码。

SDK 的工具、MCP、项目配置继承和会话保存均关闭，使用独立空工作目录与独立配置目录。Key 仅作为子进程内存环境传入，父应用不写 Key 配置；前后扫描检查运行目录。空工作目录和工具限制不是 OS 沙箱，同用户进程不属于敌对多租户隔离保障。

## 持久化与恢复

新增表 task_policies、delegations、human_reviews；启动使用增量 CREATE TABLE，不搬迁旧数据。已存在任务缺少策略时默认为 native-harness。

外部运行有独立 executionId 与实际 SDK sessionId；没有 Harness 父会话时字段为 null。正在执行时只可知道预分配 executionId，完成后记录真实子会话。外部结果仍经过同一 Research Artifact 绑定与 Review schema 校验。

正常停止会关闭 SDK 并终止、等待自己拥有的进程组。进程被强制杀死时，远端费用及外部任务状态可能不确定；重启将未结束的 run / 委派标为 interrupted，不自动重试。不能把控制层重启解释为远端账单回滚或强制终止已经发出的远程推理。若 OS 强杀父 Runtime，外部孤儿进程回收尚不具备内核级保证；此版本使用 local:stop / Stand Down 管理生命周期。

对照复核失败不改变原任务 MEMO_READY；失败尝试仍计入对应预算。修复循环为每个新运行单独记账：创建修复任务本身不消耗预算，恢复已提交的修复阶段不重复派发；START_REPAIR 在派发前检查预算，不足时以 `WORK_BUDGET_EXHAUSTED` 拒绝，不产生新请求或新产物；失败重派与自由增加预算仍未提供，避免隐式重复费用。需要正式长期研究工作流时应另行设计预算配置与任务管理，不能删除账本绕过限制。

## 本轮验证

- 真实 Harness Researcher + 真实 Claude Code Reviewer 生成 Task E 的 Candidate Memo；Claude 复核 PASS。
- 同一 Research Artifact 的原生 Reviewer 对照复核 PASS；两个 Reviewer 的 inputDigest 一致。
- 本轮 3 次原生模型请求、1 次外部委派；外部内部模型请求数未知。
- 原生会话全部释放、外部进程释放；活跃 Key 精确扫描与模式扫描均 0 hits。
- Knowledge Plane 的 memory / links / admissions / admissionLinks / retrieval 指纹不变。
- 离线测试包含真实 bundled Claude 进程对本地响应服务器的请求，校验 tools=[]、结构化返回、进程退出和凭据不落盘。
- 浏览器验证包括离线阅读、执行器选择、对照复核、停止和页面错误检查。真实 Key 由用户本人在激活页输入。
- M1.1 离线回归：START_REPAIR 只启动既有修复壳、`ACTIVE_CHILD_TASK_EXISTS` 阻止带未完成子修复任务的放弃、绑定字段篡改在派发前被拒绝（零模型传输）、预算不足在派发前被拒绝；无真实模型调用。

本版继续按串行运行。未接 Codex、豆包、私人研究库、任意任务配置、自动驻场、持续调度、Event Inbox、What Changed 或正式 Human Apply；公开 Pages 保持无 Key、无网络模型调用的模拟演示。
