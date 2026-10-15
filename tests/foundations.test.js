/** Boundary tests: contracts that must survive scene churn, catch-up frames, and mixed inputs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Lifetime } from '../engine/basement/lifetime.js';
import { World, Identities } from '../engine/basement/world.js';
import { Input } from '../engine/basement/input.js';
import { circleOverlapsBox } from '../engine/basement/geometry.js';
import { Directory } from '../engine/directory/directory.js';
import { Runtime } from '../engine/lobby/runtime.js';

/** Browser-like key event suitable for Node's native EventTarget. */
function key(target,type,code) { const e=new Event(type,{cancelable:true}); e.code=code; target.dispatchEvent(e); return e; }

/** A controllable one-shot animation-frame queue; consuming a frame removes it first. */
function clock() {
  const pending=new Map(); let next=0;
  return {
    pending,
    request: callback => { pending.set(++next,callback); return next; },
    cancel: id => pending.delete(id),
    frame: time => { const callbacks=[...pending.values()]; pending.clear(); for(const callback of callbacks) callback(time); },
  };
}

test('cleanup is reverse-order, idempotent, and completes after a child failure',() => {
  const life=new Lifetime(), order=[];
  life.own(()=>order.push(1)); life.own(()=>{order.push(2);throw new Error('child');});
  life.own(()=>order.push(3));
  assert.throws(()=>life.dispose(),AggregateError); assert.deepEqual(order,[3,2,1]);
  life.dispose(); life.own(()=>order.push(4)); assert.deepEqual(order,[3,2,1,4]);
});

test('attachments interpolate local transforms, inherit yaw, and disappear with parent',() => {
  const ids=new Identities(), world=new World('a',ids), other=new World('b',ids);
  const root=world.create({yaw:Math.PI/2}), child=world.create({parent:root,x:2,z:1});
  world.snapshot(); root.x=10; world.resolve(0.5);
  assert.ok(Math.abs(child.pose.x-5)<1e-8); assert.ok(Math.abs(child.pose.y-2)<1e-8);
  assert.equal(child.pose.z,1); assert.throws(()=>other.create({parent:root}),/another world/);
  const old=child.id; world.remove(root); assert.equal(world.entities.size,0);
  assert.notEqual(world.create().id,old); world.dispose(); assert.throws(()=>world.create(),/disposed/);
});

test('interpolation takes shortest rotation across the angle wrap',() => {
  const world=new World('a',new Identities()), entity=world.create({yaw:Math.PI-0.1});
  world.snapshot(); entity.yaw=-Math.PI+0.1; world.resolve(0.5);
  assert.ok(Math.abs(entity.pose.yaw-Math.PI)<1e-8);
});

test('leases share allocation, release once, and tolerate Directory-first disposal',() => {
  const directory=new Directory(); let created=0, disposed=0;
  const factory=()=>{created++;return{dispose:()=>disposed++};};
  const a=directory.acquire('mesh',factory),b=directory.acquire('mesh',factory);
  assert.equal(a.value,b.value); assert.equal(created,1);
  a.release(); a.release(); assert.equal(disposed,0);
  b.release(); assert.equal(disposed,1); assert.equal(directory.resources.size,0);
  const c=directory.acquire('mesh',factory); directory.dispose(); c.release();
  assert.equal(disposed,2); assert.throws(()=>directory.acquire('late',factory),/disposed/);
});

test('registrations do not instantiate, and world adoption prevents duplicate IDs',() => {
  const directory=new Directory(); let created=0;
  directory.register('toy',()=>++created); assert.equal(created,0);
  assert.equal(directory.create('toy'),1); assert.throws(()=>directory.register('toy',()=>{}),/Duplicate/);
  const world=new World('a',new Identities()); directory.adopt(world);
  assert.throws(()=>directory.adopt(world),/Duplicate/); directory.releaseWorld('a');
  assert.equal(world.disposed,true); directory.releaseWorld('a');
});

test('runtime has one loop, bounded catch-up, independent pause owners, and removable phases',() => {
  const timer=clock(), runtime=new Runtime({...timer,step:0.01,maxSteps:3}); let updates=0, renders=0;
  const remove=runtime.on('update',()=>updates++); runtime.on('render',()=>renders++);
  runtime.start();runtime.start(); assert.equal(timer.pending.size,1);
  timer.frame(0);timer.frame(1000); assert.equal(updates,3); assert.equal(renders,2);
  assert.ok(runtime.stats.droppedSeconds>0.9);
  runtime.pause('menu');runtime.pause('focus');runtime.pause('menu',false);
  timer.frame(2000); assert.equal(updates,3);
  runtime.pause('focus',false);timer.frame(3000);timer.frame(3010);assert.equal(updates,4);
  remove();timer.frame(3020);assert.equal(updates,4);
  runtime.stop();assert.equal(timer.pending.size,0);
  runtime.start();runtime.dispose();assert.equal(timer.pending.size,0);
  assert.throws(()=>runtime.start(),/disposed/);
});

test('input merges devices without doubling vectors and consumes button edges once',() => {
  const host=new EventTarget(),surface=new EventTarget(); let pads=[];
  const input=new Input(surface,{host,gamepads:()=>pads});
  input.bind({move:{kind:'vector',positiveX:['KeyD'],positiveY:['KeyS'],axes:[0,1]},
    action:{kind:'button',keys:['KeyE'],buttons:[0]}});
  key(host,'keydown','KeyD'); key(host,'keydown','KeyS');
  input.setSource('finger','move',1,0); input.sample();
  assert.ok(Math.abs(Math.hypot(input.read('move').x,input.read('move').y)-1)<1e-8);
  key(host,'keydown','KeyE'); input.setSource('button','action',1);input.sample();
  assert.equal(input.consume('action'),true);assert.equal(input.consume('action'),false);
  input.sample();assert.equal(input.consume('action'),false);
  input.clear(); pads=[{connected:true,axes:[0.8,0],buttons:[{pressed:true}]}];input.sample();
  assert.ok(input.read('move').x>0.7);assert.equal(input.consume('action'),true);
  pads=[];host.dispatchEvent(new Event('gamepaddisconnected'));assert.equal(input.read('action').down,false);
  assert.equal(input.read('move').x,0);
  input.suspend(true);key(host,'keydown','KeyD'); input.setSource('finger','move',1,0);
  input.suspend(false);input.sample();assert.equal(input.read('move').x,0);
  key(host,'keydown','KeyE');host.dispatchEvent(new Event('blur'));input.sample();assert.equal(input.read('action').down,false);
  input.dispose();key(host,'keydown','KeyD');assert.equal(input.keys.size,0);
});

test('circle-box contact allows tangent movement and rejects penetration',() => {
  const box={x:0,y:0,width:2,depth:2};
  assert.equal(circleOverlapsBox(2,0,1,box),false);
  assert.equal(circleOverlapsBox(1.9,0,1,box),true);
  assert.equal(circleOverlapsBox(2,2,1,box),false);
});


test('brief key and control taps survive release before the next input sample',() => {
  const host=new EventTarget(),input=new Input(new EventTarget(),{host,gamepads:()=>[]});
  input.bind({action:{kind:'button',keys:['KeyE']}});
  key(host,'keydown','KeyE');key(host,'keyup','KeyE');input.sample();
  assert.equal(input.read('action').down,false);assert.equal(input.consume('action'),true);
  input.sample();assert.equal(input.consume('action'),false);
  input.setSource('tap','action',1);input.removeSource('tap');input.sample();
  assert.equal(input.consume('action'),true);assert.equal(input.consume('action'),false);
  input.dispose();
});


test('a new tap after release is preserved even while the last sampled action says held',() => {
  const host=new EventTarget(),input=new Input(new EventTarget(),{host,gamepads:()=>[]});
  input.bind({action:{kind:'button',keys:['KeyE']}});
  key(host,'keydown','KeyE');input.sample();assert.equal(input.consume('action'),true);
  input.setSource('overlap','action',1);input.sample();assert.equal(input.consume('action'),false);
  input.removeSource('overlap');key(host,'keyup','KeyE');
  input.setSource('fresh-tap','action',1);input.removeSource('fresh-tap');input.sample();
  assert.equal(input.consume('action'),true);input.dispose();
});


test('late world cleanup cannot release a newer reconstruction with the same world identity',() => {
  const directory=new Directory(),ids=new Identities(),old=new World('stable',ids),rebuilt=new World('stable',ids);
  directory.adopt(old);directory.releaseWorld(old.id,old);directory.adopt(rebuilt);
  directory.releaseWorld(old.id,old);assert.equal(rebuilt.disposed,false);
  assert.equal(directory.worlds.get('stable'),rebuilt);directory.dispose();
});
