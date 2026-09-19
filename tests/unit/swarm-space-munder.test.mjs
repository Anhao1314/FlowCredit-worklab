import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENE_ORDER, scene } from '../../apps/web/swarm-space/fixtures.js';
import { buildLayout, drawWorld, transferPlan, artifactMotion, pickAt, appearedIds, agentPosition } from '../../apps/web/swarm-space/office-scene.js';
import { sceneFrameBufs } from '../../apps/web/swarm-space/vendor/munder-difflin/portrait-art.js';
function recorder() {
  const words=[];
  return { words, ctx:new Proxy({}, { get:(_t,k)=>k==='fillText' ? s=>words.push(s) : ()=>{}, set:()=>true }) };
}
test('Munder renderer preserves all eight projections across animation frames',()=>{
  for(const name of SCENE_ORDER) {
    const projection=scene(name).projection, before=JSON.stringify(projection), layout=buildLayout(projection);
    const a=recorder(),b=recorder();
    drawWorld(a.ctx,{projection,layout,timeMs:0}); drawWorld(b.ctx,{projection,layout,timeMs:9000});
    assert.deepEqual(a.words,b.words,name);
    assert.equal(JSON.stringify(projection),before);
    assert.deepEqual(layout.agents.map(a=>a.id),projection.agents.map(a=>a.id));
    assert.deepEqual(layout.artifacts.map(a=>a.id),projection.artifacts.map(a=>a.id));
  }
});
test('Munder deliveries land at target slots and picking follows the flying artifact',()=>{
  let count=0;
  for(const from of SCENE_ORDER) for(const to of SCENE_ORDER) {
    const old=buildLayout(scene(from).projection), next=buildLayout(scene(to).projection);
    const plan=transferPlan(old,next);
    for(const p of plan) {
      count++;
      const start=artifactMotion([p],0).get(p.id), end=artifactMotion([p],1150).get(p.id);
      assert.equal(start.x,p.from.x); assert.equal(start.y,p.from.y);
      assert.equal(end.x,p.to.x); assert(Math.abs(end.y-p.to.y)<1e-8);
      const motion=artifactMotion([p],575), pos=motion.get(p.id);
      const item=next.artifacts.find(a=>a.id===p.id);
      assert.equal(pickAt({agents:[],artifacts:[item]},pos.x,pos.y-30,motion).id,p.id);
    }
  }
  assert(count>0);
});
test('arrival animation and reduced-motion picking agree with the visible character',()=>{
  const layout=buildLayout(scene('RESEARCH_RUNNING').projection), agent=layout.agents[0];
  const reveal={ids:appearedIds(null,layout),t:.3};
  const moving=agentPosition(agent,reveal);
  assert(moving.walking);
  assert.equal(pickAt({agents:[agent],artifacts:[]},moving.x+20,moving.y+20,new Map(),reveal).id,agent.id);
  assert.equal(agentPosition(agent,reveal,true).x,agent.x);
  assert.equal(agentPosition(agent,{...reveal,t:1}).walking,false);
});
test('stand-down retains work without inventing employees or approval',()=>{
  const projection=scene('STAND_DOWN').projection, layout=buildLayout(projection), r=recorder();
  drawWorld(r.ctx,{projection,layout,timeMs:2000});
  assert.equal(layout.agents.length,0); assert.equal(layout.artifacts.length,4);
  assert(r.words.includes('Agents are gone. The work remains.'));
  assert(r.words.includes('Closed'));
});
test('vendored procedural cast has distinct full-body front/back animation frames',()=>{
  for(const name of ['jim','dwight']) {
    const frames=sceneFrameBufs(name);
    assert.equal(frames.front.length,3); assert.equal(frames.back.length,3);
    assert.equal(frames.front[0].length,18*32*4);
    assert.notDeepEqual(frames.front[0],frames.front[1]);
    assert.notDeepEqual(frames.front[0],frames.back[0]);
  }
});
