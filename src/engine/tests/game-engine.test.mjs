// The engine file with all four levels plugged in, run with no game present.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gameEngine } from '../game-engine.mjs';
import { gameLevel } from '../lobby/runtime/game-level.mjs';
import { createEngineRegistry } from '../directory/index.mjs';

const runtime = options => new gameEngine({ schedule_frame:null, ...options });
class Room extends gameLevel {
    enter(context, prepared) {
        this.context=context;this.options=prepared;
        this.wall=context.createEntity({kind:'static',position:[200,0],collision_shape:{shape_type:'box',dimensions:[10,100]}});
    }
}
async function ready(options) { const e=runtime(options);e.registerLevel('one',Room).registerLevel('two',Room);await e.loadLevel('one');return e; }

test('new runtime exposes canonical native APIs and prevents any other owner stepping its world',async()=>{
 const e=await ready(),world=e.basement.physics;
 assert.equal(e.basement.physics,world);assert.equal(e.basement.elements,world.elements);assert.equal(e.directory.assets,world.elements.asset_library);
 assert.equal(e.basement.motion,world.motion);assert.equal(e.basement.traffic,world.traffic);assert.ok([e.basement,e.directory,e.penthouse,e.game].every(Object.isFrozen));
 assert.throws(()=>{e.basement={};},TypeError);assert.throws(()=>world.updateState(),/owning runtime/);
 assert.equal(e.updateState(),false);e.start();assert.equal(e.updateState(),true);assert.equal(world.simulation_tick,1);
 assert.throws(()=>e.basement.elements.world.updateState(),/owning runtime/);assert.equal(world.simulation_tick,1);e.dispose();
});

test('levels share one world/grid and preserve session entity body identity and native motion',async()=>{
 const e=await ready(),world=e.basement.physics,grid=world.spatial_grid,old=e.active_level.wall;
 const player=e.createEntity({kind:'character',position:[0,0]},{lifetime:'session'}),body=player.body;
 const raw=world.elements.createEntity({ kind: 'prop', position:[500,500]}); // Native factories also default to the active level's lifetime.
 e.start();player.motor.setMovement([1,0]);e.updateState();const pose=player.position,tick=world.simulation_tick;
 await e.loadLevel('two',{tag:'next'});
 assert.equal(e.basement.physics,world);assert.equal(world.spatial_grid,grid);assert.equal(player.body,body);assert.deepEqual(player.position,pose);
 assert.equal(world.simulation_tick,tick);assert.ok(old.destroyed);assert.ok(raw.destroyed);assert.equal(world.getStatistics().entities,2);
 assert.equal(e.active_level.options.tag,'next');e.updateState();assert.ok(player.position[0]>pose[0]);
 e.unloadLevel();assert.equal(world.getStatistics().entities,1);assert.equal(e.active_level,null);e.dispose();assert.equal(world.getStatistics().bodies,0);
});

test('system hooks have deterministic registration order and exactly one physics step between policy and consequences',async()=>{
 const e=runtime(),trace=[];
 class Ordered extends gameLevel {
  beforePhysics(c){trace.push(`level:before:${c.basement.physics.simulation_tick}`);}
  afterPhysics(c){trace.push(`level:after:${c.basement.physics.simulation_tick}`);}
  render(c,a){trace.push(`level:render:${a}`);}
 }
 for(const id of ['input','combat'])e.registerSystem(id,{beforePhysics(c){trace.push(`${id}:before:${c.basement.physics.simulation_tick}`);},afterPhysics(c){trace.push(`${id}:after:${c.basement.physics.simulation_tick}`);},render(c,a){trace.push(`${id}:render:${a}`);}});
 e.registerLevel('ordered',Ordered);await e.loadLevel('ordered');e.start();e.updateState();e.render(.5);
 assert.deepEqual(trace,['input:before:0','combat:before:0','level:before:0','level:after:1','input:after:1','combat:after:1','level:render:0.5','input:render:0.5','combat:render:0.5']);e.dispose();
});

test('pause tokens compose, paused rendering uses current pose, and rendering never advances physics',async()=>{
 const e=await ready();let blend;e.registerSystem('view',{render(c,a){blend=a;c.basement.elements.getEntities().forEach(entity=>entity.getRenderState(a));}});
 e.start();const releaseMenu=e.pause('menu'),releaseMap=e.pause('map'),before=e.basement.physics.savePhysicsState();
 assert.equal(e.updateState(),false);e.render(.2);assert.equal(blend,1);assert.deepEqual(e.basement.physics.savePhysicsState(),before);
 releaseMenu();assert.equal(e.paused,true);releaseMap();releaseMap();assert.equal(e.paused,false);e.updateState();assert.equal(e.basement.physics.simulation_tick,1);e.dispose();
});

test('asynchronous preparation leaves the current scene live and failure preserves actual bodies',async()=>{
 const e=await ready();let rejectPreparation;
 class Failed extends gameLevel {prepare(context){assert.deepEqual(Object.keys(context),['assets']);return new Promise((resolve,reject)=>{rejectPreparation=reject;});}}
 e.registerLevel('failed',Failed);const old=e.active_level,body=old.wall.body,load=e.loadLevel('failed');
 await assert.rejects(e.loadLevel('two'),/already in progress/);e.start();e.updateState();assert.equal(e.active_level,old);
 rejectPreparation(Error('asset missing'));await assert.rejects(load,/Failed to load/);assert.equal(e.active_level,old);assert.equal(e.basement.physics.fetchBody(body.body_id),body);assert.equal(e.phase,'idle');e.dispose();
});

test('failed entry cleans partial entities and retired contexts, without inventing a fallback world',async()=>{
 const e=await ready();const player=e.createEntity({kind:'character'},{lifetime:'session'});let stale;
 class Broken extends gameLevel {enter(c){stale=c;c.createEntity({kind:'prop'});c.defer(()=>{});throw Error('failed enter');}}
 e.registerLevel('broken',Broken);await assert.rejects(e.loadLevel('broken'),/Failed to load/);
 assert.equal(e.active_level,null);assert.equal(e.basement.physics.getStatistics().entities,1);assert.equal(e.basement.elements.fetchEntity(player.entity_id),player);
 assert.throws(()=>stale.createEntity({}),/retired/);await e.loadLevel('two');assert.equal(e.basement.physics.getStatistics().entities,2);e.dispose();
});

test('level-owned subscriptions, pending event-time spawns and cleanup callbacks retire at transition',async()=>{
 const e=await ready();let calls=0,cleaned=0;
 const c=e.active_level.context;c.on('contactBegin',()=>{calls++;e.basement.elements.createEntity({ kind: 'prop', position:[1000,1000]});});c.defer(()=>{cleaned++;});
 c.createEntity({kind:'prop',position:[0,0]});c.createEntity({kind:'prop',position:[0,0]});e.start();e.updateState();assert.ok(calls>0);
 await e.loadLevel('two');assert.equal(cleaned,1);assert.equal(e.basement.physics.getStatistics().entities,1);
 const atTransition=calls;e.createEntity({kind:'prop',position:[0,0]});e.createEntity({kind:'prop',position:[0,0]});e.updateState();assert.equal(calls,atTransition);
 assert.throws(()=>c.on('contactBegin',()=>{}),/retired/);e.dispose();
});

test('physics callbacks may request a transition but cannot replace a level or recurse into simulation mid-step',async()=>{
 const e=await ready();let load;
 const c=e.active_level.context;c.createEntity({kind:'prop'});c.createEntity({kind:'prop'});
 c.on('contactBegin',()=>{if(load)return;assert.throws(()=>e.unloadLevel(),/boundary/);assert.throws(()=>e.updateState(),/boundary/);load=e.loadLevel('two');assert.equal(e.active_level.level_id,'one');});
 e.start();e.updateState();assert.equal(e.active_level.level_id,'one');await load;assert.equal(e.active_level.level_id,'two');assert.equal(e.basement.physics.simulation_tick,1);e.dispose();
});

test('cleanup failures still retire every body, subscription and system and dispose remains terminal',async()=>{
 const e=await ready();let detached=0;const c=e.active_level.context;c.defer(()=>{throw Error('cleanup failed');});
 e.registerSystem('bad',{detach(){detached++;throw Error('detach failed');}});e.registerSystem('good',{detach(){detached++;}});
 assert.throws(()=>e.dispose(),/disposal failed/);assert.equal(detached,2);assert.equal(e.destroyed,true);assert.equal(e.phase,'disposed');assert.equal(e.basement.physics.getStatistics().bodies,0);
 assert.throws(()=>e.start(),/disposed/);assert.throws(()=>c.createEntity({}),/disposed/);
});

test('disposal while assets prepare cannot resurrect a level or its world',async()=>{
 const e=await ready();let resolvePreparation,discarded=0;
 class Slow extends gameLevel {prepare(){return new Promise(resolve=>{resolvePreparation=resolve;});}disposePrepared(){discarded++;}}
 e.registerLevel('slow',Slow);const pending=e.loadLevel('slow');e.dispose();resolvePreparation({});await assert.rejects(pending,/Failed to load/);
 assert.equal(e.active_level,null);assert.equal(e.phase,'disposed');assert.equal(e.basement.physics.getStatistics().bodies,0);assert.equal(discarded,1);
});

test('one scheduled loop survives stop/restart without stale callbacks stealing the next frame',async()=>{
 let next=0;const scheduled=new Map(),cancelled=[];
 const e=await ready({schedule_frame:callback=>{scheduled.set(++next,callback);return next;},cancel_frame:id=>{cancelled.push(id);}});
 assert.equal(e.start(),true);assert.equal(e.start(),false);assert.equal(next,1);const stale=scheduled.get(1);e.stop();e.start();assert.equal(next,2);
 stale();assert.equal(next,2);scheduled.get(2)();assert.equal(next,3);e.stop();assert.deepEqual(cancelled,[1,3]);e.dispose();
});

test('runtime composition contains no mixins, legacy fallbacks, local collision solver or second index',()=>{
 const source=readFileSync(new URL('../game-engine.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/engineMixin|Object\.defineProperties|CollisionSystem|collisionWorld|PlayerEntity|new spatialGrid|new Spatial/);
 assert.equal([...source.matchAll(/new physicsSystem\(/g)].length,1);
});
test('asynchronous lifecycle hooks reject before executing and render-time entity creation stops the loop',async()=>{
 const e=await ready();let ran=false;
 assert.throws(()=>e.registerSystem('async',{async attach(){ran=true;}}),/Failed to attach/);assert.equal(ran,false);assert.equal(e.phase,'idle');
 e.registerSystem('bad-render',{render(c){c.createEntity({kind:'prop'});}});e.start();
 assert.throws(()=>e.render(),/Render hooks/);assert.equal(e.running,false);assert.equal(e.basement.physics.getStatistics().entities,1);e.dispose();
});

test('the runtime owns one input service and input edges are visible to every policy system exactly once',async()=>{
 const e=await ready({controls:{keymap:{use:['e']}}}),seen=[];e.registerSystem('reader-a',{beforePhysics(c){seen.push(['a',c.basement.controls.justActivated('use')]);}});
 e.registerSystem('reader-b',{afterPhysics(c){seen.push(['b',c.basement.controls.justActivated('use')]);}});e.start();e.basement.controls.setInput('keyboard','e',true);e.updateState();e.updateState();
 assert.deepEqual(seen,[['a',true],['b',true],['a',false],['b',false]]);assert.equal(e.basement.controls.active('use'),true);e.dispose();assert.equal(e.basement.controls.disposed,true);
});

test('pause, resume and level changes cannot carry a held action into a new gameplay context',async()=>{
 const e=await ready({controls:{keymap:{fire:['space']}}});e.start();e.basement.controls.setInput('keyboard','space',true);
 const resume=e.pause('menu');assert.equal(e.basement.controls.active('fire'),false);resume();e.updateState();assert.equal(e.basement.controls.active('fire'),false);
 e.basement.controls.setInput('keyboard','space',false);e.basement.controls.setInput('keyboard','space',true);assert.equal(e.basement.controls.active('fire'),true);
 await e.loadLevel('two');assert.equal(e.basement.controls.active('fire'),false);assert.equal(e.basement.controls.readQueue('fire'),false);e.dispose();
});

test('render hooks receive a neutral frame, camera follows the same player, and drawing cannot advance physics',async()=>{
 const e=await ready(),player=e.createEntity({kind:'character'},{lifetime:'session'});e.basement.camera.follow(player);
 let frameRef;e.registerSystem('appearance',{render(c,blend,frame){frameRef=frame;assert.equal(typeof frame.getContext,'undefined');frame.submit({type:'shape',position:player.getRenderState(blend).position,geometry:{type:'ellipse',radii:[12,12]},material:{fill:'#fff'}});}});
 e.start();player.motor.setMovement([1,0]);e.updateState();assert.deepEqual(e.basement.camera.getView().position,player.position);
 const before=e.basement.physics.savePhysicsState();e.render(.5);e.render(.5);assert.deepEqual(e.basement.physics.savePhysicsState(),before);assert.equal(e.basement.render.getFrameSnapshot().packet_count,1);assert.throws(()=>frameRef.submit({type:'custom'}),/open/);e.dispose();assert.equal(e.basement.render.disposed,true);
});

test('failed render producers abort partial frames and stop the loop without invoking a backend',async()=>{
 const e=await ready();e.registerSystem('broken',{render(c,a,frame){frame.submit({type:'shape',geometry:{type:'rect',size:[1,1]}});throw Error('bad producer');}});e.start();assert.throws(()=>e.render(),/bad producer/);
 assert.equal(e.phase,'idle');assert.equal(e.running,false);assert.equal(e.basement.render.getStatistics().packets,0);e.removeSystem('broken');e.start();assert.doesNotThrow(()=>e.render());e.dispose();
});


test('engine alone: map levels with exits, an auto exit, and travellers carried to the way back', async () => {
    const { mapLevel } = await import('../lobby/runtime/map-level.mjs');
    const { travelSystem } = await import('../lobby/runtime/travel-system.mjs');
    const maps = {
        hall: { map_id: 'hall', size: [400, 300], boundary: { thickness: 20 }, spawn: [200, 150], triggers: [{ x: 360, y: 100, w: 40, h: 100, role: 'exit', data: { target: 'yard', auto: true } }] },
        yard: { map_id: 'yard', size: [300, 300], boundary: { thickness: 20 }, spawn: [150, 150], triggers: [{ x: 0, y: 120, w: 30, h: 60, role: 'exit', data: { target: 'hall', label: 'Back in' } }] }
    };
    class Place extends mapLevel { mapDefinition() { return { definition: maps[this.level_id] }; } }
    const e = runtime(); e.registerLevel('hall', Place).registerLevel('yard', Place);
    let walker, dog;
    e.registerSystem('party', { attach(c) { walker = c.createEntity({ kind: 'character', position: [200, 150], collision_shape: { shape_type: 'circle', radius: 8 } }, { lifetime: 'session' }); dog = c.createEntity({ kind: 'character', position: [180, 150], collision_shape: { shape_type: 'circle', radius: 6 } }, { lifetime: 'session' }); } });
    const travel = new travelSystem({ get_travellers: () => [walker, dog] }); e.registerSystem('travel', travel);
    await e.loadLevel('hall'); e.start();
    assert.deepEqual(e.active_level.getExits().map(x => [x.target, x.auto]), [['yard', true]]);
    e.basement.physics.updateBody(walker, { position: [380, 150] }); e.updateState();
    assert.equal(travel.traveling, true, 'an auto exit travels on contact');
    await new Promise(r => setTimeout(r, 0)); while (travel.traveling) await new Promise(r => setTimeout(r, 0));
    assert.equal(e.active_level.level_id, 'yard'); assert.equal(travel.previous_level, 'hall');
    assert.ok(walker.position[0] >= 40 && walker.position[0] <= 70 && Math.abs(walker.position[1] - 150) < 1, `the walker steps in from the west exit (${walker.position})`);
    assert.ok(!walker.destroyed && !dog.destroyed && dog.position[0] > 30, `and the dog arrives beside, out of the exit (${dog.position})`);
    e.updateState(); assert.equal(travel.exit, null);
    e.basement.physics.updateBody(walker, { position: [15, 150] }); e.updateState();
    assert.deepEqual(travel.exit, { target: 'hall', label: 'Back in', auto: false, available: true });
    await travel.travel(); assert.equal(e.active_level.level_id, 'hall');
    assert.ok(walker.position[0] < 360 && walker.position[0] > 300, `back in the hall beside its east exit (${walker.position})`);
    e.dispose();
});

test('a map level whose switches turn the light grid on bakes it on entry and re-bakes round a glowing mover after physics', async () => {
    const { mapLevel } = await import('../lobby/runtime/map-level.mjs');
    const glow = { library_id: 'glow', resources: { underglow: { kind: 'drawing', steps: [{ shape: 'ellipse', radius_x: 20, radius_y: 10, fill: '#33ccff', emits: { reach: 80 } }] } } };
    const street = { map_id: 'street', size: [1024, 512], regions: { size: 512 }, switches: { light_grid: true }, light_grid: { cell: 32 },
        floors: [{ shape: 'rectangle', x: 100, y: 100, width: 60, height: 8, fill: '#ff3399', emits: { reach: 100 } }], walls: [{ x: 90, y: 112, w: 80, h: 10 }] };
    class Street extends mapLevel { mapDefinition() { return { definition: street }; } }
    const e = new gameEngine({ asset_library: createEngineRegistry({ libraries: [glow] }), schedule_frame: null }); e.registerLevel('street', Street);
    await e.loadLevel('street');
    const grid = e.active_level.light_grid;
    assert.ok(grid, 'the switch made the light grid'); assert.equal(grid.pending, 0, 'baked whole behind the level change');
    assert.ok(grid.sample(130, 80)[0] > .3 && grid.sample(130, 140)[0] < grid.sample(130, 80)[0] * .25, 'lit on the sign\'s side of the wall');
    const car = e.basement.physics.createEntity({ kind: 'vehicle', position: [700, 300], collision_shape: { shape_type: 'circle', radius: 10 }, assets: { drawing: 'glow:underglow' } });
    e.start(); e.updateState(1 / 60);
    for (let k = 0; k < 10 && grid.pending; k++) e.updateState(1 / 60);
    assert.ok(grid.sample(700, 300)[2] > .3, 'the moving car lights the ground under it');
    assert.equal(grid.liveLights().length, 1);
    e.basement.physics.updateBody(car, { position: [300, 300] }); e.updateState(1 / 60);
    for (let k = 0; k < 10 && grid.pending; k++) e.updateState(1 / 60);   // (a step bakes within its budget, the rest on the next steps)
    assert.ok(grid.sample(300, 300)[2] > .3 && grid.sample(700, 300)[2] < .01, 'and its light moves with it');
    e.dispose();
});

test('a map level with a height view sets the camera\'s eye on entry and clears it on leaving', async () => {
    const { mapLevel } = await import('../lobby/runtime/map-level.mjs');
    const maps = { tall: { map_id: 'tall', size: [256, 256], height_view: { eye: 280, lean: 1.5 } }, flat: { map_id: 'flat', size: [256, 256] } };
    class Place extends mapLevel { mapDefinition() { return { definition: maps[this.level_id] }; } }
    const e = new gameEngine({ asset_library: createEngineRegistry({ libraries: [] }), schedule_frame: null }); e.registerLevel('tall', Place); e.registerLevel('flat', Place);
    await e.loadLevel('tall'); assert.deepEqual(e.basement.render.getHeightView(), { eye: 280, lean: 1.5 });
    await e.loadLevel('flat'); assert.equal(e.basement.render.getHeightView(), null);
    e.dispose();
});

test('a map level keeps its night and its particle systems, and puts the night\'s effects on the frame only while it is night', async () => {
    const { mapLevel } = await import('../lobby/runtime/map-level.mjs');
    const night = { tint: 'rgba(24, 0, 78, 0.72)', effects: [{ type: 'grade', tint: '#d0a0ff', tint_amount: 0.5 }], glare: { reach: 58 } };
    const rain = { density: 20, height: [30, 30], velocity: [[0, 0], [0, 0], [-60, -60]], look: { shape: 'streak' } };
    const maps = { city: { map_id: 'city', size: [256, 256], night, particles: [{ system: rain, area: 'view' }] }, room: { map_id: 'room', size: [256, 256] } };
    class Place extends mapLevel { mapDefinition() { return { definition: maps[this.level_id] }; } }
    const e = new gameEngine({ asset_library: createEngineRegistry({ libraries: [] }), schedule_frame: null }); e.registerLevel('city', Place); e.registerLevel('room', Place);
    const effects = () => { const frame = e.basement.render.beginFrame(); const out = frame.getEffects(); e.basement.render.abortFrame(); return out; };
    const city = await e.loadLevel('city'), context = e.levels?.context ?? { basement: e.basement };
    assert.equal(city.night.glare.reach, 58); assert.equal(city.night.scale, 0.5, 'the defaults filled in');
    const physics = e.basement.physics; assert.equal(physics.readParticleSystems().length, 1, 'its rain is made');
    e.start(); for (let i = 0; i < 30; i++) e.updateState(); const drops = physics.readParticleSystems()[0], view = e.basement.camera.getVisibleBounds({ margin: 96 });
    assert.ok(drops.count > 0 && [...drops.x.slice(0, drops.count)].every(x => x >= view.left && x <= view.right), 'it falls where the camera looks');
    assert.deepEqual(effects(), [], 'by day the frame is plain');
    assert.equal(city.setNight(context, true), true); assert.equal(effects()[0].type, 'grade', 'at night it takes the night\'s effects');
    assert.equal(city.setNight(context, false), false); assert.deepEqual(effects(), []);
    city.setNight(context, true); const room = await e.loadLevel('room'); assert.deepEqual(effects(), [], 'leaving takes them off'); assert.equal(physics.readParticleSystems().length, 0, 'and removes its particles');
    assert.equal(room.setNight(context, true), false, 'a map with no night stays off'); assert.equal(room.night, null);
    e.dispose();
});

test('the loop draws a map\'s night and particles from its data: covers in drawLooks, then drawNight and drawParticles', async () => {
    const { mapLevel } = await import('../lobby/runtime/map-level.mjs');
    const night = { tint: 'rgba(24, 0, 78, 0.72)', scale: 0.4, glare: { reach: 40 }, covers: 30 };
    const rain = { density: 20, height: [30, 30], velocity: [[0, 0], [0, 0], [-60, -60]], look: { shape: 'streak' } };
    const city = { map_id: 'city', size: [256, 256], height_view: { eye: 300 }, night, particles: [{ system: rain, area: 'view' }] };
    class Place extends mapLevel { mapDefinition() { return { definition: city }; } }
    const e = new gameEngine({ asset_library: createEngineRegistry({ libraries: [] }), schedule_frame: null, render: { create_surface: () => ({}) } }); e.registerLevel('city', Place);
    const render = e.basement.render; await render.setRenderer('recording');
    const calls = []; for (const name of ['drawLooks', 'drawNight', 'drawParticles']) { const own = render[name].bind(render); render[name] = (...args) => { calls.push([name, args[name === 'drawLooks' ? 1 : 0]]); return own(...args); }; }
    const level = await e.loadLevel('city'), context = { basement: e.basement };
    e.start(); e.updateState(); calls.length = 0; e.render(1);
    assert.deepEqual(calls.map(c => c[0]), ['drawLooks', 'drawParticles'], 'by day: the looks and the rain, no night');
    assert.deepEqual(calls[0][1], {});
    level.setNight(context, true); calls.length = 0; e.render(1);
    assert.deepEqual(calls.map(c => c[0]), ['drawLooks', 'drawNight', 'drawParticles'], 'at night: the night between them');
    assert.deepEqual(calls[0][1], { covers: 30 }, 'the looks keep the night\'s covers'); assert.equal(calls[1][1].tint, night.tint); assert.equal(calls[1][1].scale, 0.4); assert.equal(calls[1][1].glare.reach, 40);
    e.dispose();
});

test('the loop steps the world clock with the game, and a map with the day_night switch lays its night from the clock\'s darkness', async () => {
    const { mapLevel } = await import('../lobby/runtime/map-level.mjs');
    const phases = [{ name: 'day', from: '07:00', dark: 0 }, { name: 'dusk', from: '17:00', dark: 0 }, { name: 'evening', from: '19:00', dark: 0.5 }, { name: 'night', from: '21:00', dark: 1 }, { name: 'dawn', from: '05:00', dark: 1 }];
    const city = { map_id: 'city', size: [256, 256], night: { tint: 'rgba(24, 0, 78, 0.72)', effects: [{ type: 'grade', tint: '#d0a0ff', tint_amount: 0.5 }] }, switches: { day_night: true } };
    class Place extends mapLevel { mapDefinition() { return { definition: city }; } }
    const e = new gameEngine({ asset_library: createEngineRegistry({ libraries: [] }), schedule_frame: null, render: { create_surface: () => ({}) }, time: { start: { time: '16:00' }, speed: 3600, phases, windows: { street_lights: [['18:00', '06:00']] } } });
    e.registerLevel('city', Place); const render = e.basement.render; await render.setRenderer('recording');
    assert.equal(e.time, e.lobby.time); assert.equal(e.time.text(), '16:00');
    const amounts = []; const own = render.drawNight.bind(render); render.drawNight = options => { amounts.push(options.amount); return own(options); };
    const level = await e.loadLevel('city'), step = e.basement.physics.config.fixed_step;
    assert.equal(level.night_on, false, 'by day its night is off'); assert.equal(render.lightGroupOn('street_lights'), false, 'the lamps are off by day');
    e.start(); const hour = Math.round(1 / step);
    for (let i = 0; i < hour * 3.5; i++) e.updateState();
    assert.equal(e.time.text(), '19:30'); assert.ok(e.time.is('evening')); assert.equal(level.night_on, true, 'the evening turns it on'); assert.ok(render.lightGroupOn('street_lights'), 'and the lamps in their window');
    e.render(1); assert.ok(Math.abs(amounts.at(-1) - 0.625) < 0.01, 'laid at the clock\'s darkness');
    assert.ok(Math.abs(render.getEffects().frame[0].tint_amount - 0.3125) < 0.01, 'and its effects come in with it');
    const resume = e.pause('menu'); for (let i = 0; i < hour; i++) e.updateState(); assert.equal(e.time.text(), '19:30', 'the clock pauses with the game'); resume();
    e.time.setTime({ time: '23:00' }); e.updateState(); e.render(1); assert.ok(amounts.at(-1) > 0.99, 'the full night');
    e.time.setTime({ time: '12:00' }); e.updateState(); assert.equal(level.night_on, false, 'and the day takes it off'); assert.deepEqual(render.getEffects().frame, []);
    e.time.setTime({ time: '06:30' }); e.updateState(); assert.equal(level.night_on, true, 'the dawn is still dark'); assert.equal(render.lightGroupOn('street_lights'), false, 'but the lamps are out');
    await e.unloadLevel?.(); assert.ok(render.lightGroupOn('street_lights'), 'leaving puts every group back on');
    e.dispose();
    assert.throws(() => new gameEngine({ asset_library: createEngineRegistry({ libraries: [] }), schedule_frame: null, time: { sped: 2 } }), /unknown field sped/);
});

test('the loop steps the world weather, and a map with the weather switch takes its particle systems, fading as it changes', async () => {
    const { mapLevel } = await import('../lobby/runtime/map-level.mjs');
    const rain = { density: 20, height: [30, 30], velocity: [[0, 0], [0, 0], [-60, -60]], look: { shape: 'streak' } }, snow = { rate: 50, height: [30, 30], velocity: [[0, 0], [0, 0], [-10, -10]], look: { shape: 'dot' } };
    const weather = { states: { clear: {}, rain: { particles: [{ system: rain, area: 'view' }] }, snow: { particles: [{ system: snow, area: 'view' }] } }, start: { state: 'rain', intensity: 'heavy' }, fade: 1 };
    const maps = { street: { map_id: 'street', size: [256, 256], switches: { weather: true } }, room: { map_id: 'room', size: [256, 256] } };
    class Place extends mapLevel { mapDefinition() { return { definition: maps[this.level_id] }; } }
    const e = new gameEngine({ asset_library: createEngineRegistry({ libraries: [] }), schedule_frame: null, weather });
    e.registerLevel('street', Place); e.registerLevel('room', Place); assert.equal(e.weather, e.lobby.weather);
    await e.loadLevel('street'); const physics = e.basement.physics, rates = () => physics.readParticleSystems().map(s => [s.look.shape, s.count]);
    e.start(); for (let i = 0; i < 30; i++) e.updateState();
    let [r, n] = rates(); assert.ok(r[1] > 0 && n[1] === 0, 'it rains, no snow');
    e.weather.set('snow', 'normal'); const step = e.basement.physics.config.fixed_step; for (let i = 0; i < Math.round(2 / step); i++) e.updateState();
    assert.deepEqual(e.weather.amounts(), { clear: 0, rain: 0, snow: 1 }); [r, n] = rates(); assert.ok(n[1] > 0, 'the snow came in');
    const paused = e.pause('menu'); e.weather.set('rain'); for (let i = 0; i < 60; i++) e.updateState(); assert.equal(e.weather.amount('snow'), 1, 'the weather pauses with the game'); paused();
    await e.loadLevel('room'); assert.equal(physics.readParticleSystems().length, 0, 'a map without the switch has no weather');
    e.dispose();
    assert.throws(() => new gameEngine({ asset_library: createEngineRegistry({ libraries: [] }), schedule_frame: null, weather: { start: { state: 'hail' } } }), /start/);
});

const toys = { library_id: 'toys', resources: {
    lamp: { kind: 'drawing', steps: [{ shape: 'glow', radius: 60, color: '#ffd27f' }, { shape: 'circle', radius: 10, material: 'brass', solid: true }, { shape: 'rectangle', x: -2, y: 10, width: 4, height: 30, material: 'brass', solid: true }] },
    brass: { kind: 'material', fill: '#b5a642' } },
    templates: { lamp: { kind: 'prop', assets: { drawing: 'lamp' }, bounds: 'circle' } } };
test('the engine makes objects with level lifetime and the loop draws their looks every frame', async () => {
    const engine = new gameEngine({ asset_library: createEngineRegistry({ libraries: [toys] }), schedule_frame: null });
    let made = null;
    engine.registerLevel('yard', class extends gameLevel { enter(context) { made = context.engine.createObject('toys:lamp', [0, 0]); } });
    await engine.loadLevel('yard'); engine.updateState(1 / 60);
    assert.equal(engine.render(1), true);
    assert.equal(engine.basement.render.getStatistics().packets, 3, 'the glow, the head and the post');
    await engine.unloadLevel(); assert.equal(made.destroyed, true, 'level objects leave with their level');
});

test('the engine registers its backends and switches between them with one call', async () => {
    const made = [];
    const engine = new gameEngine({ render: { create_surface: id => { const surface = { id }; made.push(surface); return surface; } } });
    const render = engine.basement.render;
    assert.deepEqual(render.listRenderers(), ['canvas', 'webgl', 'recording']);
    await render.setRenderer('recording');
    assert.equal(render.getRenderer(), 'recording');
    assert.deepEqual(made.map(surface => surface.id), ['recording']);
});

test('a click on an entity reaches it: pointerHit, and pointerEnter and pointerLeave as the mouse moves', async () => {
    const window = new EventTarget(), document = new EventTarget(); document.hidden = false;
    const emit = (type, p) => { const e = new Event(type, { cancelable: true }); Object.assign(e, p); window.dispatchEvent(e); };
    const engine = await ready({ controls: { event_target: window, document, keymap: { select: ['mouseLeft'] } }, camera: { position: [0, 0], viewport: { width: 100, height: 100 } } });
    const { elements, controls } = engine.basement;
    const crate = elements.createEntity({ kind: 'static', name: 'crate', position: [0, 0], collision_shape: { shape_type: 'box', dimensions: [20, 20] } });
    engine.start(); engine.updateState();
    const heard = []; for (const type of ['pointerHit', 'pointerEnter', 'pointerLeave']) crate.on(type, event => heard.push(type + (event.action ? `:${event.action}` : '')));
    emit('mousemove', { clientX: 50, clientY: 50 }); controls.updateState();
    assert.equal(controls.hit().entity, crate, 'the middle of the screen is the camera position');
    emit('mousedown', { button: 0, clientX: 50, clientY: 50 }); emit('mouseup', { button: 0, clientX: 50, clientY: 50 });
    emit('mousemove', { clientX: 5, clientY: 5 }); controls.updateState();
    engine.updateState();
    assert.deepEqual(heard, ['pointerEnter', 'pointerHit:select', 'pointerLeave']);
    engine.dispose();
});
