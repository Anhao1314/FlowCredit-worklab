// The office is a read-only projection. Motion interpolates explicit scene changes only.
import { box, text, plant, chair, desk, sprite, artifactMotion as envelopeMotion } from './office-scene.js';
import { DUTIES, OBJECT_STYLE } from './organization-story.js';
export { transferPlan, appearedIds } from './office-scene.js';
export const artifactMotion = envelopeMotion;
const ink='#302f32', paper='#f2e8d5';
const points={
  'research-tray':[359,482], 'risk-tray':[639,482], 'evidence-tray':[359,728],
  'synthesis-out':[641,781], 'review-tray':[946,567], 'review-report':[946,642],
  'gate-desk':[1123,571], coordination:[1426,638],
  'synthesis-in-0':[502,714], 'synthesis-in-1':[573,714], 'synthesis-in-2':[644,714],
};
const columns={'vault-snapshot':205,'vault-research':440,'vault-review':675,'vault-memo':910};
export const gateBox=()=>({x:1020,y:401,w:211,h:299});
export function artifactBox(a){return{x:a.x-a.w/2,y:a.y-a.h,w:a.w,h:a.h};}
export function buildLayout(p){
  const counts={};
  return {
    agents:p.agents.map(a=>{const d=DUTIES.find(d=>d.id===a.role);if(!d)throw Error('UNKNOWN_DUTY');return{...a,x:d.x+84,y:d.y-67,w:54,h:96};}),
    artifacts:p.artifacts.map(a=>{
      if(a.slot.startsWith('vault-')){
        if(!(a.slot in columns))throw Error('UNKNOWN_SLOT');
        const i=counts[a.slot]??0;counts[a.slot]=i+1;
        return{...a,x:columns[a.slot]-42+(i%2)*84,y:236+Math.floor(i/2)*31,w:76,h:25,archived:true};
      }
      const pt=points[a.slot];if(!pt)throw Error('UNKNOWN_SLOT: '+a.slot);
      return{...a,x:pt[0],y:pt[1],w:a.slot.startsWith('synthesis-in')?58:114,h:a.slot.startsWith('synthesis-in')?39:59};
    }),
    duties:DUTIES.map(d=>({...d,x:d.x,y:d.y-116,w:220,h:212})),
    tasks:p.tasks.map((t,i)=>({...t,x:1290,y:329+i*100,w:255,h:80})),
  };
}
export function agentPosition(a,reveal,reduced=false){
  if(reduced||!reveal?.ids.has(a.id)||reveal.t>=1)return{...a,walking:false};
  const t=Math.max(0,reveal.t), corridor=a.y>500?752:528;
  const path=[{x:396,y:752},{x:a.x,y:752},{x:a.x,y:corridor},{x:a.x,y:a.y}];
  const lens=path.slice(1).map((p,i)=>Math.hypot(p.x-path[i].x,p.y-path[i].y));
  let distance=t*lens.reduce((a,b)=>a+b,0);
  for(let i=0;i<lens.length;i++){
    if(distance<=lens[i]||i===lens.length-1){const k=lens[i]?distance/lens[i]:1;return{...a,x:path[i].x+(path[i+1].x-path[i].x)*k,y:path[i].y+(path[i+1].y-path[i].y)*k,walking:true};}
    distance-=lens[i];
  }
  return{...a,walking:false};
}
const inside=(b,x,y)=>x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h;
export function pickAt(layout,x,y,motion=new Map(),reveal=null,reduced=false){
  for(const a of [...layout.artifacts].reverse())if(inside(artifactBox({...a,...motion.get(a.id)}),x,y))return{type:'artifact',id:a.id};
  for(const a of layout.agents)if(inside(agentPosition(a,reveal,reduced),x,y))return{type:'agent',id:a.id};
  for(const t of layout.tasks)if(inside(t,x,y))return{type:'task',id:t.id};
  if(inside(gateBox(),x,y))return{type:'gate',id:'humanGate'};
  for(const d of layout.duties)if(inside(d,x,y))return{type:'duty',id:d.id};
  return null;
}
function route(c,from,to,color){
  c.strokeStyle=color;c.lineWidth=2;c.beginPath();c.moveTo(from[0],from[1]);c.lineTo(to[0],from[1]);c.lineTo(to[0],to[1]);c.stroke();
  box(c,to[0]-3,to[1]-3,6,6,color);
}
function shell(c,p,layout,time){
  box(c,0,0,1600,900,'#e4dfd2');
  text(c,'FlowCredit Research Office',65,53,24);
  text(c,'Persistent duties. Temporary workers.',65,80,14,'#686459');
  box(c,72,134,1176,690,'#b4ad9f');box(c,60,122,1180,688,ink);
  box(c,64,126,1172,183,'#d6cfbd');box(c,64,304,1172,8,'#9d927e');
  box(c,64,312,1172,494,'#aab5ad');
  for(let y=314;y<805;y+=24)for(let x=66;x<1234;x+=24){box(c,x,y,22,22,'#adb8af');box(c,x+4,y+8,7,1,'#9ca99f');}
  text(c,'MEMORY ARCHIVE / 组织记忆',115,150,14,'#655a4e');
  ['Snapshots','Work history','Review history','Candidate memos'].forEach((s,i)=>{
    const x=116+i*235;box(c,x,162,184,136,'#817666',ink);box(c,x+5,167,174,32,'#a39780');box(c,x+5,202,174,90,'#b5ab95');
    text(c,s,x+92,189,13,ink,'center');
    for(let row=0;row<3;row++){box(c,x+9,229+row*30,166,2,'#918773');}
  });
  box(c,1076,162,100,100,'#535d5c',ink);
  for(let i=0;i<3;i++){box(c,1084,170+i*28,84,22,'#3c4948');box(c,1152,177+i*28,6,6,p.power==='active'?'#b3c7a4':'#6e7970');}
  text(c,'Model power',1127,280,14,ink,'center');
  text(c,p.power==='active'?'ON · inference only':'OFF · work retained',1127,298,10,'#59644f','center');
  // Shared research floor, distinct review room and human authority boundary.
  box(c,107,350,577,189,'#8b9f9d');box(c,107,584,280,194,'#a0b29c');box(c,407,584,278,194,'#b7b49f');
  box(c,729,383,280,329,'#97a88f');box(c,729,383,7,329,'#697f6d');
  box(c,1024,387,195,327,'#c5b48b','#a38e67');
  text(c,'RESEARCH LAB / 同一任务 · 并行分工',128,335,15,'#415c67');
  text(c,'REVIEW ROOM',751,367,15,'#4c6652');
  text(c,'Human gate',1121,410,17,ink,'center');
  // The handoff lane is persistent furniture; objects move only on scene transitions.
  route(c,[367,555],[708,555],'#7b9084');route(c,[708,555],[708,752],'#7b9084');route(c,[708,555],[1007,555],'#7b9084');
  text(c,'产物交接 / Work handoff',460,570,12,'#536b5b','center');
  for(const d of DUTIES){
    const agent=p.agents.find(a=>a.role===d.id);const live=agent?.pose==='working'&&p.power==='active';
    if(d.id==='synthesis'){
      box(c,d.x,d.y,235,75,'#ae8661',ink);box(c,d.x+4,d.y+4,227,58,'#d8b58b');
      box(c,d.x+12,d.y+64,12,30,'#775d47');box(c,d.x+211,d.y+64,12,30,'#775d47');
      text(c,'输入 → 综合稿',d.x+100,d.y+23,13,'#725c44','center');
    }else desk(c,d.x,d.y,live,time);
    chair(c,d.x+111,d.y-1);
    box(c,d.x,d.y-115,220,27,'#ede5d0','#8c8b74');
    text(c,d.title+' / '+d.cn,d.x+10,d.y-96,14);
    text(c,agent?'已指派 · '+agent.id:'岗位保留 · 待指派',d.x+10,d.y+111,12,'#475b4c');
    if(agent){box(c,d.x+10,d.y+120,5,5,agent.provider.startsWith('codex')?'#927f99':'#728e91');text(c,agent.provider.startsWith('codex')?'codex · concept':agent.provider,d.x+21,d.y+126,10,'#5c6758');}
  }
  // Human seat never gets an AgentRun or a PASS-to-approval animation.
  chair(c,1121,497);box(c,1042,529,160,69,'#a98462',ink);box(c,1046,533,152,51,'#e0bd91');
  box(c,1035,638,174,44,'#f3e6c8','#a58b59');
  text(c,p.humanGate.state==='waiting'?'Awaiting human':'Closed',1122,660,14,ink,'center');
  text(c,'AI 不可开启',1122,676,11,'#775e37','center');
  // Task records remain on the coordination board, including after stand-down.
  text(c,'Coordination / 协调板',1290,310,15);
  for(const t of layout.tasks){box(c,t.x+3,t.y+4,t.w,t.h,'#bbb39f');box(c,t.x,t.y,t.w,t.h,paper,'#a2957d');text(c,t.id,t.x+12,t.y+23,15);text(c,t.parentTask?'修复任务 ← '+t.parentTask:'共同任务 · 固定 '+t.snapshot,t.x+12,t.y+43,11,'#686459');text(c,t.state,t.x+12,t.y+64,11,'#526c60');}
  if(p.tasks.length>1){text(c,'R01 → 新任务 DEMO-T02',1290,552,12,'#83664b');text(c,'原稿 A04 留在历史中',1290,574,12,'#686459');}
  text(c,'岗位持续存在',1290,666,15);text(c,'人来，人走；工作留存。',1290,690,13,'#686459');
  text(c,'Model is energy,',1290,737,12,'#686459');text(c,'not the system.',1290,755,12,'#686459');
  plant(c,95,791);plant(c,1200,791);
  box(c,398,799,130,11,'#d7c7aa');
  text(c,p.power==='stand-down'?'Agents are gone. The work remains.':'FlowCredit is the organization.',654,853,22,ink,'center');
}
function drawObject(c,a,motion,active){
  const at=motion?.get(a.id)??a;const b=artifactBox({...a,...at});const tone=OBJECT_STYLE[a.kind].color;
  if(active)box(c,b.x-4,b.y-4,b.w+8,b.h+8,'#c9aa62');
  if(a.archived){
    box(c,b.x,b.y,b.w,b.h,paper,'#817564');box(c,b.x+3,b.y+3,5,b.h-6,tone);text(c,a.id,b.x+14,b.y+17,12);
    return;
  }
  box(c,b.x+4,b.y+5,b.w,b.h,'#7b7c69');
  if(a.kind==='snapshot'){
    box(c,b.x,b.y,b.w,b.h,'#d5d8d8',ink);box(c,b.x+b.w/2-2,b.y,4,b.h,'#7e899e');
  }else if(a.kind==='memo'){
    box(c,b.x,b.y,b.w,b.h,'#ead9ac',ink);c.beginPath();c.moveTo(b.x,b.y);c.lineTo(at.x,b.y+24);c.lineTo(b.x+b.w,b.y);c.strokeStyle='#8c7650';c.stroke();
  }else if(a.kind==='review'){
    box(c,b.x,b.y,b.w,b.h,'#f2e8d5',ink);box(c,b.x+5,b.y-5,b.w-10,9,'#827b6a',ink);
    box(c,b.x+b.w-31,b.y+12,23,17,a.state==='pass'?'#9aaf8d':'#c39a77');
  }else{
    box(c,b.x,b.y-7,b.w*.45,12,tone,ink);box(c,b.x,b.y,b.w,b.h,'#f2e8d5',ink);box(c,b.x+3,b.y+3,6,b.h-6,tone);
  }
  const compact=b.w<80;
  text(c,a.id,b.x+14,b.y+(compact?24:24),compact?12:15);
  if(!compact)text(c,a.kind==='review'?(a.state==='pass'?'PASS ≠ approval':'REQUEST REVISION'):a.title,b.x+14,b.y+43,a.kind==='review'?9:11,'#625b4d');
}
export function drawWorld(c,{projection:p,layout,timeMs,reduced=false,subjects=true,motion=null,reveal=null,hoveredId=null,selectedId=null}){
  c.save();c.imageSmoothingEnabled=false;const t=reduced?0:timeMs;shell(c,p,layout,t);
  if(subjects){
    for(const original of layout.agents){
      const a=agentPosition(original,reveal,reduced),d=DUTIES.find(d=>d.id===a.role);
      const frame=!reduced&&(a.walking||a.pose==='working')?[0,1,2,1][Math.floor(t/280)%4]:0;
      if(a.id===hoveredId||a.id===selectedId)box(c,a.x-5,a.y-4,64,104,'#c9aa62');
      sprite(c,d.cast,frame,a.x,a.y,a.walking);
      if(!a.walking){box(c,a.x-5,a.y+72,64,26,'#cdae87');const dy=reduced?0:Math.floor(t/180)%2*3;box(c,a.x+7,a.y+72+dy,12,6,'#f7c9aa');box(c,a.x+35,a.y+75-dy,12,6,'#f7c9aa');}
    }
    for(const a of layout.artifacts)drawObject(c,a,motion,a.id===hoveredId||a.id===selectedId);
  }
  c.restore();
}
