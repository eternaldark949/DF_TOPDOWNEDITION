import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { playerVitals } from '../src/game/mechanics/player-vitals.mjs';
const step=(v,n)=>{for(let i=0;i<n;i++)v.advance(1/60);};

test('vitals reference the owner data and never retain a second health/energy value',()=>{
 const data={},v=new playerVitals(data);assert.equal(v.health,100);v.damage(40,5);assert.equal(data.health,60);data.health=25;assert.equal(v.health,25);
 v.setMaximumHealth(20);assert.equal(data.health,20);assert.equal(v.max_health,20);v.setMaximumAttunement(50);assert.equal(v.attunement,50);
 v.beginFlit(40,.25,6);assert.equal(v.attunement,10);assert.equal(data.player_state.attunement,10);assert.equal(v.last_flit_at,6);assert.equal(v.last_hurt_at,5);
});
test('all health and energy mutations validate before changing their records',()=>{
 const v=new playerVitals(),before=v.snapshot();
 for(const request of [()=>v.damage(-1),()=>v.damage(10,Infinity),()=>v.heal(NaN),()=>v.setHealth(Infinity),()=>v.setMaximumHealth(0),()=>v.setAttunement(-1),()=>v.setMaximumAttunement(NaN),()=>v.beginFlit(999),()=>v.beginFlit(40,Infinity)])assert.throws(request);
 assert.deepEqual(v.snapshot(),before);v.damage(200);assert.equal(v.health,0);assert.equal(v.heal(100),0);v.restoreHealth();assert.equal(v.health,100);
});
test('one quarter-second protection and seconds-based recharge have exact fixed-step boundaries',()=>{
 const v=new playerVitals();v.beginFlit(40);step(v,14);assert.equal(v.flitting,true);step(v,1);assert.equal(v.flitting,false);assert.equal(v.attunement,110);step(v,5);assert.equal(v.attunement,120);
});
test('recovery preserves the production ten-second threshold and damage restarts its clock',()=>{
 const v=new playerVitals();v.damage(50);step(v,599);assert.equal(v.health,50);step(v,1);assert.equal(v.health,55);step(v,60);assert.equal(v.health,60);
 v.damage(5);step(v,599);assert.equal(v.health,55);step(v,1);assert.equal(v.health,60);
});
test('vitals persist protection, recovery delay, upgraded capacity and combat timestamps',()=>{
 const v=new playerVitals();v.setMaximumHealth(160);v.restoreHealth();v.setMaximumAttunement(200);v.setAttunement(180);v.damage(25,10);v.makeInvulnerable(1);v.beginFlit(40,.25,11);step(v,5);
 const copy=new playerVitals();copy.load(JSON.parse(JSON.stringify(v.snapshot())));assert.deepEqual(copy.snapshot(),v.snapshot());assert.equal(copy.max_attunement,200);assert.equal(copy.flitting,true);assert.equal(copy.last_hurt_at,10);
});
test('corrupt snapshots reject atomically and old native version-one fields receive additive defaults',()=>{
 const v=new playerVitals(),before=v.snapshot();for(const snapshot of [{},{health:10,max_health:100,player_state:null},{...before,health:-1},{...before,player_state:{...before.player_state,attunement:999}}]){assert.throws(()=>v.load(snapshot));assert.deepEqual(v.snapshot(),before);}
 const old=v.snapshot();for(const key of ['max_attunement','elapsed_seconds','last_hurt_at','last_flit_at'])delete old.player_state[key];v.load(old);assert.equal(v.max_attunement,120);assert.equal(v.last_flit_at,-99);
});
test('new-game reset clears all run-specific health/ability records while keeping the same component',()=>{
 const v=new playerVitals();v.setMaximumHealth(180);v.setMaximumAttunement(300);v.damage(25,9);v.beginFlit(30,.25,10);v.state.buffs.tea={remaining:3,modifiers:{}};v.reset();assert.deepEqual(v.snapshot(),new playerVitals().snapshot());
});
test('production sources contain no retired host ledgers or health synchronization API',()=>{
 const root=fileURLToPath(new URL('../src/',import.meta.url));
 const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(resolve(dir,entry.name)):/\.(?:js|mjs)$/.test(entry.name)?[resolve(dir,entry.name)]:[]);
 for(const path of walk(root))assert.doesNotMatch(readFileSync(path,'utf8'),/\b(?:playerHealth|maxPlayerHealth|healthRegenTimer|flitState|syncHealth)\b/,path);
 const source=readFileSync(new URL('../src/game/mechanics/player-vitals.mjs',import.meta.url),'utf8');assert.doesNotMatch(source,/physicsSystem|spatialGrid|CollisionSystem|Math\.(?:atan2|hypot|cos|sin)|document\.|window\./);
});
