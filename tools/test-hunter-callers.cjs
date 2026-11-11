'use strict';
const assert=require('node:assert/strict');
const {resolve}=require('node:path');
const {runtime}=require('./test-game-runtime.cjs');
const env=runtime(resolve(__dirname,'../DFAB V8.html'),{affine:true});
const run=source=>structuredClone(env.run(`(()=>{${source}})()`));let passed=0;
const check=(name,source,verify)=>{verify(run(source));passed++;console.log('Passed: '+name);};
check('classic Hunter appearance uses the exported Directory authoring while its body remains classic',`
 const hunter=new Hunter(20,20,{alpha:true});try{return {classic:hunter instanceof ActorEntity,native:hunter instanceof DFNative.Hunter,build:hunter.look.build,eyes:hunter.look.eyeColor,trim:hunter.look.top.trim};}finally{hunter.destroy();}`,r=>assert.deepEqual(r,{classic:true,native:false,build:'broad',eyes:'#ff5a1a',trim:'#e3a64a'}));
env.run("game.story.update=()=>{};game._doLoadMap('apt_949');game.running=true;game.paused=false;game.hud.revealAll();game.furniture.release();");
check('playable apartment service can construct and restore an actual Hunter without a legacy surrogate',`
 const hunter=game.actors.spawn({kind:'hunter',position:[300,300],data:{alpha:true}});hunter.hunter_state.dash_remaining=2;hunter.hunter_state.chain=1;const snapshot=game.activeLevel.saveState(),id=hunter.entity_id,level=new DFNative.ApartmentLevel({game_db:GAME_DB});try{level.loadState(snapshot);const restored=level.physics.elements.fetchEntity(id);return {native:hunter instanceof DFNative.Hunter,restored:restored instanceof DFNative.Hunter,chain:restored.hunter_state.chain,cooldown:restored.hunter_state.dash_remaining,legacy:GameEntity.registry.all.length,registered:game.actors.getActors().includes(hunter)};}finally{level.destroy();hunter.destroy();}`,r=>assert.deepEqual(r,{native:true,restored:true,chain:1,cooldown:2,legacy:0,registered:true}));
check('player can learn/select claw and keep the choice through the actual save/load caller',`
 game.abilities.getLoadout(game.player).learnAbility('hunter_claw');game.attacks.selectAttack(game.player,'ability:hunter_claw');game.saveGame({auto:true});const loaded=game.loadGame(AUTOSAVE_KEY);return {loaded,known:game.abilities.getLoadout(game.player).hasAbility('hunter_claw'),selected:game.attacks.getSelectedAttack(game.player).attack_id};`,r=>assert.deepEqual(r,{loaded:true,known:true,selected:'ability:hunter_claw'}));
assert.deepEqual(env.errors,[]);console.log(JSON.stringify({passed}));
