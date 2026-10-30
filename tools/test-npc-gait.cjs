#!/usr/bin/env node
'use strict';
// Gait after a scripted walk (core/utils.js syncHumanoidGait): a Walker.goTo walk (an NPC back to its post,
// engine/npc-posts.js) commands the gait; once it ends, a shove must still swing the legs.
const assert=require('node:assert/strict');
const {join}=require('node:path');
const {runtime}=require('./test-game-runtime.cjs');
const e=runtime(join(__dirname,'..','DFAB V8.html'),{affine:true});
const r=structuredClone(e.run(`(()=>{
 const n={x:100,y:100,angle:0,_reflectionProxy:true};syncHumanoidGait(n);
 const step=(vx,cmd)=>{_simTick++;if(cmd)gaitCommand(n,vx,0);n.x+=vx;return syncHumanoidGait(n).speed;};
 let shove1=0;for(let i=0;i<30;i++)shove1=step(1.2,false);          // shoved, never walked: legs move
 for(let i=0;i<30;i++)step(1.2,true);                               // walks back
 for(let i=0;i<30;i++)step(0,false);                                // stands at the post
 let shove2=0;for(let i=0;i<30;i++)shove2=step(1.2,false);          // shoved again
 return {shove1,shove2,phase:n.walkPhase};
})()`));
assert.ok(r.shove1>0.5,'first shove animates');
assert.ok(r.shove2>0.5,`a shove after a walk animates too (speed ${r.shove2})`);
assert.deepEqual(e.errors,[]);
console.log('test-npc-gait: 1 passed');
