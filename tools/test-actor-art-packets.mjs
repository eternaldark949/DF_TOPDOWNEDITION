import test from 'node:test';
import poses from './fixtures/actor-art/poses.json' with {type:'json'};
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDronePackets,dronePresentation} from '../src/presentation/drone.mjs';
import {createVelvetCatArt,createVelvetEyePackets,createVelvetCatPackets} from '../src/presentation/velvet-cat.mjs';
import {createVelvetAnimation,velvetPresentation} from '../src/presentation/velvet-cat-animation.mjs';
import {actorPresentation} from '../src/presentation/actor-presentation.mjs';
import {renderFrame,cameraSystem,canvasRenderer} from '../src/basement/rendering/index.mjs';
import {artScene} from '../src/presentation/art-packets.mjs';
import {createGameRuntime} from '../src/directory/game-runtime.mjs';
import {gameLevel} from '../src/runtime/game-level.mjs';
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const drone=(state='hover')=>structuredClone(poses['drone-'+state]);
const cat=(pose='stand')=>structuredClone(poses['cat-'+pose]);
function portable(value){if(value===null)return;if(typeof value!=='object'){assert.ok(['number','string','boolean'].includes(typeof value));return;}assert.equal(Object.getPrototypeOf(value),Array.isArray(value)?Array.prototype:Object.prototype);Object.values(value).forEach(portable);}
function normalized(packets){const frame=new renderFrame();frame.begin(new cameraSystem({viewport:{width:320,height:320}}).getView());for(const packet of packets)frame.submit(packet);return frame.finish();}
test('Drone states and layered effects compile to portable packets without a Canvas or entity write',()=>{
 for(const state of ['hover','descend','recover','tell','tether','beam']){const input=freeze(drone(state)),before=JSON.stringify(input),body=createDronePackets(input),lights=createDronePackets(input,{pass:'lights'});portable(body);portable(lights);assert.ok(body.length>30);assert.ok(lights.length>3);assert.ok(lights.every(p=>p.blend==='add'));assert.equal(normalized([...body,...lights]).packet_count,body.length+lights.length);assert.equal(JSON.stringify(input),before);assert.deepEqual(createDronePackets(input),body);}
});
test('Velvet poses, coat gradients, clips and eye anchors are pure data independent of rendering order',()=>{
 for(const pose of ['stand','sit','sleep','groom','gallop']){const input=freeze(cat(pose)),before=JSON.stringify(input),art=createVelvetCatArt(input);portable(art);assert.ok(art.body.some(p=>p.clips.length));assert.ok(art.body.some(p=>typeof p.material.fill==='object'&&p.material.fill!==null));assert.equal(art.eyes.length,2);const eyes=createVelvetEyePackets(input,{eyes:art.eyes,darkness:.8});assert.deepEqual(createVelvetEyePackets(input,{darkness:.8}),eyes);assert.deepEqual(createVelvetCatPackets(input),art.body);assert.equal(JSON.stringify(input),before);assert.equal(normalized([...art.body,...eyes]).packet_count,art.body.length+eyes.length);}
});
test('hidden/dead/mounted/blinking passes emit no visible packet and bright rooms suppress eyeshine',()=>{
 assert.deepEqual(createDronePackets({...drone(),dead:true}),[]);assert.deepEqual(createDronePackets({...drone(),invincibleTimer:7}),[]);assert.deepEqual(createVelvetCatPackets({...cat(),visible:false}),[]);assert.deepEqual(createVelvetCatPackets({...cat(),inCar:true}),[]);assert.deepEqual(createVelvetEyePackets(cat(),{darkness:.18}),[]);assert.deepEqual(createVelvetEyePackets({...cat(),_blink:1},{darkness:1}),[]);assert.throws(()=>createDronePackets(drone(),{pass:'canvas'}));
});
test('ground shadow does not rotate with the cat; head/tail geometry and eye anchors do',()=>{
 const a=createVelvetCatArt(cat()),b=createVelvetCatArt({...cat(),angle:2});assert.deepEqual(a.body[0],b.body[0]);assert.notDeepEqual(a.eyes,b.eyes);assert.notDeepEqual(a.body[1].matrix,b.body[1].matrix);
});
test('nested art clips retain their creation frame relative to each emitted shape',()=>{
 const art=new artScene();art.enter({position:[10,20]});art.clip([['move',0,0],['line',10,0],['line',10,10],['close']]);art.enter({position:[5,6]});art.paint([['move',1,1],['line',3,3]],{stroke:'#fff'});art.leave();art.leave();const [packet]=art.finish();assert.deepEqual(packet.matrix,[1,0,0,1,15,26]);assert.deepEqual(packet.clips[0].transform,[1,0,0,1,-5,-6]);assert.throws(()=>art.leave());
});
test('one packet producer failure cannot contaminate the next actor or rendering request',()=>{
 const bad={...cat(),_poses:{...cat()._poses,sleep:NaN}};assert.throws(()=>normalized(createVelvetCatPackets(bad)));assert.doesNotThrow(()=>normalized(createVelvetCatPackets(cat())));
});
test('producers/animation contain no Canvas backend calls or cached eye writes',()=>{
 for(const path of ['src/presentation/drone.mjs','src/presentation/velvet-cat.mjs','src/presentation/velvet-cat-animation.mjs','src/presentation/art-packets.mjs']){const source=readFileSync(new URL('../'+path,import.meta.url),'utf8');assert.doesNotMatch(source,/\b(?:ctx|context)\.|\bPath2D\b|\.getContext\(|createLinearGradient|createRadialGradient|_eyeWorld/);}
 const old=readFileSync(new URL('../src/entities/drones.js',import.meta.url),'utf8');assert.doesNotMatch(old,/_draw(?:Tendrils|Arms|Shell)\(/);
});
class Room extends gameLevel{}
test('native presentation submits real actors to an alternate backend without the legacy Canvas adapter',async()=>{
 const engine=createGameRuntime({schedule_frame:null,player:{template:'df:player_949',entity_type:'df_player',position:[160,160]}});engine.registerLevel('room',Room);await engine.loadLevel('room');engine.start();const api=engine.api;api.camera.setViewport({width:320,height:320});api.camera.setView({position:[160,160]});const d=api.actors.spawn({kind:'drone',position:[220,160]}),c=api.actors.spawn({kind:'velvet_cat',position:[110,160]});let captured;
 class Alternate{capabilities=new canvasRenderer().capabilities;initialize(){}resize(){}getSurfaceBounds(){return {left:0,top:0,width:320,height:320};}registerResource(){}releaseResource(){}render(frame){captured=structuredClone(frame);}dispose(){}}
 api.render.registerRenderer('alternate',Alternate);await api.render.setRenderer('alternate',{surface:{}});engine.registerSystem('actor-art',new actorPresentation());const old=canvasRenderer.drawPackets;canvasRenderer.drawPackets=()=>{throw new Error('Legacy Canvas adapter entered');};
 try{const before=api.physics.savePhysicsState();engine.render(.5);assert.ok(captured.packet_count>60);assert.ok(captured.passes[0].packets.some(p=>p.layer===20));assert.ok(captured.passes[0].packets.some(p=>p.layer===60));assert.deepEqual(api.physics.savePhysicsState(),before);assert.equal(Object.getPrototypeOf(dronePresentation(d)),Object.prototype);assert.equal(Object.getPrototypeOf(velvetPresentation(c)),Object.prototype);}finally{canvasRenderer.drawPackets=old;engine.dispose();}
});
