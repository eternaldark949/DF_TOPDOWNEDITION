'use strict';
const assert=require('node:assert/strict');
const {resolve}=require('node:path');
const {runtime}=require('./test-game-runtime.cjs');
const env=runtime(resolve(__dirname,'../DFAB V8.html'),{affine:true});
const run=source=>structuredClone(env.run(`(()=>{${source}})()`));
env.run("game.story.update=()=>{};game._doLoadMap('apt_949');game.running=true;game.paused=false;game.hud.revealAll();game.furniture.release();");
const result=run(`
 const world=game.physics_system,player=game.player,controller=world.rigs.getRig(player),initial=world.getStatistics().bodies;
 if(!controller)throw Error('Native apartment did not bind the player rig');
 const old={};for(const name of ['stride','strikePose','placeHands','settle']){old[name]=proceduralHumanoid.prototype[name];proceduralHumanoid.prototype[name]=function(...args){if(this.entity.enginePresentation)throw Error('Native actor entered legacy '+name);return old[name].apply(this,args);};}
 try{
  player.setMovement([1,0],{speed:20});for(let i=0;i<4;i++){game.humanoids.beforePhysics();world.updateState();}
  game.draw();const before=JSON.stringify(world.savePhysicsState()),holster=[game.holsterAnim,game._holsterT];
  for(let i=0;i<6;i++)game.draw();
  const packet=game.apartmentRenderer.personPacket(player,.5),artist=proceduralHumanoid.of(packet),anchor=artist.point('hand_r');
  return {same:JSON.stringify(world.savePhysicsState())===before,holsterSame:JSON.stringify([game.holsterAnim,game._holsterT])===JSON.stringify(holster),joints:Object.keys(packet.rigPose.joints).length,bodyCount:world.getStatistics().bodies,initial,anchor:!!anchor.matrix,noVirtual:!anchor.updatePosition,noMuzzle:packet._muzzleLocal==null};
 }finally{for(const [name,fn]of Object.entries(old))proceduralHumanoid.prototype[name]=fn;}
`);
assert.equal(result.same,true);assert.equal(result.holsterSame,true);assert.equal(result.joints,16);assert.equal(result.bodyCount,result.initial);assert.equal(result.anchor,true);assert.equal(result.noVirtual,true);assert.equal(result.noMuzzle,true);
console.log('Passed: playable native humanoid reads Basement poses, preserves physics/holster state, and bypasses legacy joint stages.');
