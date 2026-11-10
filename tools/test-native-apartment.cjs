'use strict';
const assert=require('node:assert/strict');
const {resolve}=require('node:path');
const {runtime}=require('./test-game-runtime.cjs');
const env=runtime(resolve(__dirname,'../DFAB V8.html'),{affine:true});
const run=code=>structuredClone(env.run(`(()=>{${code}})()`));
let passed=0;
function check(name,code,verify){const result=run(code);verify(result);passed++;console.log('Passed: '+name);}
env.run("game.story.update=()=>{};game.loadMap('apt_949');game.running=true;game.paused=false;");
check('official apartment identities and one authoritative world',`
 return {native:game.player instanceof DFNative.gameCharacter,props:game.props.every(p=>p.physics_system===game.physics_system&&game.physics_system.elements.fetchEntity(p.entity_id)===p),
 count:game.props.length,doors:game.activeLevel.doors.length,lamps:game.lamps.length,curtains:game.activeLevel.curtains.length,
 worlds:game.activeLevel.physics===game.physics_system,legacy:GameEntity.registry.all.length};`,r=>{
 assert.equal(r.native,true);assert.equal(r.props,true);assert.deepEqual([r.count,r.doors,r.lamps,r.curtains],[63,5,22,7]);assert.equal(r.worlds,true);assert.equal(r.legacy,0);
});
check('legacy writable aliases are rejected',`
 const blocked=[];for(const field of ['x','y','vx','vy','velX','velY','angle'])try{game.player[field]=42;}catch{blocked.push(field);}return blocked;`,r=>assert.equal(r.length,7));
check('shared ally healing queries native bodies rather than legacy coordinates',`
 const ally=game.teammates[0],before=game.boosterCount;ally.recruited=true;ally.hp=20;ally.maxHp=100;game.update();
 ally.body.setPosition(game.player.position);game.useBoosterOnAlly();const result={hp:ally.hp,spent:before-game.boosterCount};
 ally.recruited=false;game.update();return result;`,r=>assert.deepEqual(r,{hp:70,spent:1}));
check('simulation and rendering use no legacy collision, grid or interpolation path',`
 const originals=[];for(const[o,keys]of [[CollisionSystem,['update','beginProjectileStep']],[collisionWorld,['carry','integrate']],[RenderInterp,['snapshot','apply','restore']],[_physicsSpatial,['query']]]){
  for(const key of keys){originals.push([o,key,o[key]]);o[key]=()=>{throw Error('Legacy '+key+' called');};}
 }
 try{
  const tick=game.physics_system.simulation_tick;for(let i=0;i<5;i++){game.update();game.draw();}
  const before=JSON.stringify(game.physics_system.savePhysicsState());for(let i=0;i<3;i++)game.draw();
  return {steps:game.physics_system.simulation_tick-tick,unchanged:before===JSON.stringify(game.physics_system.savePhysicsState()),legacy:GameEntity.registry.all.length,pending:GameEntity.registrationQueue.length};
 }finally{for(const[o,key,f]of originals)o[key]=f;}`,r=>assert.deepEqual(r,{steps:5,unchanged:true,legacy:0,pending:0}));
check('movement and automatic native doors cross the bedroom opening',`
 game.player.body.setPosition([1050,370]);game.joystick.active=true;game.joystick.dx=-1;game.joystick.dy=0;
 for(let i=0;i<90;i++)game.update();game.joystick.active=false;return game.player.position;`,r=>assert.ok(r[0]<850,r));
check('the common solver stops the player at the exterior wall',`
 game.player.body.setPosition([1330,370]);game.joystick.active=true;game.joystick.dx=1;game.joystick.dy=0;
 for(let i=0;i<90;i++)game.update();game.joystick.active=false;return game.player.position;`,r=>assert.ok(r[0]<=1380.001&&r[0]>=1379,r));
check('paused gameplay never advances the native simulation',`
 const t=game.physics_system.simulation_tick;game.paused=true;game.update();game.draw();game.paused=false;return game.physics_system.simulation_tick-t;`,r=>assert.equal(r,0));
check('Flit uses native landing clearance and remains inside the map',`
 game.player.body.setPosition([700,850]);game.flitState.attunement=120;game.player.setRotation(Math.PI/2);
 const accepted=game.triggerFlit(Math.PI/2);return {accepted,position:game.player.position};`,r=>{assert.equal(r.accepted,true);assert.ok(r.position[1]<=880.001,r);});
check('furniture grip, spring coupling, rotation and release use the existing native body',`
 game.player.body.setPosition([460,620]);game.update();const target=game.furniture.cand,id=target.body_id;
 game.furniture.press();game.furniture.press();for(let i=0;i<120&&game.furniture.state!=='hold';i++)game.update();
 const holding=game.furniture.holding;game.joystick.active=true;game.joystick.dx=0;game.joystick.dy=1;
 for(let i=0;i<90;i++)game.update();game.joystick.active=false;game.furniture.rotate(1);for(let i=0;i<20;i++)game.update();
 const moved=target.position,pose=target.rotation;game.furniture.release();
 return {holding,moved,pose,same:game.physics_system.fetchBody(id)===target.body,kind:target.physics_type,layout:game.questState.aptLayout[target.data.layout_index]};`,r=>{
 assert.equal(r.holding,true);assert.ok(r.moved[1]>560,r);assert.ok(r.moved[1]<710,r);assert.equal(r.same,true);assert.equal(r.kind,'static');assert.deepEqual(r.layout,[...r.moved,r.pose]);
});
check('native world snapshots restore furniture identity, pose and curtain components',`
 game.saveGame({auto:true});const old=game.physics_system,expected=game.player.position;
 const props=game.props.map(p=>[p.body_id,p.position,p.rotation]);const loaded=game.loadGame(AUTOSAVE_KEY);
 return {loaded,expected,position:game.player.position,props:JSON.stringify(props)===JSON.stringify(game.props.map(p=>[p.body_id,p.position,p.rotation])),retired:old.getStatistics().bodies,cloth:game.activeLevel.curtains.every(e=>game.physics_system.getClothState(e.data.cloth_id).length>0)};`,r=>{
 assert.equal(r.loaded,true);assert.deepEqual(r.position,r.expected);assert.equal(r.props,true);assert.equal(r.retired,0);assert.equal(r.cloth,true);
});
check('old apartment saves restore existing furniture layout indices',`
 const save=game.getSaveSchema();delete save.world.nativeLevel;save.world.questState.aptLayout={0:[480,535,0.2]};
 localStorage.setItem('native-old-save',JSON.stringify(save));const loaded=game.loadGame('native-old-save');return {loaded,pose:game.props[0].position,angle:game.props[0].rotation};`,r=>assert.deepEqual(r,{loaded:true,pose:[480,535],angle:.2}));
check('crafted dyer stations are official native entities',`
 game.questState.hasClothingDyer=true;game.ensureDyeStation();const p=game.props.find(p=>p.interactionType==='clothing_dyer');
 return {exists:!!p,native:p?.physics_system===game.physics_system,legacy:GameEntity.registrationQueue.length};`,r=>assert.deepEqual(r,{exists:true,native:true,legacy:0}));
check('leaving and returning retires scene bodies and preserves the layout',`
 const old=game.physics_system,layout=JSON.stringify(game.activeLevel.getLayout());game._doLoadMap('hotel_lobby');
 const retired=old.getStatistics().bodies;game._doLoadMap('apt_949');game.update();game.draw();
 return {retired,layout:layout===JSON.stringify(game.activeLevel.getLayout()),native:game.player.physics_system===game.physics_system,legacy:GameEntity.registry.all.length,pending:GameEntity.registrationQueue.length};`,r=>assert.deepEqual(r,{retired:0,layout:true,native:true,legacy:0,pending:0}));
assert.deepEqual(env.errors,[]);console.log(`Native apartment: ${passed} checks passed.`);
