// Explicit design fixtures, not a projection of currently running providers.
// Parallel roles, synthesis, repair and provider replacement are proposed flows.
export const DUTIES = [
  { id:'researcher', title:'Research', cn:'研究', purpose:'读取固定资料，形成研究候选', x:145, y:433, cast:'jim' },
  { id:'risk', title:'Risk', cn:'风险', purpose:'整理风险与限制，不给出交易建议', x:425, y:433, cast:'oscar' },
  { id:'evidence', title:'Evidence', cn:'证据', purpose:'核对来源、摘录与证据链', x:145, y:679, cast:'pam' },
  { id:'synthesis', title:'Synthesis', cn:'综合', purpose:'组合独立产物，保留输入来源', x:425, y:679, cast:'angela' },
  { id:'reviewer', title:'Review', cn:'独立复核', purpose:'复核其他岗位的产物；不代表人工批准', x:755, y:520, cast:'dwight' },
];
export const TASK = { id:'DEMO-T01', title:'北辰算力 · 收入集中度复核', snapshot:'DEMO-S01' };
const run = (id, role, taskId=TASK.id, provider='native-harness') => ({id,role,taskId,provider,pose:'working'});
const object = (id,kind,title,slot,producer,extra={}) => ({
  id,kind,title,slot,producer,taskId:TASK.id,snapshot:TASK.snapshot,
  provider:producer==='Run-05'?'claude-code':'native-harness',
  digest:'demo-'+id+'-v1',state:'ready',...extra,
});
const snapshot=object('S01','snapshot','固定快照','vault-snapshot','Human',{state:'bound',provider:'human'});
const research=object('A01','research','研究材料','research-tray','Run-01');
const risk=object('A02','risk','风险与限制','risk-tray','Run-02');
const evidence=object('A03','evidence','来源核对','evidence-tray','Run-03');
const synthesis=object('A04','synthesis','综合研究稿','synthesis-out','Run-04',{inputs:['A01','A02','A03']});
const revision=object('R01','review','修改要求','coordination','Run-05',{state:'request-revision',inputs:['A04'],issues:['收入占比缺少跨期口径说明'],limitations:['来源仅限固定快照']});
const repairTask={id:'DEMO-T02',title:'补充收入占比口径说明',snapshot:TASK.snapshot,parentTask:TASK.id,reviewId:'R01',input:'A04',state:'queued'};
const repair=object('A05','research','修复草稿','research-tray','Run-06',{taskId:repairTask.id,state:'checkpointed',supersedes:'A04',inputs:['A04','R01'],digest:'demo-A05-checkpoint-1'});
const repaired=object('A06','synthesis','修订研究稿','review-tray','Run-07',{taskId:repairTask.id,inputs:['A05'],supersedes:'A04',provider:'codex (concept)'});
const pass=object('R02','review','复核记录','review-report','Run-08',{state:'pass',inputs:['A06'],limitations:['模型复核；未经人工接纳']});
const memo=object('M01','memo','候选备忘','gate-desk','Run-09',{state:'awaiting-human',inputs:['A06','R02']});
const archived=a=>({...a,slot:a.kind==='review'?'vault-review':a.kind==='snapshot'?'vault-snapshot':a.kind==='memo'?'vault-memo':'vault-research'});
const parts=[research,risk,evidence];
const history=[snapshot,...parts.map(archived),archived(synthesis),archived(revision)];
const closed={state:'closed',label:'尚无待决备忘；AI 不可开启'};
const waiting={state:'waiting',label:'等待人工决定；Reviewer PASS 不构成人工批准'};
function entry(label,headline,caption,power,agents,artifacts,extra={}) {
  const {tasks=[{...TASK,state:label}],humanGate=closed,...rest}=extra;
  return {label,headline,caption,projection:{power,task:tasks[0],tasks,duties:DUTIES,agents,artifacts,humanGate,concept:true,...rest}};
}
export const STORIES={
  DUTY_READY:entry('岗位就绪','岗位先于执行者存在','空工位仍有职责；任务和快照已经固定，尚未指派任何 AgentRun。','dormant',[],[snapshot]),
  PARALLEL_WORK:entry('并行分工','一项任务，三份互补的工作','研究、风险、证据分别处理同一任务的不同部分，共用 DEMO-S01。不是三个相互竞争的答案。','active',[
    run('Run-01','researcher'),run('Run-02','risk'),run('Run-03','evidence')
  ],[snapshot,...parts.map(a=>({...a,state:'forming'}))]),
  SYNTHESIS:entry('产物汇合','把工作组合起来，而非召集聊天','三份独立产物进入综合装配台；输入 ID 保留在综合稿中，原始工作不被覆盖。','active',[run('Run-04','synthesis')],[snapshot,...parts.map((a,i)=>({...a,slot:'synthesis-in-'+i})),synthesis]),
  INDEPENDENT_REVIEW:entry('独立复核','复核的是另一个岗位交付的稿件','综合稿 A04 离开装配台进入复核托盘；独立 Reviewer 可追溯三个输入产物。','active',[run('Run-05','reviewer',TASK.id,'claude-code')],[snapshot,...parts.map(archived),{...synthesis,slot:'review-tray',state:'under-review'}]),
  REVISION_REQUESTED:entry('创建修复任务','修改意见先回协调板','R01 提出修改要求。协调板新建 DEMO-T02 并关联原任务、原稿与复核单；A04 留在历史中。','active',[],[snapshot,...parts.map(archived),archived(synthesis),revision],{tasks:[{...TASK,state:'needs-revision'},repairTask]}),
  REPAIR_RUNNING:entry('执行修复','修复产生新工作，历史保持原样','新 Run-06 领取 DEMO-T02；A05 是独立保存的修复检查点，原稿 A04 和复核单 R01 仍可读取。','active',[run('Run-06','researcher',repairTask.id)],[...history,repair],{tasks:[{...TASK,state:'repairing'},{...repairTask,state:'running'}]}),
  RUN_INTERRUPTED:entry('执行中断','人离开，工作没有离开','Run-06 中断并离场。任务、快照和已保存检查点 A05 全部保留；未提交的输出不凭空出现。','interrupted',[],[...history,repair],{tasks:[{...TASK,state:'repairing'},{...repairTask,state:'paused'}],runs:[{id:'Run-06',state:'interrupted',taskId:repairTask.id}]}),
  WORKER_REPLACED:entry('替换执行者','We replace the worker, not the work.','演示显式重新指派 Run-07（Codex 概念接入），读取相同任务、快照与 A05 检查点。没有自动重跑或重复计费承诺。','active',[run('Run-07','researcher',repairTask.id,'codex (concept)')],[...history,repair],{tasks:[{...TASK,state:'repairing'},{...repairTask,state:'resuming'}],runs:[{id:'Run-06',state:'interrupted',taskId:repairTask.id}]}),
  REPAIR_REVIEW:entry('复核修订稿','新稿有新 ID，旧稿仍可追溯','Run-07 交付 A06；Run-08 独立复核修订稿。A04、R01、A05 留在档案中，形成完整修复链。','active',[run('Run-08','reviewer',repairTask.id,'claude-code')],[...history,archived(repair),{...repaired,state:'under-review'}],{tasks:[{...TASK,state:'reviewing'},{...repairTask,state:'reviewing'}]}),
  HUMAN_DECISION:entry('候选待决','协作完成，决定权仍属于人','R02 的 PASS 是复核结果。候选备忘 M01 到达 Human Gate，停在等待人工决定；本演示不能批准。','active',[],[...history,archived(repair),archived(repaired),pass,memo],{tasks:[{...TASK,state:'awaiting-human'},{...repairTask,state:'complete'}],humanGate:waiting}),
  ORGANIZATION_REMAINS:entry('组织留存','Agents are gone. The work remains.','模型供能已停止，所有执行者离场。两项任务、固定快照、修复历史与候选备忘留存；人工门仍在等待同一个决定。','stand-down',[],[...history,archived(repair),archived(repaired),archived(pass),archived(memo)],{tasks:[{...TASK,state:'awaiting-human'},{...repairTask,state:'complete'}],humanGate:waiting}),
};
export const STORY_ORDER=Object.keys(STORIES);
export const DEFAULT_STORY='PARALLEL_WORK';
function freeze(value){if(value && typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
freeze(STORIES);
export function story(name){if(!Object.hasOwn(STORIES,name))throw Error('UNKNOWN_STORY: '+name);return STORIES[name];}
export const OBJECT_STYLE={
  snapshot:{label:'固定快照',color:'#7e899e'}, research:{label:'研究材料',color:'#648ca4'},
  risk:{label:'风险材料',color:'#b39360'}, evidence:{label:'证据材料',color:'#789980'},
  synthesis:{label:'综合稿',color:'#8c8882'}, review:{label:'复核单',color:'#8b7162'}, memo:{label:'候选备忘',color:'#b89b61'},
};
