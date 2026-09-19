// Read-only, explicit organizational story. No network, model or persistence.
import { DESIGN_WIDTH, DESIGN_HEIGHT } from './office-scene.js';
import { STORY_ORDER, DEFAULT_STORY, story, DUTIES } from './organization-story.js';
import { buildLayout, drawWorld, transferPlan, artifactMotion, appearedIds, pickAt } from './organization-scene.js';
import { startGameLoop } from './game-loop.js';
const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search);
document.body.classList.toggle('embedded',params.get('embedded')==='1');
$('platform-return').hidden=params.get('embedded')==='1'||!location.pathname.includes('/swarm-space/');
const canvas=$('stage'),context=canvas.getContext('2d');
const media=matchMedia('(prefers-reduced-motion: reduce)');
let reduced=media.matches,paused=false,currentName,entry,layout={agents:[],artifacts:[],tasks:[],duties:[]},plan=[],motion=new Map(),revealIds=new Set(),revealT=1,elapsed=0,clock=0,hovered=null,selected=null,returnFocus=null;
const subjects=params.get('empty')!=='1';
const dpr=Math.min(2,Math.max(1,devicePixelRatio||1));canvas.width=DESIGN_WIDTH*dpr;canvas.height=DESIGN_HEIGHT*dpr;
const el=(tag,cls,value)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(value!=null)e.textContent=value;return e;};
const roleName=id=>DUTIES.find(d=>d.id===id)?.title??id;
function closeDrawer(){
  if($('drawer').contains(document.activeElement))(returnFocus?.isConnected?returnFocus:$('next-scene')).focus({preventScroll:true});
  $('drawer').inert=true;$('drawer').classList.remove('open');$('drawer').setAttribute('aria-hidden','true');selected=null;
}
function openDrawer(pick){
  const p=entry.projection;let title,facts=[],note='本页为手写设计演示，不代表当前平台运行状态。';
  if(pick.type==='artifact'){
    const a=p.artifacts.find(a=>a.id===pick.id);if(!a)return;
    title=a.title+' · '+a.id;
    facts=[['Task',a.taskId],['Snapshot',a.snapshot],['Producer',a.producer],['Provider',a.provider],['Digest',a.digest+' (mock)'],['State',a.state],['Location',a.slot],['Inputs',(a.inputs??[]).join(', ')||'固定资料'],['Revises',a.supersedes??'—']];
    if(a.issues)facts.push(['Issues',a.issues.join('；')]);if(a.limitations)facts.push(['Limitations',a.limitations.join('；')]);
    note=a.kind==='review'?'复核单是独立产物。PASS 不构成人工批准；修改要求产生关联修复任务，不覆盖原稿。':'产物属于组织。执行者离开或替换后，它的身份、输入和历史仍保留。';
  }else if(pick.type==='agent'){
    const a=p.agents.find(a=>a.id===pick.id);if(!a)return;
    title=roleName(a.role)+' · '+a.id;facts=[['Role',roleName(a.role)],['AgentRun',a.id],['Task',a.taskId],['Snapshot',p.task.snapshot],['Provider',a.provider],['Pose',a.pose]];
    note='AgentRun 是临时执行者，不是持久岗位。Codex 等概念标记不表示平台已经接入该执行器。';
  }else if(pick.type==='duty'){
    const d=DUTIES.find(d=>d.id===pick.id),a=p.agents.find(a=>a.role===d.id);title=d.title+' / '+d.cn;
    facts=[['Duty',d.id],['Purpose',d.purpose],['AgentRun',a?.id??'未指派'],['Provider',a?.provider??'—'],['Persistence','岗位在所有场景中保留']];
    note='研究与复核已有平台岗位；风险、证据、综合分工及并行编排是本轮设计探索。空工位不代表缺失职责。';
  }else if(pick.type==='task'){
    const t=p.tasks.find(t=>t.id===pick.id);if(!t)return;
    title=t.title;facts=[['Task',t.id],['State',t.state],['Snapshot',t.snapshot],['Parent task',t.parentTask??'根任务'],['Review',t.reviewId??'—'],['Input',t.input??'固定快照']];
    note='修复任务有独立 ID，并关联原任务、原稿与复核单。历史不会因重试或换人而消失。';
  }else{
    title='Human Gate';facts=[['State',p.humanGate.state],['Authority','Human only'],['Decision','尚未作出'],['Note',p.humanGate.label]];
    note='本页没有批准操作。停止模型供能不会清除或改变人类决策状态。';
  }
  selected=pick;returnFocus=document.activeElement;
  $('drawer-title').textContent=title;$('drawer-body').replaceChildren(...facts.flatMap(([k,v])=>[el('dt',null,k),el('dd',null,v)]));
  $('drawer-note').textContent=note;$('drawer-stages').replaceChildren();
  $('drawer').inert=false;$('drawer').setAttribute('aria-hidden','false');$('drawer').classList.add('open');$('drawer-close').focus({preventScroll:true});
}
function renderAccessibleObjects(){
  const host=$('object-list');host.replaceChildren();
  const p=entry.projection;
  const picks=[...DUTIES.map(d=>({type:'duty',id:d.id,label:d.title+' / '+d.cn})),...p.tasks.map(t=>({type:'task',id:t.id,label:t.id})),...p.artifacts.map(a=>({type:'artifact',id:a.id,label:a.id+' · '+a.title})),...p.agents.map(a=>({type:'agent',id:a.id,label:roleName(a.role)+' · '+a.id})),{type:'gate',id:'humanGate',label:'Human Gate'}];
  for(const p of picks){const b=el('button',null,p.label);b.type='button';b.onclick=()=>openDrawer(p);host.append(b);}
}
function show(name){
  closeDrawer();currentName=name;entry=story(name);const next=buildLayout(entry.projection);
  plan=reduced?[]:transferPlan(layout,next);revealIds=appearedIds(layout,next);elapsed=0;motion=new Map();revealT=reduced?1:0;layout=next;hovered=null;
  $('scene-name').textContent=entry.label;$('caption').textContent=entry.caption;$('story-title').textContent=entry.headline;
  const p=entry.projection,i=STORY_ORDER.indexOf(name);
  $('story-position').textContent=String(i+1).padStart(2,'0')+' / '+STORY_ORDER.length;
  $('previous-scene').disabled=i===0;$('next-scene').disabled=i===STORY_ORDER.length-1;
  $('status-scene').textContent=entry.label;$('status-agents').textContent=p.agents.length+' 位临时执行者';
  $('status-artifacts').textContent=p.artifacts.length+' 份工作对象';$('status-gate').textContent=p.humanGate.state==='waiting'?'等待人工决定':'关闭';
  document.body.dataset.power=p.power;
  for(const b of document.querySelectorAll('[data-scene]'))b.setAttribute('aria-pressed',String(b.dataset.scene===name));
  const phase=i<=1?0:i===2?1:i===3?2:i<=7?3:i===8?2:i===9?4:5;
  $('flow').replaceChildren(...['并行分工','综合装配','独立复核','关联修复','人工待决','组织留存'].map((label,j)=>{const li=el('li','flow-step',label);li.dataset.tone=j===phase?'active':'pending';if(j===phase)li.setAttribute('aria-current','step');return li;}));
  renderAccessibleObjects();
}
for(const name of STORY_ORDER){const b=el('button',null,story(name).label);b.type='button';b.dataset.scene=name;b.onclick=()=>show(name);$('scenes').append(b);}
$('previous-scene').onclick=()=>show(STORY_ORDER[STORY_ORDER.indexOf(currentName)-1]);
$('next-scene').onclick=()=>show(STORY_ORDER[STORY_ORDER.indexOf(currentName)+1]);
$('restart-story').onclick=()=>show(STORY_ORDER[0]);
$('motion-toggle').onclick=()=>{paused=!paused;$('motion-toggle').textContent=paused?'继续动画':'暂停动画';$('motion-toggle').setAttribute('aria-pressed',String(paused));};
$('dev-toggle').onclick=()=>{const open=$('devpanel').classList.toggle('open');$('dev-toggle').setAttribute('aria-expanded',String(open));};
$('drawer-close').onclick=closeDrawer;
function point(event){const b=canvas.getBoundingClientRect();return{x:(event.clientX-b.left)*DESIGN_WIDTH/b.width,y:(event.clientY-b.top)*DESIGN_HEIGHT/b.height};}
function pick(event){const p=point(event);return pickAt(subjects?layout:{...layout,agents:[],artifacts:[]},p.x,p.y,motion,{ids:revealIds,t:revealT},reduced);}
canvas.addEventListener('pointermove',e=>{hovered=pick(e);canvas.classList.toggle('pickable',!!hovered);});
canvas.addEventListener('pointerleave',()=>{hovered=null;canvas.classList.remove('pickable');});
canvas.addEventListener('click',e=>{const p=pick(e);if(p)openDrawer(p);else closeDrawer();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDrawer();});
media.addEventListener('change',e=>{reduced=e.matches;if(reduced){revealT=1;motion=new Map();}});
// Preserve incoming links from the earlier eight-scene preview.
const aliases={DORMANT:'DUTY_READY',RESEARCH_RUNNING:'PARALLEL_WORK',RESEARCH_COMPLETE:'SYNTHESIS',REVIEW_RUNNING:'INDEPENDENT_REVIEW',NEEDS_ATTENTION:'REVISION_REQUESTED',MEMO_READY:'HUMAN_DECISION',STAND_DOWN:'ORGANIZATION_REMAINS',INTERRUPTED:'RUN_INTERRUPTED'};
const requested=params.get('scene');
show(STORY_ORDER.includes(requested)?requested:aliases[requested]??DEFAULT_STORY);
startGameLoop(canvas,{
  update:dt=>{if(paused)return;clock+=dt*1000;elapsed+=dt*1000;motion=!reduced&&elapsed<1800?artifactMotion(plan,elapsed,1800):new Map();revealT=reduced?1:Math.min(1,elapsed/2200);},
  render:()=>{context.setTransform(dpr,0,0,dpr,0,0);drawWorld(context,{projection:entry.projection,layout,timeMs:clock,reduced,subjects,motion,reveal:{ids:revealIds,t:revealT},hoveredId:hovered?.id,selectedId:selected?.id});},
});
