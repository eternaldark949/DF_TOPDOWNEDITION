/** AO contracts: bounded settings/storage, world separation and offscreen proxy selection. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { AmbientOcclusion, occlusionSettings, occlusionDimensions } from '../engine/basement/ambient-occlusion.js';
import { World, Identities } from '../engine/basement/world.js';

/** GPU-free owner fixture: geometry mode must not call a single GL allocation function. */
function fixture(){return new AmbientOcclusion({gl:{},camera:{x:0,y:0},stats:{programs:0}});}

test('AO settings validate atomically and preserve aspect ratio within target budgets',()=>{
  const ao=fixture(),before=ao.settings;
  for(const patch of [{mode:'gtao'},{radius:NaN},{strength:1.1},{resolutionScale:0},{maxDimension:2048},{maxDimension:64.5}]) {
    assert.throws(()=>ao.configure(patch),RangeError);assert.equal(ao.settings,before);
  }
  assert.deepEqual(occlusionDimensions(3840,2160,before),{width:768,height:432});
  assert.deepEqual(occlusionDimensions(1,1,before),{width:1,height:1});
  assert.equal(occlusionSettings(before,{strength:0}).strength,0);ao.dispose();
});

test('analytic proxy selection is bounded, deterministic, rotated and isolated to the supplied world',()=>{
  const ids=new Identities(),world=new World('a',ids),other=new World('b',ids),ao=fixture();
  for(let i=0;i<50;i++)world.create({x:i,z:1,yaw:Math.PI/2,shape:{size:[1,1,2],color:[1,1,1]}});
  world.create({z:-0.5,shape:{size:[100,100,1]}}); // Ground slab is not an ambient blocker.
  world.create({shape:{size:[100,100,100],emission:3,ambientBlocker:false}}); // Explicitly excluded decoration does not dominate.
  world.resolve();ao.select(world);assert.equal(ao.count,12);assert.equal(ao.candidates,50);
  assert.equal(ao.poses[0],0);assert.ok(Math.abs(ao.poses[3])<1e-6);assert.equal(ao.sizes[3],1);
  const retained=ao.poses;ao.select(world);assert.equal(ao.poses,retained,'Storage is reused');
  other.create({x:100,z:1,shape:{size:[2,2,2]}});other.resolve();ao.select(other);
  assert.equal(ao.count,1);assert.equal(ao.poses[0],100,'Offscreen blockers remain eligible');
  ao.configure({mode:'off'});ao.select(world);assert.equal(ao.count,0);assert.equal(ao.inspect().targetBytes,0);
  ao.dispose();ao.dispose();assert.equal(ao.poses,null);assert.throws(()=>ao.configure({mode:'screen'}),/disposed/);
});
