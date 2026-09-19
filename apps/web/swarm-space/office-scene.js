// FlowCredit adaptation of Munder Difflin's MIT procedural cast and envelope motion.
// See vendor/munder-difflin/README.md for pinned source and license scope.
import { sceneFrameBufs } from './vendor/munder-difflin/portrait-art.js';
import { KIND_STYLE, STATE_LABEL, providerStyle } from './assets.js';
export { SLOTS, VAULT_LABELS, ZONES, artifactFacts, pipelineStages } from './scene.js';
export const DESIGN_WIDTH = 1600;
export const DESIGN_HEIGHT = 900;
const ink = '#302f32', paper = '#f2e8d5', blue = '#648ca4';
const slots = {
  'research-tray': [435, 470], 'review-tray': [820, 470], 'gate-desk': [1120, 540],
  'vault-snapshot': [205, 255], 'vault-research': [440, 255],
  'vault-review': [675, 255], 'vault-memo': [910, 255],
};
export function buildLayout(projection) {
  return {
    agents: projection.agents.map((a) => ({ ...a, x: a.role === 'reviewer' ? 686 : 301, y: 414, w: 54, h: 96 })),
    artifacts: projection.artifacts.map(a => {
      if (!slots[a.slot]) throw Error('UNKNOWN_SLOT: ' + a.slot);
      const [x, y] = slots[a.slot];
      return { ...a, x, y, lift: 0, w: 150, h: 76 };
    }),
  };
}
export function transferPlan(previous, next) {
  const old = new Map((previous?.artifacts ?? []).map(a => [a.id, a]));
  return next.artifacts.filter(a => old.has(a.id) && old.get(a.id).slot !== a.slot)
    .map(a => ({ id: a.id, from: { x: old.get(a.id).x, y: old.get(a.id).y }, to: { x: a.x, y: a.y } }));
}
// Adapted from Munder Difflin MessageEnvelope.ts: eased, lifted delivery arc.
export function artifactMotion(plan, elapsed, duration = 1150) {
  const t = duration <= 0 ? 1 : Math.max(0, Math.min(1, elapsed / duration));
  const e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  return new Map(plan.map(p => [p.id, {
    x: p.from.x + (p.to.x - p.from.x) * e,
    y: p.from.y + (p.to.y - p.from.y) * e - 76 * Math.sin(Math.PI * e), moving: t < 1,
  }]));
}
export const artifactBox = a => ({ x: a.x - 75, y: a.y - 65, w: 150, h: 76 });
export const gateBox = () => ({ x: 1015, y: 390, w: 220, h: 270 });
const inside = (b, x, y) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
export function appearedIds(previous, next) {
  const before = new Set([...(previous?.agents ?? []), ...(previous?.artifacts ?? [])].map(a => a.id));
  return new Set([...next.agents, ...next.artifacts].filter(a => !before.has(a.id)).map(a => a.id));
}
export function agentPosition(a, reveal, reduced = false) {
  if (reduced || !reveal?.ids.has(a.id) || reveal.t >= 1) return { ...a, walking: false };
  const t = Math.max(0, reveal.t);
  const path = [{x: 447, y: 660}, {x: 447, y: 530}, {x:a.x, y:530}, {x:a.x,y:a.y}];
  const lengths = path.slice(1).map((p,i) => Math.hypot(p.x-path[i].x,p.y-path[i].y));
  let distance = t * lengths.reduce((sum,n)=>sum+n,0);
  for (let i=0;i<lengths.length;i++) {
    if (distance <= lengths[i] || i===lengths.length-1) {
      const k=lengths[i] ? distance/lengths[i] : 1;
      return { ...a, x:path[i].x+(path[i+1].x-path[i].x)*k, y:path[i].y+(path[i+1].y-path[i].y)*k, walking:true };
    }
    distance -= lengths[i];
  }
  return { ...a, walking:false };
}
export function pickAt(layout, x, y, motion = new Map(), reveal = null, reduced = false) {
  for (const a of [...layout.artifacts].reverse()) {
    if (inside(artifactBox({ ...a, ...motion.get(a.id) }), x, y)) return { type: 'artifact', id: a.id };
  }
  for (const a of layout.agents) if (inside(agentPosition(a, reveal, reduced), x, y)) return { type: 'agent', id: a.id };
  return inside(gateBox(), x, y) ? { type: 'gate', id: 'humanGate' } : null;
}
function box(c, x, y, w, h, fill, border = null) {
  c.fillStyle = fill; c.fillRect(Math.round(x), Math.round(y), w, h);
  if (border) { c.strokeStyle = border; c.lineWidth = 2; c.strokeRect(Math.round(x) + 1, Math.round(y) + 1, w - 2, h - 2); }
}
function text(c, s, x, y, size = 15, color = ink, align = 'left') {
  c.font = `500 ${size}px "SFMono-Regular", Consolas, monospace`;
  c.textAlign = align; c.fillStyle = color; c.fillText(s, x, y);
}
function plant(c, x, y) {
  box(c, x - 14, y, 28, 22, '#956b52', ink); box(c, x - 18, y - 4, 36, 8, '#b18a65', ink);
  box(c, x - 3, y - 47, 6, 43, '#5d7252');
  for (const [dx, dy, w] of [[-25,-33,24],[3,-45,24],[-20,-58,21],[2,-23,28]]) {
    box(c, x + dx, y + dy, w, 14, '#607c56', '#465b42');
    box(c, x + dx + 4, y + dy + 3, w - 7, 4, '#89a077');
  }
}
function chair(c, x, y) {
  box(c, x-23, y+17, 46, 10, '#302f32'); box(c,x-3,y+4,6,36,'#302f32');
  box(c,x-25,y-34,50,41,'#546a70',ink); box(c,x-20,y-30,40,27,'#799095');
  box(c,x-25,y+3,50,14,'#546a70',ink);
}
function desk(c, x, y, active, time) {
  box(c,x+7,y+78,214,16,'#68605c');
  box(c,x+12,y+30,12,65,'#775d47'); box(c,x+194,y+30,12,65,'#775d47');
  box(c,x,y,220,70,'#ae8661',ink); box(c,x+3,y+3,214,52,'#d8b58b');
  box(c,x+75,y-48,76,52,ink); box(c,x+81,y-42,64,38,active ? '#49737a':'#52605f');
  if(active) for(let i=0;i<4;i++) box(c,x+88,y-35+i*7,21+((i+Math.floor(time/750))%3)*11,2,'#bad0ad');
  box(c,x+105,y+4,12,8,ink); box(c,x+91,y+11,41,5,ink);
  box(c,x+79,y+25,74,14,'#e1dbcc',ink);
  for(let i=0;i<7;i++) box(c,x+85+i*9,y+29,4,3,'#8c8c84');
  box(c,x+23,y+15,22,23,'#e9dccc',ink); box(c,x+43,y+20,7,12,'#e9dccc',ink);
  box(c,x+174,y+12,30,34,'#eee5d5'); box(c,x+179,y+19,20,3,'#aab7b0');
}
const spriteCache = new Map();
function sprite(c, name, frame, x, y, back = false) {
  const key = name + frame + back;
  let surface = spriteCache.get(key);
  const buf = sceneFrameBufs(name)[back ? 'back' : 'front'][frame];
  if (!surface && typeof document !== 'undefined') {
    surface = document.createElement('canvas'); surface.width=18; surface.height=32;
    const ctx = surface.getContext('2d'); const image=ctx.createImageData(18,32); image.data.set(buf); ctx.putImageData(image,0,0);
    spriteCache.set(key,surface);
  }
  if(surface) c.drawImage(surface,x,y,54,96);
  else for(let yy=0;yy<32;yy++) for(let xx=0;xx<18;xx++) {
    const i=(yy*18+xx)*4;
    if(buf[i+3]) box(c,x+xx*3,y+yy*3,3,3,`rgb(${buf[i]},${buf[i+1]},${buf[i+2]})`);
  }
}
function room(c, projection, time) {
  box(c,0,0,1600,900,'#e4dfd2');
  text(c,'FlowCredit Research Office',72,65,25);
  text(c,'A persistent place for research, review and memory.',72,94,14,'#777168');
  // Cut-away office: warm wall, carpet, perimeter shadow and open front.
  box(c,76,150,1184,649,'#b4ad9f'); box(c, 60,138,1184,640,ink);
  box(c,64,142,1176,92,'#d6cfbd'); box(c,64,229,1176,9,'#9d927e');
  box(c,64,238,1176,536,'#aab5ad');
  for(let y=240;y<774;y+=24) for(let x=66;x<1240;x+=24) {
    box(c,x,y,22,22,((x+y)/24|0)%2 ? '#adb8af':'#a7b2aa');
    box(c,x+4,y+8,7,1,'#9ca99f');
  }
  // Tall archive cabinetry remains when agents leave.
  ['Snapshot','Research','Review','Memo'].forEach((s,i)=>{
    const x=116+i*235;
    box(c,x,176,184,136,'#817666',ink); box(c,x+5,181,174,35,'#a39780');
    box(c,x+5,219,174,86,'#b5ab95');
    box(c,x+13,246,158,3,'#918773'); box(c,x+76,278,26,4,ink);
    box(c,x+13,285,158,2,'#918773'); box(c,x+76,233,26,4,ink);
    box(c,x+12,185,160,3,'#c7bda9');
    box(c,x+23,292,7,18,'#554c41'); box(c,x+151,292,7,18,'#554c41');
    text(c,s,x+92,204,16,ink,'center');
  });
  text(c,'MEMORY ARCHIVE',115,164,12,'#655a4e');
  // Server cabinet, no simulated agent activity.
  box(c,1072,173,104,143,'#535d5c',ink);
  for(let i=0;i<4;i++) { box(c,1080,182+i*29,88,22,'#3c4948'); box(c,1151,189+i*29,6,6,projection.power==='active'?'#a4c2a0':'#777d73'); }
  text(c,'Model power',1123,339,14,ink,'center');
  text(c,projection.power==='active'?'ACTIVE':'OFFLINE',1123,358,11,'#676b60','center');
  // Area rugs and division walls; the foreground corridor is open.
  box(c,127,371,403,228,'#8b9f9d'); box(c,512,371,403,228,'#96a58f');
  box(c,987,377,228,281,'#c5b48b', '#a38e67');
  text(c,'Research lab',155,365,19,'#415c67'); text(c,'Review room',550,365,19,'#4c6652');
  text(c,'Human gate',1097,406,18,ink,'center');
  const research=projection.agents.some(a=>a.role==='researcher' && a.pose==='working');
  const review=projection.agents.some(a=>a.role==='reviewer' && a.pose==='working');
  chair(c,328,476); chair(c,713,476);
  desk(c,216,479,research,time); desk(c,601,479,review,time);
  // Pinboards, reading lamps and files are static furniture, never research facts.
  for (const x of [161, 548]) {
    box(c,x,393,96,53,'#846f55',ink); box(c,x+4,397,88,45,'#c6b798');
    for(let i=0;i<3;i++) { box(c,x+11+i*25,405,19,27,'#e8dec6'); box(c,x+17+i*25,408,3,3,'#9d6454'); }
  }
  // Unstaffed workstations are visibly empty, never invented agents.
  desk(c,155,668,false,0); desk(c,585,668,false,0);
  for (const x of [155,585]) {
    box(c,x+178,653,5,34,'#53686a'); box(c,x+164,648,34,9,'#6a8581',ink);
    box(c,x+169,684,28,5,'#53686a');
  }
  chair(c,266,652); chair(c,696,652);
  text(c,'Unassigned',455,726,12,'#637169','center');
  box(c,1038,502,165,68,'#a98462',ink); box(c,1042,506,157,49,'#e0bd91');
  chair(c,1120,458);
  box(c,1050,607,145,29,'#f3e6c8', '#a58b59');
  text(c,projection.humanGate.state==='waiting'?'Awaiting human':'Closed',1122,626,14,ink,'center');
  plant(c,109,348); plant(c,955,565); plant(c,1209,733);
  // Corridor and entrance.
  box(c,93,606,863,28,'#bfc7b9');
  text(c,'RESEARCH  →  REVIEW  →  HUMAN DECISION',520,625,12,'#637167','center');
  box(c,407,757,135,19,'#d7c7aa');
  text(c,'Entrance',474,813,13,'#7d756b','center');
  text(c,'Artwork & animation adapted from Munder Difflin · MIT',72,865,13,'#837b6f');
}
function artifact(c,a,motion,active) {
  const p=motion?.get(a.id) ?? a;
  const style=KIND_STYLE[a.kind]; const x=p.x-75,y=p.y-65;
  if(active) box(c,x-5,y-5,160,86,'#f4d35e');
  box(c,x+5,y+6,150,70,'#706d5f');
  box(c,x,y,150,66,p.moving?'#f2dfb0':paper,ink);
  box(c,x+3,y+3,7,60,style?.color ?? blue);
  text(c,style?.short ?? a.kind,x+19,y+23,15);
  text(c,a.id,x+19,y+42,12,'#5d6057');
  text(c,STATE_LABEL[a.state] ?? a.state,p.x,p.y+20,11,'#414c43','center');
}
export function drawWorld(c,{projection,layout,timeMs,reduced=false,subjects=true,motion=null,hoveredId=null,selectedId=null,reveal=null}) {
  c.save(); c.imageSmoothingEnabled=false;
  const t=reduced?0:timeMs;
  room(c,projection,t);
  if(subjects) {
    for(const entry of layout.agents) {
      const a=agentPosition(entry,reveal,reduced);
      const active=a.pose==='working', frame=(active||a.walking)&&!reduced?[0,1,2,1][Math.floor(t/280)%4]:0;
      if(a.id===hoveredId||a.id===selectedId) box(c,a.x-6,a.y-6,a.w+12,a.h+12,'#f4d35e');
      // Upstream procedural bodies and alternating walk frames; seated legs are hidden by desk.
      sprite(c,a.role==='reviewer'?'dwight':'jim',frame,a.x,a.y,a.walking);
      if(!a.walking) box(c,a.x-5,a.y+72,64,26,'#cdae87');
      if(active && !a.walking) {
        const dy=reduced?0:Math.floor(t/180)%2*3;
        box(c,a.x+7,a.y+72+dy,12,6,'#f7c9aa'); box(c,a.x+35,a.y+75-dy,12,6,'#f7c9aa');
      }
      text(c,a.role==='reviewer'?'Reviewer':'Researcher',a.x+27,a.y-29,15,ink,'center');
      text(c,a.pose,a.x+27,a.y-10,12,'#4a615c','center');
      box(c,a.x+7,a.y+109,40,4,providerStyle(a.provider).color);
    }
    for(const a of layout.artifacts) artifact(c,a,motion,a.id===hoveredId||a.id===selectedId);
  }
  if(projection.power==='stand-down') {
    box(c,244,592,735,55,paper,ink);
    text(c,'Agents are gone. The work remains.',611,626,24,ink,'center');
  }
  c.restore();
}

export { box, text, plant, chair, desk, sprite };
