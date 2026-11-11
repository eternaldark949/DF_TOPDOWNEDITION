import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameRuntime} from '../src/directory/game-runtime.mjs';
import {gameLevel} from '../src/runtime/game-level.mjs';
import {humanoidPresentation} from '../src/gameplay/animation/humanoid-system.mjs';
import {getHumanoidRigAssets} from '../src/directory/humanoid/rig-assets.mjs';
import {rigPose} from '../src/basement/physics/index.mjs';
class Room extends gameLevel{}
async function ready(){const e=createGameRuntime({schedule_frame:null,actor_policy:{random:()=>.5}});e.registerLevel('a',Room).registerLevel('b',Room);await e.loadLevel('a');e.start();return e;}
const tick=(e,n=1)=>{for(let i=0;i<n;i++)e.updateState();};
test('Directory installs actual humanoid bodies as generic rig clients without extra physical entities',async()=>{
    const e=await ready(),p=e.api.session.player,world=e.api.physics;
    assert.equal(e.api.rigs,world.rigs);assert.ok(e.api.rigs.getRig(p));assert.equal(world.getStatistics().bodies,1);
    const npc=e.api.actors.spawn({kind:'npc',name:'Victoria',position:[200,200],data:{recruited:true}});tick(e);
    assert.ok(e.api.rigs.getRig(npc));assert.equal(world.getStatistics().bodies,2);assert.equal(world.getStatistics().spatial.instances,2);
    const pose=humanoidPresentation(npc);assert.ok(pose.joints.hand_r&&pose.joints.foot_l&&pose.anchors.back);const before=world.savePhysicsState();pose.joints.hand_r.position[0]=999;humanoidPresentation(npc,.5);assert.deepEqual(world.savePhysicsState(),before);e.dispose();
});
test('humanoid movement animates actual travel and render/pauses do not advance the rig',async()=>{
    const e=await ready(),p=e.api.session.player,c=e.api.rigs.getRig(p);e.api.controls.setInput('keyboard','d',true);tick(e,20);
    assert.equal(c.getState().layers.base.clip_id,'walk');assert.ok(c.getState().layers.base.time>0);const before=e.api.physics.savePhysicsState();
    for(let i=0;i<5;i++)e.render(.5);assert.deepEqual(e.api.physics.savePhysicsState(),before);
    const release=e.pause('test');tick(e,10);assert.deepEqual(e.api.physics.savePhysicsState(),before);release();e.dispose();
});
test('a runtime render hook cannot mutate or manually step an owned animation',async()=>{
    const e=await ready(),p=e.api.session.player,c=e.api.rigs.getRig(p),before=e.api.physics.savePhysicsState();let checked=0;
    e.registerSystem('attempt-animation',{render(){for(const fn of [()=>c.play('walk'),()=>c.seek(.4),()=>c.setProceduralPose({}),()=>e.api.rigs.removeRig(p),()=>c.advance(.1)]){assert.throws(fn,/Render hooks/);checked++;}}});
    e.render(.5);assert.equal(checked,5);assert.deepEqual(e.api.physics.savePhysicsState(),before);e.dispose();
});
test('persistent player retains its rig across native level transitions and removed actors release theirs',async()=>{
    const e=await ready(),p=e.api.session.player,c=e.api.rigs.getRig(p),npc=e.api.actors.spawn({kind:'npc',name:'Victoria',position:[200,200]});tick(e);
    const old=e.api.rigs.getRig(npc);await e.loadLevel('b');assert.equal(e.api.rigs.getRig(p),c);assert.ok(npc.destroyed);assert.throws(()=>old.pause());assert.equal(e.api.physics.getStatistics().bodies,1);e.dispose();
});
test('authored body scaling affects physical anchors and the artist can request coordinates relative to its root',()=>{
    const assets=getHumanoidRigAssets('female',{build:'broad',height:1.1}),pose=new rigPose(assets.definition),hand=pose.getAnchor('hand_r');
    assert.ok(hand.position[0]>10);assert.ok(assets.definition.rig_id.includes('broad'));assert.equal(assets.definition.getJointNames().length,16);
    assert.equal(getHumanoidRigAssets('female',{build:'broad',height:1.1}),assets);
});
test('all supported native humanoid actor classes bind the shared generic hierarchy',async()=>{
    const e=await ready(),actors=['ganger','hunter','demoness'].map((kind,i)=>e.api.actors.spawn({kind,position:[2000+i*1000,2000]}));tick(e);
    for(const actor of actors){const rig=e.api.rigs.getRig(actor);assert.ok(rig,actor.entity_type);assert.equal(rig.definition.getJointNames().length,16);assert.ok(rig.getAnchor('hand_l'));}e.dispose();
});
