#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const {join}=require('node:path');
const {runtime}=require('./test-game-runtime.cjs');
const tests=[];
const value=(e,s)=>structuredClone(e.run(`(()=>{${s}})()`));
function test(name,fn){const e=runtime(join(__dirname,'..','DFAB V8.html'),{affine:true,capture:true});fn(e);assert.deepEqual(e.errors,[]);tests.push(name);}
const setup=`
 game._doLoadMap('ollo_test');game.isDriving=false;game.paused=false;game.hud={has:()=>true};game.keys={};game.joystick={active:false};
 game.useNewCollisionSystem=false;game.roomSystem={active:false,doors:[]};
 game.activeMap={width:1000,height:1000,walls:[],buildings:[],buildingColliders:[]};
 Object.assign(game.player,{x:100,y:100,angle:0,radius:12});
 game.player.buffSystem={getStat:(name,base)=>base};game.augments={isEquipped:()=>false};
 game.resonance={stat:(name,base)=>base,rank:()=>0};_gameTimeSec=10;
 game.flitState={active:true,duration:7,maxDuration:15,attunement:120,maxAttunement:120,dashCost:40,rechargeRate:2,lastFlitAt:9.8};
 game._afterimage={x:30,y:30,until:11};game.flitVFX=[];game._drawnAt=9.8;game._drawShotUsed=true;
 const feedback=[];audioSys.sfx=s=>feedback.push(s);navigator.vibrate=p=>{feedback.push(p);return true;};
`;
test('Rejected landing changes only feedback, preserving charge and existing combat windows',e=>{
 const r=value(e,setup+`
 game.activeMap.walls=[{x:0,y:0,w:300,h:300}];
 const before={position:[game.player.x,game.player.y],flit:{...game.flitState},ghost:{...game._afterimage},draw:game._drawnAt,used:game._drawShotUsed};
 const success=game.triggerFlit(0);
 return {before,after:{position:[game.player.x,game.player.y],flit:{...game.flitState},ghost:{...game._afterimage},draw:game._drawnAt,used:game._drawShotUsed},
 success,cue:{...game._flitFeedback},feedback,vfx:game.flitVFX.length};`);
 assert.equal(r.success,false);assert.deepEqual(r.after,r.before);assert.equal(r.cue.kind,'blocked');assert.equal(r.vfx,0);assert.deepEqual(r.feedback,['knock',[15,35,15]]);
});
test('Short landing still spends normal cost, renews protection and plays the success effect',e=>{
 const r=value(e,setup+`
 game.activeMap.walls=[{x:210,y:50,w:50,h:100}];const success=game.triggerFlit(0);
 return {success,x:game.player.x,cue:game._flitFeedback.kind,cost:120-game.flitState.attunement,duration:game.flitState.duration,last:game.flitState.lastFlitAt,vfx:game.flitVFX.length,audio:feedback.filter(x=>typeof x==='string')};`);
 assert.equal(r.success,true);assert.ok(Math.abs(r.x-198)<1e-5);assert.equal(r.cue,'short');assert.equal(r.cost,40);assert.equal(r.duration,15);assert.equal(r.last,10);assert.equal(r.vfx,1);assert.deepEqual(r.audio,['flit']);
});
test('Clear full-range flits through thin walls clear stale failure and short-landing cues',e=>{
 const r=value(e,setup+`
 game._signalFlitLanding('blocked',0);game.activeMap.walls=[{x:150,y:50,w:14,h:100}];const success=game.triggerFlit(0);
 return {success,x:game.player.x,cue:game._flitFeedback};`);
 assert.deepEqual(r,{success:true,x:220,cue:null});
});
test('Rapid failed retries update direction but throttle sound and honor vibration opt-out',e=>{
 const r=value(e,setup+`
 GameSettings.flitHaptics=false;
 game._signalFlitLanding('blocked',0);_gameTimeSec=10.1;game._signalFlitLanding('blocked',1);
 const cue={...game._flitFeedback};_gameTimeSec=10.41;game._signalFlitLanding('blocked',2);
 GameSettings.applyControls();return {feedback,cue,saved:JSON.parse(localStorage.getItem('dfab_controls')).flitHaptics};`);
 assert.deepEqual(r.feedback,['knock','knock']);assert.equal(r.cue.angle,1);assert.equal(r.cue.at,10.1);assert.equal(r.saved,false);
});
test('Cues render with the ring hidden, clamp edge labels and preserve Canvas state without blur',e=>{
 const r=value(e,setup+`
 GameSettings.flitRing=false;const ctx=game.ctx,labels=[];const fill=ctx.fillText;ctx.fillText=function(text,x,y){labels.push({text,x,y});return fill.call(this,text,x,y);};
 ctx.setTransform(.5,0,0,.5,-49,-49);ctx.globalAlpha=.7;ctx.globalCompositeOperation='source-over';
 const before=ctx.getTransform();game._signalFlitLanding('blocked',Math.PI);game.drawFlitFeedback(ctx);
 const m=ctx.getTransform();return {labels,before:[before.a,before.b,before.c,before.d,before.e,before.f],after:[m.a,m.b,m.c,m.d,m.e,m.f],alpha:ctx.globalAlpha,mode:ctx.globalCompositeOperation};`);
 assert.equal(r.labels[0].text,'FLIT BLOCKED');assert.ok(r.labels[0].x>50&&r.labels[0].y>=15);assert.deepEqual(r.after,r.before);assert.equal(r.alpha,.7);assert.equal(r.mode,'source-over');
 assert.ok(!e.trace.some(a=>a[1]==='set'&&a[2]==='shadowBlur'&&a[3]>0));
});
test('Low-FPS cues persist through several frames, then expire independently of combat state',e=>{
 const r=value(e,setup+`
 let labels=0;game.ctx.fillText=()=>labels++;game._signalFlitLanding('blocked',0);
 for(const age of [.0625,.125,.25,.5,.625]){_gameTimeSec=10+age;game.drawFlitFeedback(game.ctx);}
 _gameTimeSec=10.66;game.drawFlitFeedback(game.ctx);return {labels,cue:game._flitFeedback,duration:game.flitState.duration};`);
 assert.deepEqual(r,{labels:5,cue:null,duration:7});
});
test('Ring results exclude conflicting animations and reset cancels pending old results',e=>{
 const r=value(e,setup+`
 const callbacks=[];requestAnimationFrame=cb=>callbacks.push(cb);
 const ring=game.flitRingEl;ring.classList.add('blocked','pulse');
 game._restartRingAnim('blocked');game._restartRingAnim('flash');callbacks.splice(0).forEach(cb=>cb());
 const latest={flash:ring.classList.contains('flash'),blocked:ring.classList.contains('blocked'),pulse:ring.classList.contains('pulse')};
 game._restartRingAnim('blocked');game._resetFlitFeedback();callbacks.forEach(cb=>cb());
 return {latest,reset:!ring.classList.contains('blocked')&&!ring.classList.contains('flash'),cue:game._flitFeedback};`);
 assert.deepEqual(r,{latest:{flash:true,blocked:false,pulse:false},reset:true,cue:null});
});
test('Map transitions and new games release the cue and failure throttle',e=>{
 const r=value(e,`
 game._signalFlitLanding('blocked',0);game._doLoadMap('apt_949');const map=game._flitFeedback===null&&game._flitBlockedAt===-Infinity;
 game._signalFlitLanding('short',1);game.resetGameState();return {map,reset:game._flitFeedback===null&&game._flitBlockedAt===-Infinity};`);
 assert.deepEqual(r,{map:true,reset:true});
});
console.log(JSON.stringify({passed:tests.length,tests},null,2));
