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
