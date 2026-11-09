#!/usr/bin/env node
'use strict';
// Lane runners (traffic/lane-runner.js): most AI cars ride their rails, none overlap, and the slide through turns
// (which lays the tyre marks) stays where the full driver had it. One seeded run of the city map.
const assert = require('node:assert/strict');
const {join} = require('node:path');
const {runtime} = require('./test-game-runtime.cjs');
const env = runtime(join(__dirname, '..', 'DFAB V8.html'));
const r = structuredClone(env.run(`(()=>{
  game.story.update=()=>{}; game._doLoadMap('sdc'); game.running=true; game.paused=false;
  Math.random=(()=>{let s=999;return()=>((s=(s*16807)%2147483647)/2147483647);})();
  GameSettings.getMaxTraffic=()=>32;
  for(let i=0;i<1200;i++){frame_clock.advanceTick();game.stepWorld();}
  const box=v=>({c:Math.cos(v.angle),s:Math.sin(v.angle),x:v.x,y:v.y,h:v.length/2,w:v.width/2});
  const apart=(a,b)=>{for(const [ax,ay] of [[a.c,a.s],[-a.s,a.c],[b.c,b.s],[-b.s,b.c]]){
    const pa=Math.abs(a.h*(a.c*ax+a.s*ay))+Math.abs(a.w*(-a.s*ax+a.c*ay)), pb=Math.abs(b.h*(b.c*ax+b.s*ay))+Math.abs(b.w*(-b.s*ax+b.c*ay));
    if(Math.abs((b.x-a.x)*ax+(b.y-a.y)*ay)>pa+pb-2)return true;}return false;};
  let n=0,runners=0,overlaps=0;const turn={left:[0,0],right:[0,0]};
  for(let i=0;i<3000;i++){frame_clock.advanceTick();game.stepWorld();
    const vs=game.traffic.vehicles.filter(v=>v.controlMode==='AI'&&!v.dead&&!v.fading);
    for(const v of vs){n++;if(v.runner)runners++;const t=v.currentTurnPath&&turn[v.currentTurnPath.turnType];
      if(t){t[0]++;t[1]+=Math.abs((v.vx||0)*-Math.sin(v.angle)+(v.vy||0)*Math.cos(v.angle));}}
    if(i%5===0)for(let a=0;a<vs.length;a++)for(let b=a+1;b<vs.length;b++)
      if(Math.hypot(vs[a].x-vs[b].x,vs[a].y-vs[b].y)<80&&!apart(box(vs[a]),box(vs[b])))overlaps++;}
  return {share:runners/n,overlaps,left:turn.left[1]/turn.left[0],right:turn.right[1]/turn.right[0]};})()`));
assert.deepEqual(env.errors, []);
assert.ok(r.share > 0.7, `runner share ${r.share}`);
assert.equal(r.overlaps, 0, 'AI cars overlapping');
// the full driver: left turns about 1.3 px/tick sideways, right turns about 0.45
assert.ok(r.left > 0.9 && r.left < 1.7, `left-turn slide ${r.left}`);
assert.ok(r.right > 0.3 && r.right < 0.7, `right-turn slide ${r.right}`);
console.log(JSON.stringify({passed: 1, ...r}));
