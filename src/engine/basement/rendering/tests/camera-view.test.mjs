// ===== LV0 BASEMENT =====
// The camera's view checks: is a point, a box or an entity on screen, leaning with the height view as the drawing does.
import test from 'node:test';
import assert from 'node:assert/strict';
import {cameraSystem,renderSystem,recordingRenderer,heightScale} from '../index.mjs';
import {physicsSystem} from '../../physics/index.mjs';

// A 400 x 400 view round [200, 200]: it sees 0..400 on both axes.
const camera=(more={})=>new cameraSystem({position:[200,200],viewport:{width:400,height:400},...more});

test('points and boxes: on screen, off it, and a margin past its edge',()=>{
    const c=camera();
    assert.equal(c.pointInView([200,200]),true);assert.equal(c.pointInView([420,200]),false);
    assert.equal(c.pointInView([420,200],{margin:30}),true,'the margin is world units past the edge');
    assert.equal(c.boundsInView({left:390,top:10,right:450,bottom:30}),true,'a box over the edge is seen');
    assert.equal(c.boundsInView([410,10,40,20]),false,'[x, y, w, h] works too');
    assert.throws(()=>c.boundsInView({left:0,top:0,right:1}),/box bottom/);
});

test('with a height view a raised thing leans out from the camera: on screen on the ground, off it up high',()=>{
    const c=camera().setHeightView({eye:500}),k=heightScale(100,500);
    assert.equal(c.pointInView([380,200]),true);
    assert.equal(c.pointInView([380,200],{height:100}),200+180*k<=400,'a point 100 up draws at camera + (p - camera) k');
    assert.equal(c.pointInView([380,200],{height:100}),false);
    assert.equal(c.boundsInView([370,190,20,20],{height:[100,120]}),false,'a box held 100 to 120 up past the edge');
    assert.equal(c.boundsInView([370,190,20,20],{height:120}),true,'standing on the ground its foot is seen');
    c.setHeightView({eye:500,lean:0});assert.equal(c.pointInView([380,200],{height:100}),true,'lean 0 is flat');
    c.setHeightView(null);assert.equal(c.getHeightView(),null);assert.throws(()=>c.setHeightView({eye:0}),/eye above/);
});

test('entities: their render bounds where they are drawn, from their base to their top',async()=>{
    const world=new physicsSystem(),c=camera(),box=at=>world.elements.createEntity({kind:'static',position:at,collision_shape:{shape_type:'box',dimensions:[20,20]}});
    const near=box([200,200]),edge=box([405,200]),far=box([600,200]);
    assert.equal(c.inView(near),true);assert.equal(c.inView(edge),true,'half of it on screen');assert.equal(c.inView(far),false);
    assert.equal(c.inView(far,{margin:200}),true);
    // The render system's height view is the camera's: set on one, the checks lean.
    const render=new renderSystem({physics_system:world,camera:c});render.registerRenderer('recording',recordingRenderer);await render.setRenderer('recording');
    render.setHeightView({eye:500});assert.deepEqual(c.getHeightView(),{eye:500,lean:1});
    const lifted=box([370,200]);lifted.setElevation(150);world.updateState();
    assert.equal(c.inView(lifted),false,'held 150 up near the edge, it draws past it');
    render.setHeightView(null);assert.equal(c.inView(lifted),true);
    c.setHeightView({eye:400});assert.deepEqual(render.getHeightView(),{eye:400,lean:1},'and the other way');
    far.destroy();assert.equal(c.inView(far),false,'a destroyed one is not seen');
});
