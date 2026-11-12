import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gameEngine } from '../src/engine/lobby/runtime/game-engine.mjs';
import { gameLevel } from '../src/engine/lobby/runtime/game-level.mjs';
import { createGameRuntime } from '../src/game/boot/game-runtime.mjs';

const runtime = options => new gameEngine({ schedule_frame:null, ...options });
class Room extends gameLevel {
    enter(context, prepared) {
        this.context=context;this.options=prepared;
        this.wall=context.createEntity({entity_type:'static',position:[200,0],collision_shape:{shape_type:'box',dimensions:[10,100]}});
    }
}
async function ready(options) { const e=runtime(options);e.registerLevel('one',Room).registerLevel('two',Room);await e.loadLevel('one');return e; }

test('new runtime exposes canonical native APIs and prevents any other owner stepping its world',async()=>{
 const e=await ready(),world=e.physics_system;
 assert.equal(e.api.physics,world);assert.equal(e.api.elements,world.elements);assert.equal(e.api.assets,world.elements.asset_library);
 assert.equal(e.api.motion,world.motion);assert.equal(e.api.traffic,world.traffic);assert.ok(Object.isFrozen(e.api));
 assert.throws(()=>{e.physics_system={};},TypeError);assert.throws(()=>world.updateState(),/owning runtime/);
 assert.equal(e.updateState(),false);e.start();assert.equal(e.updateState(),true);assert.equal(world.simulation_tick,1);
 assert.throws(()=>e.api.elements.world.updateState(),/owning runtime/);assert.equal(world.simulation_tick,1);e.dispose();
});

test('levels share one world/grid and preserve session entity body identity and native motion',async()=>{
 const e=await ready(),world=e.physics_system,grid=world.spatial_grid,old=e.active_level.wall;
 const player=e.createEntity({entity_type:'character',position:[0,0]},{lifetime:'session'}),body=player.body;
 const raw=world.elements.createProp({position:[500,500]}); // Native factories also default to the active level's lifetime.
 e.start();player.setMovement([1,0]);e.updateState();const pose=player.position,tick=world.simulation_tick;
 await e.loadLevel('two',{tag:'next'});
 assert.equal(e.physics_system,world);assert.equal(world.spatial_grid,grid);assert.equal(player.body,body);assert.deepEqual(player.position,pose);
 assert.equal(world.simulation_tick,tick);assert.ok(old.destroyed);assert.ok(raw.destroyed);assert.equal(world.getStatistics().entities,2);
 assert.equal(e.active_level.options.tag,'next');e.updateState();assert.ok(player.position[0]>pose[0]);
 e.unloadLevel();assert.equal(world.getStatistics().entities,1);assert.equal(e.active_level,null);e.dispose();assert.equal(world.getStatistics().bodies,0);
});

test('system hooks have deterministic registration order and exactly one physics step between policy and consequences',async()=>{
 const e=runtime(),trace=[];
 class Ordered extends gameLevel {
  beforePhysics(c){trace.push(`level:before:${c.api.physics.simulation_tick}`);}
  afterPhysics(c){trace.push(`level:after:${c.api.physics.simulation_tick}`);}
  render(c,a){trace.push(`level:render:${a}`);}
 }
 for(const id of ['input','combat'])e.registerSystem(id,{beforePhysics(c){trace.push(`${id}:before:${c.api.physics.simulation_tick}`);},afterPhysics(c){trace.push(`${id}:after:${c.api.physics.simulation_tick}`);},render(c,a){trace.push(`${id}:render:${a}`);}});
 e.registerLevel('ordered',Ordered);await e.loadLevel('ordered');e.start();e.updateState();e.render(.5);
 assert.deepEqual(trace,['input:before:0','combat:before:0','level:before:0','level:after:1','input:after:1','combat:after:1','level:render:0.5','input:render:0.5','combat:render:0.5']);e.dispose();
});

test('pause tokens compose, paused rendering uses current pose, and rendering never advances physics',async()=>{
 const e=await ready();let blend;e.registerSystem('view',{render(c,a){blend=a;c.api.elements.getEntities().forEach(entity=>entity.getRenderState(a));}});
 e.start();const releaseMenu=e.pause('menu'),releaseMap=e.pause('map'),before=e.api.physics.savePhysicsState();
 assert.equal(e.updateState(),false);e.render(.2);assert.equal(blend,1);assert.deepEqual(e.api.physics.savePhysicsState(),before);
 releaseMenu();assert.equal(e.paused,true);releaseMap();releaseMap();assert.equal(e.paused,false);e.updateState();assert.equal(e.api.physics.simulation_tick,1);e.dispose();
});

test('asynchronous preparation leaves the current scene live and failure preserves actual bodies',async()=>{
 const e=await ready();let rejectPreparation;
 class Failed extends gameLevel {prepare(context){assert.deepEqual(Object.keys(context),['assets']);return new Promise((resolve,reject)=>{rejectPreparation=reject;});}}
 e.registerLevel('failed',Failed);const old=e.active_level,body=old.wall.body,load=e.loadLevel('failed');
 await assert.rejects(e.loadLevel('two'),/already in progress/);e.start();e.updateState();assert.equal(e.active_level,old);
 rejectPreparation(Error('asset missing'));await assert.rejects(load,/Failed to load/);assert.equal(e.active_level,old);assert.equal(e.api.physics.fetchBody(body.body_id),body);assert.equal(e.phase,'idle');e.dispose();
});

test('failed entry cleans partial entities and retired contexts, without inventing a fallback world',async()=>{
 const e=await ready();const player=e.createEntity({entity_type:'character'},{lifetime:'session'});let stale;
 class Broken extends gameLevel {enter(c){stale=c;c.createEntity({entity_type:'prop'});c.defer(()=>{});throw Error('failed enter');}}
 e.registerLevel('broken',Broken);await assert.rejects(e.loadLevel('broken'),/Failed to load/);
 assert.equal(e.active_level,null);assert.equal(e.api.physics.getStatistics().entities,1);assert.equal(e.api.elements.fetchEntity(player.entity_id),player);
 assert.throws(()=>stale.createEntity({}),/retired/);await e.loadLevel('two');assert.equal(e.api.physics.getStatistics().entities,2);e.dispose();
});

test('level-owned subscriptions, pending event-time spawns and cleanup callbacks retire at transition',async()=>{
 const e=await ready();let calls=0,cleaned=0;
 const c=e.active_level.context;c.on('contactBegin',()=>{calls++;e.api.elements.createProp({position:[1000,1000]});});c.defer(()=>{cleaned++;});
 c.createEntity({entity_type:'prop',position:[0,0]});c.createEntity({entity_type:'prop',position:[0,0]});e.start();e.updateState();assert.ok(calls>0);
 await e.loadLevel('two');assert.equal(cleaned,1);assert.equal(e.api.physics.getStatistics().entities,1);
 const atTransition=calls;e.createEntity({entity_type:'prop',position:[0,0]});e.createEntity({entity_type:'prop',position:[0,0]});e.updateState();assert.equal(calls,atTransition);
 assert.throws(()=>c.on('contactBegin',()=>{}),/retired/);e.dispose();
});

test('physics callbacks may request a transition but cannot replace a level or recurse into simulation mid-step',async()=>{
 const e=await ready();let load;
 const c=e.active_level.context;c.createEntity({entity_type:'prop'});c.createEntity({entity_type:'prop'});
 c.on('contactBegin',()=>{if(load)return;assert.throws(()=>e.unloadLevel(),/boundary/);assert.throws(()=>e.updateState(),/boundary/);load=e.loadLevel('two');assert.equal(e.active_level.level_id,'one');});
 e.start();e.updateState();assert.equal(e.active_level.level_id,'one');await load;assert.equal(e.active_level.level_id,'two');assert.equal(e.api.physics.simulation_tick,1);e.dispose();
});

test('cleanup failures still retire every body, subscription and system and dispose remains terminal',async()=>{
 const e=await ready();let detached=0;const c=e.active_level.context;c.defer(()=>{throw Error('cleanup failed');});
 e.registerSystem('bad',{detach(){detached++;throw Error('detach failed');}});e.registerSystem('good',{detach(){detached++;}});
 assert.throws(()=>e.dispose(),/disposal failed/);assert.equal(detached,2);assert.equal(e.destroyed,true);assert.equal(e.phase,'disposed');assert.equal(e.api.physics.getStatistics().bodies,0);
 assert.throws(()=>e.start(),/disposed/);assert.throws(()=>c.createEntity({}),/disposed/);
});

test('disposal while assets prepare cannot resurrect a level or its world',async()=>{
 const e=await ready();let resolvePreparation,discarded=0;
 class Slow extends gameLevel {prepare(){return new Promise(resolve=>{resolvePreparation=resolve;});}disposePrepared(){discarded++;}}
 e.registerLevel('slow',Slow);const pending=e.loadLevel('slow');e.dispose();resolvePreparation({});await assert.rejects(pending,/Failed to load/);
 assert.equal(e.active_level,null);assert.equal(e.phase,'disposed');assert.equal(e.api.physics.getStatistics().bodies,0);assert.equal(discarded,1);
});

test('one scheduled loop survives stop/restart without stale callbacks stealing the next frame',async()=>{
 let next=0;const scheduled=new Map(),cancelled=[];
 const e=await ready({schedule_frame:callback=>{scheduled.set(++next,callback);return next;},cancel_frame:id=>{cancelled.push(id);}});
 assert.equal(e.start(),true);assert.equal(e.start(),false);assert.equal(next,1);const stale=scheduled.get(1);e.stop();e.start();assert.equal(next,2);
 stale();assert.equal(next,2);scheduled.get(2)();assert.equal(next,3);e.stop();assert.deepEqual(cancelled,[1,3]);e.dispose();
});

test('Directory composition installs real native types without booting legacy game code',async()=>{
 const e=createGameRuntime({schedule_frame:null});e.registerLevel('room',Room);await e.loadLevel('room');
 const player=e.api.session.player;
 assert.equal(player.physics_system,e.api.physics);assert.ok(e.api.elements.listEntityTypes().includes('df_traffic_vehicle'));assert.throws(()=>{player.x=5;},/engine requests/);
 e.start();e.api.controls.setInput('keyboard','d',true);e.updateState();assert.ok(player.position[0]>0);e.dispose();
});

test('runtime composition contains no mixins, legacy fallbacks, local collision solver or second index',()=>{
 const source=readFileSync(new URL('../src/engine/lobby/runtime/game-engine.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/engineMixin|Object\.defineProperties|CollisionSystem|collisionWorld|PlayerEntity|new spatialGrid|new Spatial/);
 assert.equal([...source.matchAll(/new physicsSystem\(/g)].length,1);
});
test('asynchronous lifecycle hooks reject before executing and render-time entity creation stops the loop',async()=>{
 const e=await ready();let ran=false;
 assert.throws(()=>e.registerSystem('async',{async attach(){ran=true;}}),/Failed to attach/);assert.equal(ran,false);assert.equal(e.phase,'idle');
 e.registerSystem('bad-render',{render(c){c.createEntity({entity_type:'prop'});}});e.start();
 assert.throws(()=>e.render(),/Render hooks/);assert.equal(e.running,false);assert.equal(e.api.physics.getStatistics().entities,1);e.dispose();
});

test('the runtime owns one input service and input edges are visible to every policy system exactly once',async()=>{
 const e=await ready({controls:{keymap:{use:['e']}}}),seen=[];e.registerSystem('reader-a',{beforePhysics(c){seen.push(['a',c.api.controls.justActivated('use')]);}});
 e.registerSystem('reader-b',{afterPhysics(c){seen.push(['b',c.api.controls.justActivated('use')]);}});e.start();e.api.controls.setInput('keyboard','e',true);e.updateState();e.updateState();
 assert.deepEqual(seen,[['a',true],['b',true],['a',false],['b',false]]);assert.equal(e.api.controls.active('use'),true);e.dispose();assert.equal(e.api.controls.disposed,true);
});

test('pause, resume and level changes cannot carry a held action into a new gameplay context',async()=>{
 const e=await ready({controls:{keymap:{fire:['space']}}});e.start();e.api.controls.setInput('keyboard','space',true);
 const resume=e.pause('menu');assert.equal(e.api.controls.active('fire'),false);resume();e.updateState();assert.equal(e.api.controls.active('fire'),false);
 e.api.controls.setInput('keyboard','space',false);e.api.controls.setInput('keyboard','space',true);assert.equal(e.api.controls.active('fire'),true);
 await e.loadLevel('two');assert.equal(e.api.controls.active('fire'),false);assert.equal(e.api.controls.readQueue('fire'),false);e.dispose();
});

test('render hooks receive a neutral frame, camera follows the same player, and drawing cannot advance physics',async()=>{
 const e=await ready(),player=e.createEntity({entity_type:'character'},{lifetime:'session'});e.api.camera.follow(player);
 let frameRef;e.registerSystem('appearance',{render(c,blend,frame){frameRef=frame;assert.equal(typeof frame.getContext,'undefined');frame.submit({type:'shape',position:player.getRenderState(blend).position,geometry:{type:'ellipse',radii:[12,12]},material:{fill:'#fff'}});}});
 e.start();player.setMovement([1,0]);e.updateState();assert.deepEqual(e.api.camera.getView().position,player.position);
 const before=e.api.physics.savePhysicsState();e.render(.5);e.render(.5);assert.deepEqual(e.api.physics.savePhysicsState(),before);assert.equal(e.api.render.getFrameSnapshot().packet_count,1);assert.throws(()=>frameRef.submit({type:'custom'}),/open/);e.dispose();assert.equal(e.api.render.disposed,true);
});

test('failed render producers abort partial frames and stop the loop without invoking a backend',async()=>{
 const e=await ready();e.registerSystem('broken',{render(c,a,frame){frame.submit({type:'shape',geometry:{type:'rect',size:[1,1]}});throw Error('bad producer');}});e.start();assert.throws(()=>e.render(),/bad producer/);
 assert.equal(e.phase,'idle');assert.equal(e.running,false);assert.equal(e.api.render.getStatistics().packets,0);e.removeSystem('broken');e.start();assert.doesNotThrow(()=>e.render());e.dispose();
});


test('the game appearance producer only submits packets and never touches a Canvas context',()=>{
 const producer=readFileSync(new URL('../src/game/examples/runtime-example.mjs',import.meta.url),'utf8');assert.doesNotMatch(producer,/getContext|ctx\.|\.drawImage|new physicsSystem|new spatialGrid/);
});
