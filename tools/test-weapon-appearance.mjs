import test from 'node:test';
import assert from 'node:assert/strict';
import {weaponAppearance} from '../src/presentation/weapon-appearance.mjs';
import {WEAPON_MODELS} from '../src/directory/weapon-appearance.mjs';
import {physicsSystem} from '../src/basement/physics/index.mjs';
import {renderSystem,cameraSystem,canvasRenderer} from '../src/basement/rendering/index.mjs';
class Capture{
 constructor(){this.capabilities=new canvasRenderer().capabilities;}
 initialize(){}resize(){}registerResource(){}releaseResource(){}dispose(){}
 getSurfaceBounds(){return {left:0,top:0,width:100,height:100};}
 render(){if(this.fail)throw new Error('backend failure');}
}
async function fixture(){const world=new physicsSystem(),render=new renderSystem({physics_system:world,camera:new cameraSystem({viewport:{width:100,height:100}})});render.registerRenderer('capture',Capture);await render.setRenderer('capture',{surface:{}});const art=await new weaponAppearance().prepare(render);return {world,render,art};}
test('every authored weapon and laser variant compiles to portable material/path packets and reuses baked targets',async()=>{
 const {world,render,art}=await fixture(),before=world.savePhysicsState();
 for(const id of Object.keys(WEAPON_MODELS))for(const laser of [false,true]){const frame=render.beginFrame();art.draw(frame,id,{laser,position:[50,50],rotation:.7});render.endFrame();const snapshot=render.getFrameSnapshot();assert.equal(snapshot.passes.length,3);assert.ok(snapshot.passes[1].packets.length>5);assert.equal(snapshot.passes.at(-1).packets[0].type,'sprite');assert.doesNotThrow(()=>JSON.stringify(snapshot));}
 const frame=render.beginFrame();for(let i=0;i<20;i++)art.draw(frame,'pistol_fpx',{position:[i,10]});render.endFrame();assert.equal(render.getFrameSnapshot().passes.length,1);assert.equal(render.getStatistics().packets,20);assert.deepEqual(world.savePhysicsState(),before);
 art.dispose();assert.equal(render.listResources().length,0);render.dispose();
});
test('unused targets, aborted frames and backend replacement cannot turn blank art into a completed cache',async()=>{
 const {render,art}=await fixture();let frame=render.beginFrame();art.draw(frame,'pistol_fpx');render.abortFrame();
 frame=render.beginFrame();art.draw(frame,'pistol_fpx');render.endFrame();assert.equal(render.getFrameSnapshot().passes.length,3);
 frame=render.beginFrame();art.draw(frame,'sniper_sara');render.endFrame();assert.equal(render.getFrameSnapshot().passes.length,3);
 await render.setRenderer('capture',{surface:{}});frame=render.beginFrame();art.draw(frame,'pistol_fpx');render.endFrame();assert.equal(render.getFrameSnapshot().passes.length,3);
 frame=render.beginFrame();art.draw(frame,'unknown-catalog-id');render.endFrame();assert.equal(render.getFrameSnapshot().passes.length,1);art.dispose();render.dispose();
});
test('resource collisions fail without deleting somebody else’s target',async()=>{
 const {render,art}=await fixture(),other=new weaponAppearance();await assert.rejects(other.prepare(render),/already exists/);assert.equal(render.listResources().length,Object.keys(WEAPON_MODELS).length*2);art.dispose();render.dispose();
});
