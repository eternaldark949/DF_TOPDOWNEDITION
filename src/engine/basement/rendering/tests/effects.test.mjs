// ===== LV0 BASEMENT =====
import test from 'node:test';
import assert from 'node:assert/strict';
import {EFFECTS,effect,effectStack,validateEffectsPreset,renderFrame,renderSystem,cameraSystem,canvasRenderer} from '../index.mjs';
import {grainPixels,grainOffset,GRAIN_SIZE} from '../effects.mjs';
import {physicsSystem} from '../../physics/index.mjs';

test('an effect is filled in from its defaults, frozen, and refuses unknown types, fields and values out of range',()=>{
 const g=effect({type:'grade',contrast:1.2});assert.deepEqual({...g},{type:'grade',...EFFECTS.grade,contrast:1.2});assert.ok(Object.isFrozen(g));
 assert.throws(()=>effect({type:'bloom'}),/Unknown effect: bloom/);assert.throws(()=>effect({type:'grain',amout:.1}),/Unknown grain field: amout/);
 assert.throws(()=>effect({type:'vignette',strength:2}),/at most 1/);assert.throws(()=>effect({type:'grain',animated:'yes'}),/true or false/);assert.throws(()=>effect({type:'grade',tint:'nope'}));
});

test('a stack is a list, or a preset whose effects take changes by type; a preset must hold what is changed',()=>{
 const presets={'game:film':{kind:'effects',effects:[{type:'grade',saturation:.8},{type:'grain',amount:.05}]},'game:other':{kind:'drawing'}},read=id=>presets[id];
 assert.deepEqual(effectStack(null),[]);assert.equal(effectStack([{type:'grain'}])[0].amount,EFFECTS.grain.amount);
 const s=effectStack({preset:'game:film',grain:{amount:.2}},read);assert.equal(s[0].saturation,.8);assert.equal(s[1].amount,.2);assert.equal(presets['game:film'].effects[1].amount,.05,'the preset is left as it was');
 assert.throws(()=>effectStack({preset:'game:film',vignette:{strength:1}},read),/has no vignette/);assert.throws(()=>effectStack({preset:'game:other'},read),/not an effects preset/);
 assert.throws(()=>effectStack({preset:'game:film'}),/data source/);assert.throws(()=>effectStack('film'),/list of effects/);
 assert.throws(()=>validateEffectsPreset({kind:'effects',effects:[{type:'grade'},{type:'grain',size:0}]},'lib:x'),/lib:x\.effects\[1\]/);
});

test('effects on one layer number split the frame pass around them, in order, and the frame carries its own stack',()=>{
 const frame=new renderFrame(),view={world_to_screen:[1,0,0,1,0,0],width:100,height:100};
 const shape=layer=>({type:'shape',layer,geometry:{type:'rect',size:[4,4]},position:[0,0],material:{fill:'#fff'}});
 frame.begin(view);frame.clear('#123');frame.setLayerEffects(2,[{type:'grain'}]).setEffects([{type:'vignette'}]);
 for(const l of [3,1,2,2,0])frame.submit(shape(l));
 let out=frame.finish();
 assert.deepEqual(out.passes.map(p=>[p.layer?'effects':'plain',p.packets.map(d=>d.layer),p.clear_color===false?'keep':p.clear_color]),[['plain',[0,1],'#123'],['effects',[2,2],'transparent'],['plain',[3],'keep']]);
 assert.equal(out.passes[1].layer.effects[0].type,'grain');assert.equal(out.effects[0].type,'vignette');
 frame.begin(view);frame.clear('#000');frame.setLayerEffects(0,[{type:'grade'}]);frame.submit(shape(0));frame.submit(shape(1));out=frame.finish();
 assert.deepEqual(out.passes.map(p=>[!!p.layer,p.packets.length]),[[false,0],[true,1],[false,1]],'the frame is still cleared under a first layer with effects');
 frame.begin(view);frame.submit(shape(0));out=frame.finish();assert.equal(out.passes.length,1);assert.deepEqual(out.effects,[],'effects last one frame on a bare renderFrame');
});

test('the render system keeps its stacks between frames, reads presets from the world data, and refuses a backend that cannot draw them',async()=>{
 const presets={'game:dusk':{kind:'effects',effects:[{type:'grade',exposure:-.5},{type:'vignette'}]}};
 const world=new physicsSystem({asset_library:{getResource:id=>presets[id],resolveTemplate:()=>null}}),render=new renderSystem({physics_system:world,camera:new cameraSystem({position:[50,50],viewport:{width:100,height:100}})});
 const frames=[];class Capture{constructor(){this.capabilities=new canvasRenderer().capabilities;}initialize(){}resize(){}getSurfaceBounds(){return {left:0,top:0,width:100,height:100};}registerResource(){}releaseResource(){}measureText(){return {width:1,ascent:1,descent:0};}render(f){frames.push(f);}dispose(){}}
 render.registerRenderer('capture',Capture);await render.setRenderer('capture',{surface:{}});
 render.setEffects({preset:'game:dusk',vignette:{strength:.9}}).setLayerEffects(4,[{type:'grain',animated:false}]);
 assert.equal(render.getEffects().frame[1].strength,.9);assert.equal(render.getEffects().layers[4][0].animated,false);
 for(let i=0;i<2;i++){render.beginFrame().submit({type:'shape',layer:4,geometry:{type:'rect',size:[4,4]},position:[0,0],material:{fill:'#fff'}});render.endFrame();}
 assert.equal(frames.length,2);assert.equal(frames[1].effects[0].exposure,-.5);assert.ok(frames[1].passes.some(p=>p.layer?.effects[0]?.type==='grain'));
 class NoGrain extends Capture{constructor(){super();this.capabilities=this.capabilities.filter(c=>c!=='effect:grain');}}
 render.registerRenderer('nograin',NoGrain);await render.setRenderer('nograin',{surface:{}});render.beginFrame().submit({type:'shape',layer:4,geometry:{type:'rect',size:[4,4]},position:[0,0],material:{fill:'#fff'}});
 assert.throws(()=>render.endFrame(),/capability unavailable: effect:grain/);
 render.setLayerEffects(4,null);render.setEffects(null);assert.deepEqual(render.getEffects(),{frame:[],layers:{}});render.dispose();
});

test('grain is the same texture everywhere, grey around the middle, and still grain does not move',()=>{
 const a=grainPixels(),b=grainPixels();assert.deepEqual(a,b);assert.equal(a.length,GRAIN_SIZE*GRAIN_SIZE*4);
 let sum=0;for(let i=0;i<a.length;i+=4){assert.ok(a[i]===a[i+1]&&a[i]===a[i+2]&&a[i+3]===255);sum+=a[i];}const mean=sum/(GRAIN_SIZE*GRAIN_SIZE);assert.ok(mean>118&&mean<138,`mean ${mean}`);
 assert.deepEqual(grainOffset(5,false),[0,0]);assert.notDeepEqual(grainOffset(5,true),grainOffset(6,true));
});
