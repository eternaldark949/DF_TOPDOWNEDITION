// ===== LV0 BASEMENT =====
// The WebGL backend's pure parts (colours, outlines, strokes, dashes) and its contract, without a GPU.
// The pixels are checked against Canvas in Chromium by tools/test-webgl-pixels.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {webglRenderer,WEBGL_CAPABILITIES,CAPABILITIES,renderSystem,cameraSystem,recordingRenderer} from '../index.mjs';
import {readColor,premultiplied,gradientRamp} from '../colors.mjs';
import {flattenGeometry,fillTriangles,strokeTriangles,dashPaths,pathBounds} from '../paths.mjs';
import {physicsSystem} from '../../physics/index.mjs';

const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);
// Signed area of a fan's triangles: what a nonzero stencil fill adds up to for a simple outline.
const area=t=>{let s=0;for(let i=0;i<t.length;i+=6)s+=((t[i+2]-t[i])*(t[i+5]-t[i+1])-(t[i+4]-t[i])*(t[i+3]-t[i+1]))/2;return s;};

test('CSS colours read as numbers: names, hex, rgb and hsl in both syntaxes; anything else is refused',()=>{
 assert.deepEqual([...readColor('#f00')],[1,0,0,1]);assert.deepEqual([...readColor('#00ff0080')].map(v=>+v.toFixed(3)),[0,1,0,.502]);
 assert.deepEqual([...readColor('rebeccapurple')].map(v=>Math.round(v*255)),[102,51,153,255]);assert.deepEqual([...readColor('transparent')],[0,0,0,0]);
 assert.deepEqual([...readColor('rgba(255, 128, 0, .5)')].map(v=>+v.toFixed(3)),[1,.502,0,.5]);assert.deepEqual([...readColor('rgb(255 0 0 / 25%)')],[1,0,0,.25]);
 assert.deepEqual([...readColor('hsl(120, 100%, 50%)')].map(v=>+v.toFixed(6)),[0,1,0,1]);assert.deepEqual([...readColor('hsla(0turn 100% 50% / .5)')].map(v=>+v.toFixed(6)),[1,0,0,.5]);
 for(const bad of ['#ggg','#12345','rgb(1,2)','color(srgb 1 0 0)','blurple'])assert.throws(()=>readColor(bad),/Unreadable/);
 assert.deepEqual(premultiplied('rgba(255,255,255,.5)',.5),[.25,.25,.25,.25]);
});

test('a gradient ramp interpolates unpremultiplied, holds its ends and sorts its stops',()=>{
 const ramp=gradientRamp([[1,'#0000ff'],[0,'rgba(255,0,0,0)']],5);
 assert.deepEqual([...ramp.slice(0,4)],[0,0,0,0]);assert.deepEqual([...ramp.slice(16,20)],[0,0,255,255]);
 assert.deepEqual([...ramp.slice(8,12)],[64,0,64,128],'halfway: half red, half blue, half alpha, premultiplied');
 const held=gradientRamp([[.5,'#fff'],[.75,'#000']],5);assert.deepEqual([...held.slice(0,4)],[255,255,255,255]);assert.deepEqual([...held.slice(16,20)],[0,0,0,255]);
});

test('geometry flattens the way Canvas outlines it: rects, round rects, ellipses, curves, arcs and subpaths',()=>{
 const box=flattenGeometry({type:'rect',size:[20,10],radius:0});assert.equal(box.length,1);assert.equal(box[0].closed,true);near(area(fillTriangles(box)),200);
 const round=flattenGeometry({type:'rect',size:[20,20],radius:4},.01);near(Math.abs(area(fillTriangles(round))),400-(4*16-Math.PI*16),.2);
 const disc=flattenGeometry({type:'ellipse',radii:[10,5]},.001);near(Math.abs(area(fillTriangles(disc))),Math.PI*50,.1);
 const quad=flattenGeometry({type:'path',commands:[['move',0,0],['quadratic',10,20,20,0],['close']]},.001);near(Math.abs(area(fillTriangles(quad))),2/3*20*10,.05);
 // a line with no subpath starts one; `rect` is a closed subpath of its own and leaves a new one at its corner
 const parts=flattenGeometry({type:'path',commands:[['line',5,5],['line',10,5],['rect',0,0,4,4],['line',0,9]]});
 assert.deepEqual(parts.map(p=>[p.points,p.closed]),[[[5,5,10,5],false],[[0,0,4,0,4,4,0,4],true],[[0,0,0,9],false]]);
 // an arc joins the current point with a line, and a full turn is a whole circle whichever way it runs
 const arc=flattenGeometry({type:'path',commands:[['move',-20,0],['ellipse',0,0,10,10,0,0,Math.PI*2,1]]});assert.deepEqual(arc[0].points.slice(0,4),[-20,0,10,0]);
 const sweep=flattenGeometry({type:'path',commands:[['ellipse',0,0,10,10,0,0,Math.PI/2,1]]},.01)[0].points;near(sweep.at(-2),0);near(sweep.at(-1),10,1e-9);assert.ok(sweep.length>20,'anticlockwise from 0 to a quarter turn goes three quarters round');
 assert.deepEqual(pathBounds(box),[-10,-5,10,5]);
});

test('a fan fill counts winding: a hole wound the other way cancels, an even-odd pair overlaps',()=>{
 const ring=flattenGeometry({type:'path',commands:[['move',0,0],['line',10,0],['line',10,10],['line',0,10],['close'],['move',2,2],['line',2,8],['line',8,8],['line',8,2],['close']]});
 assert.equal(ring.length,2);near(area(fillTriangles(ring)),100-36);
});

test('strokes cover their width with Canvas caps and joins; dashes cut the outline along its length',()=>{
 const line=[{points:[0,0,10,0],closed:false}];
 const span=t=>{const b=pathBounds([{points:[...t]}]);return b;};
 assert.deepEqual(span(strokeTriangles(line,{width:2})),[0,-1,10,1],'butt ends at the points');
 assert.deepEqual(span(strokeTriangles(line,{width:2,line_cap:'square'})),[-1,-1,11,1],'square reaches half the width past them');
 const round=span(strokeTriangles(line,{width:2,line_cap:'round'}));near(round[0],-1);near(round[2],11);
 const corner=[{points:[0,0,10,0,10,10],closed:false}];
 const miter=span(strokeTriangles(corner,{width:2,line_join:'miter'})),bevel=span(strokeTriangles(corner,{width:2,line_join:'bevel'}));
 near(miter[2],11);near(miter[1],-1);near(bevel[2],11);
 const sharp=[{points:[0,0,10,0,0,1],closed:false}],tip=span(strokeTriangles(sharp,{width:2,line_join:'miter'}));assert.ok(tip[2]<12,'a corner sharper than the miter limit is bevelled');
 const dashes=dashPaths([{points:[0,0,10,0],closed:false}],[3,2]);assert.deepEqual(dashes.map(d=>d.points),[[0,0,3,0],[5,0,8,0]]);
 const shifted=dashPaths([{points:[0,0,10,0],closed:false}],[3,2],4);assert.deepEqual(shifted.map(d=>d.points.map(v=>+v.toFixed(9))),[[1,0,4,0],[6,0,9,0]]);
 assert.equal(dashPaths([{points:[0,0,4,0,4,4,0,4],closed:true}],[2]).length,4,'a closed outline is dashed all the way round');
});

test('the WebGL backend declares a subset of the engine vocabulary and refuses what it cannot draw',async()=>{
 assert.ok(WEBGL_CAPABILITIES.every(need=>CAPABILITIES.includes(need)));
 for(const need of ['shape','sprite','text','picture','clip','target','layer','gradient:radial','pattern','dash','shadow','blur','blend:normal','blend:add','blend:destination-out'])assert.ok(WEBGL_CAPABILITIES.includes(need),need);
 for(const missing of ['blend:overlay','blend:source-in'])assert.ok(!WEBGL_CAPABILITIES.includes(missing),missing);
 const backend=new webglRenderer();assert.equal(backend.capabilities,WEBGL_CAPABILITIES);
 assert.throws(()=>backend.initialize({getContext:()=>null},{viewport:{width:1,height:1,pixel_ratio:1}}),/WebGL 2 context unavailable/);
 assert.throws(()=>new webglRenderer({densities:[2,1]}),/Densities/);

 // through the render system: a frame needing an undeclared capability is refused before the backend sees it,
 // and a backend that cannot start leaves the live one drawing
 const world=new physicsSystem(),camera=new cameraSystem({position:[50,50],viewport:{width:100,height:100}});
 class Subset extends recordingRenderer{constructor(){super({capabilities:WEBGL_CAPABILITIES});}}
 const render=new renderSystem({physics_system:world,camera,create_surface:id=>({id,getContext:()=>null})}).registerRenderer('subset',Subset).registerRenderer('webgl',webglRenderer);
 await render.setRenderer('subset');
 render.beginFrame().submit({type:'shape',geometry:{type:'rect',size:[4,4]},material:{fill:'#fff'},blend:'overlay'});
 assert.throws(()=>render.endFrame(),/capability unavailable: blend:overlay/);
 render.beginFrame().submit({type:'shape',geometry:{type:'rect',size:[4,4]},blend:'overlay'});assert.throws(()=>render.endFrame(),/blend:overlay/);
 render.beginFrame().submit({type:'shape',geometry:{type:'rect',size:[4,4]},blend:'add'});assert.equal(render.endFrame(),1);
 await assert.rejects(render.setRenderer('webgl'),/WebGL 2 context unavailable/);assert.equal(render.getRenderer(),'subset');
 render.dispose();
});

test('blur is paint like any other: a step asks for it, the packet carries it, and a backend must declare it',async()=>{
 const {artScene}=await import('../index.mjs'),{packet,requirements}=await import('../packets.mjs');
 const art=new artScene();art.drawEllipse({x:0,y:0,radius_x:4,radius_y:2,fill:'#000',blur:1.5});
 const [p]=art.finish(),normal=packet(p);assert.equal(normal.material.blur,1.5);assert.ok(requirements(normal,()=>null).includes('blur'));
 assert.equal(packet({type:'shape',geometry:{type:'rect',size:[1,1]}}).material.blur,0,'sharp by default');
 assert.throws(()=>packet({type:'shape',geometry:{type:'rect',size:[1,1]},material:{blur:-1}}),/blur/);
 const streak=packet({type:'shape',geometry:{type:'rect',size:[1,1]},material:{blur:{spread:[6,1],angle:.5}}}).material;
 assert.deepEqual([streak.blur,streak.blur_spread,streak.blur_angle],[6,[6,1],.5],'a streak spreads along its angle and across it');
 assert.deepEqual(packet({type:'shape',geometry:{type:'rect',size:[1,1]},material:{blur:{spread:4}}}).material.blur_spread,[4,0],'a lone spread is all along');
 assert.throws(()=>packet({type:'shape',geometry:{type:'rect',size:[1,1]},material:{blur:'soft'}}),/blur/);
});
