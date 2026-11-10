import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { resolve } from 'node:path';
import { bundleNative } from './bundle-native.mjs';
const root=resolve(import.meta.dirname,'..');
test('the native playable bundle is deterministic, isolated and executes the original engine classes',()=>{
 const source=bundleNative(root,'src/directory/native-entry.mjs');assert.equal(source,bundleNative(root,'src/directory/native-entry.mjs'));
 const context=vm.createContext({structuredClone});vm.runInContext(source,context);
 const result=vm.runInContext(`(()=>{const p=new DFNative.physicsSystem();const e=p.createCharacter();e.setMovement([1,0]);p.updateState();return {entities:p.getStatistics().entities,x:e.position[0],tick:p.simulation_tick};})()`,context);
 assert.equal(result.entities,1);assert.ok(result.x>0);assert.equal(result.tick,1);
 assert.equal(vm.runInContext('typeof document',context),'undefined');
});
test('the built runtime composes levels and native classes without constructing the legacy GameEngine',async()=>{
 const context=vm.createContext({structuredClone});vm.runInContext(bundleNative(root,'src/directory/native-entry.mjs'),context);
 const result=await vm.runInContext(`(async()=>{
  const e=DFNative.createGameRuntime({schedule_frame:null});
  class Room extends DFNative.gameLevel {enter(c){c.createEntity({entity_type:'static',position:[300,0]});}}
  e.registerLevel('a',Room).registerLevel('b',Room);
  const player=e.createEntity({template:'df:player_949',entity_type:'df_player'},{lifetime:'session'}),world=e.api.physics;
  await e.loadLevel('a');e.start();player.setMovement([1,0]);e.updateState();await e.loadLevel('b');
  const result={same:e.api.physics===world&&e.api.elements.fetchEntity(player.entity_id)===player,tick:world.simulation_tick,bodies:world.getStatistics().bodies,legacy:typeof GameEngine};e.dispose();return result;
 })()`,context);
 assert.equal(result.same,true);assert.equal(result.tick,1);assert.equal(result.bodies,2);assert.equal(result.legacy,'undefined');
});
