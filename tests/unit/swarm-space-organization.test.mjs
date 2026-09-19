import test from 'node:test';
import assert from 'node:assert/strict';
import { STORIES, STORY_ORDER, DUTIES, story } from '../../apps/web/swarm-space/organization-story.js';
import { buildLayout, drawWorld, transferPlan, artifactMotion, pickAt, artifactBox, agentPosition } from '../../apps/web/swarm-space/organization-scene.js';
function record(){const words=[];return{words,ctx:new Proxy({}, {get:(_t,k)=>k==='fillText'?s=>words.push(s):()=>{},set:()=>true})};}
test('every organizational fixture is immutable, internally linked and renders without changing its claims',()=>{
  const known=new Set(Object.values(STORIES).flatMap(s=>s.projection.artifacts.map(a=>a.id)));
  for(const name of STORY_ORDER){
    const p=story(name).projection, before=JSON.stringify(p),layout=buildLayout(p),a=record(),b=record();
    drawWorld(a.ctx,{projection:p,layout,timeMs:0});drawWorld(b.ctx,{projection:p,layout,timeMs:9000});
    assert.deepEqual(a.words,b.words,name);assert.equal(JSON.stringify(p),before);assert(Object.isFrozen(p));
    assert.equal(new Set(p.artifacts.map(a=>a.id)).size,p.artifacts.length);
    assert.deepEqual(layout.duties.map(d=>d.id),DUTIES.map(d=>d.id));
    for(const o of p.artifacts){assert(p.tasks.some(t=>t.id===o.taskId));assert.equal(o.snapshot,p.task.snapshot);for(const id of o.inputs??[])assert(known.has(id));}
    for(const a of p.agents)assert(p.tasks.some(t=>t.id===a.taskId));
    assert(['closed','waiting'].includes(p.humanGate.state));
    if(p.power!=='active')assert.equal(p.agents.length,0);
  }
});
test('parallel work shares one task/snapshot, synthesis preserves individual inputs',()=>{
  const p=story('PARALLEL_WORK').projection,s=story('SYNTHESIS').projection;
  assert.equal(new Set(p.agents.map(a=>a.role)).size,3);
  assert.equal(new Set(p.agents.map(a=>a.taskId)).size,1);
  const output=s.artifacts.find(a=>a.id==='A04');assert.deepEqual(output.inputs,['A01','A02','A03']);
  for(const id of output.inputs)assert(s.artifacts.some(a=>a.id===id));
});
test('review requests create a new repair task while the original work remains unchanged',()=>{
  const before=story('INDEPENDENT_REVIEW').projection,after=story('REVISION_REQUESTED').projection;
  const old=before.artifacts.find(a=>a.id==='A04'),retained=after.artifacts.find(a=>a.id==='A04');
  assert.equal(old.digest,retained.digest);assert.equal(retained.slot,'vault-research');
  const repair=after.tasks.find(t=>t.id!==after.task.id);
  assert.equal(repair.parentTask,after.task.id);assert.equal(repair.input,'A04');assert.equal(repair.reviewId,'R01');
  assert.equal(after.artifacts.find(a=>a.id==='R01').slot,'coordination');
});
test('replacement changes the worker, never task identity, snapshot or saved work',()=>{
  const paused=story('RUN_INTERRUPTED').projection,replaced=story('WORKER_REPLACED').projection;
  assert.deepEqual(paused.artifacts,replaced.artifacts);assert.equal(paused.task.id,replaced.task.id);assert.equal(paused.task.snapshot,replaced.task.snapshot);
  assert.equal(paused.agents.length,0);assert.equal(replaced.agents[0].id,'Run-07');assert(replaced.agents[0].provider.includes('concept'));
  assert.equal(replaced.runs[0].id,'Run-06');assert.equal(replaced.runs[0].state,'interrupted');
});
test('stand-down preserves authority and all accumulated work; review PASS never opens gate',()=>{
  const ready=story('HUMAN_DECISION').projection,rest=story('ORGANIZATION_REMAINS').projection;
  assert.deepEqual(rest.humanGate,ready.humanGate);assert.equal(rest.humanGate.state,'waiting');
  assert.deepEqual(rest.tasks,ready.tasks);assert.equal(rest.agents.length,0);
  assert.deepEqual(rest.artifacts.map(a=>[a.id,a.digest]),ready.artifacts.map(a=>[a.id,a.digest]));
  assert(rest.artifacts.every(a=>a.slot.startsWith('vault-')));
});
test('handoffs and moving hit targets use the same geometry and end at their actual slot',()=>{
  for(let i=1;i<STORY_ORDER.length;i++){
    const before=buildLayout(story(STORY_ORDER[i-1]).projection),after=buildLayout(story(STORY_ORDER[i]).projection),plan=transferPlan(before,after);
    for(const p of plan){const m=artifactMotion([p],900,1800),pos=m.get(p.id),obj=after.artifacts.find(a=>a.id===p.id);
      const hit=pickAt({...after,artifacts:[obj],agents:[]},pos.x,pos.y-obj.h/2,m);assert.equal(hit.id,obj.id);
      const end=artifactMotion([p],1800,1800).get(p.id);assert.equal(end.x,obj.x);assert(Math.abs(end.y-obj.y)<1e-8);
    }
    for(const a of after.agents){assert.equal(agentPosition(a,{ids:new Set([a.id]),t:0},true).x,a.x);}
    for(const a of after.artifacts){const b=artifactBox(a);assert(b.x>=0&&b.y>=0&&b.x+b.w<=1600&&b.y+b.h<=900);}
  }
});
