// ===== LV0 BASEMENT =====
import test from 'node:test';
import assert from 'node:assert/strict';
import {EFFECTS,effect,effectStack,validateEffectsPreset,renderFrame,renderSystem,cameraSystem,canvasRenderer} from '../index.mjs';
import {grainPixels,grainOffset,GRAIN_SIZE} from '../effects.mjs';
import {physicsSystem} from '../../physics/index.mjs';

test('an effect is filled in from its defaults, frozen, and refuses unknown types, fields and values out of range',()=>{
 const g=effect({type:'grade',contrast:1.2});assert.deepEqual({...g},{type:'grade',...EFFECTS.grade,contrast:1.2});assert.ok(Object.isFrozen(g));
 assert.throws(()=>effect({type:'lens_flare'}),/Unknown effect: lens_flare/);assert.throws(()=>effect({type:'grain',amout:.1}),/Unknown grain field: amout/);
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

test('light effects are planned the same for both backends: halved levels, small blurs, streaks along their rays',async()=>{
 const {glowPlan,glowSizes,thresholdFilter,GLOW_SIGMA,STREAK_SIGMA}=await import('../effects.mjs');
 assert.deepEqual(glowSizes(101,50,3),[[101,50],[51,25],[26,13],[13,7]]);
 const bloom=glowPlan(effect({type:'bloom',radius:4}),2),[a,b,c]=bloom.spreads;
 assert.deepEqual(bloom.spreads.map(s=>s.sigma*2**s.level),[8,16,32],'radius, twice and four times, in device pixels');assert.deepEqual([b.level-a.level,c.level-b.level],[1,1]);
 assert.ok(bloom.spreads.every(s=>s.sigma<=GLOW_SIGMA&&s.level>=1));assert.deepEqual(bloom.spreads.map(s=>s.weight),[.5,.3,.2]);assert.equal(bloom.levels,c.level);assert.equal(bloom.sum,a.level,'summed at the largest spread');
 const fog=glowPlan(effect({type:'fog_glow',radius:40}),1);assert.equal(fog.spreads.length,1);assert.ok(fog.spreads[0].sigma<=GLOW_SIGMA);assert.equal(40/2**fog.spreads[0].level,fog.spreads[0].sigma);
 const star=glowPlan(effect({type:'star_glow',rays:6,angle:0,length:30}),1);assert.equal(star.spreads.length,3);assert.ok(star.spreads.every(s=>s.sigma<=STREAK_SIGMA&&Math.abs(Math.hypot(...s.dir)-1)<1e-12));
 assert.ok(Math.abs(star.spreads[1].dir[0]-Math.cos(Math.PI/3))<1e-12);
 assert.throws(()=>effect({type:'star_glow',rays:3}),/2, 4, 6 or 8/);assert.throws(()=>effect({type:'bloom',threshold:1}),/at most/);assert.throws(()=>effect({type:'vignette',strength:1.5}),/at most 1/);assert.equal(effect({type:'bloom',strength:3}).strength,3);
 // the filter keeps what is above the threshold, stretched to 0..1: brightness b then contrast k
 const t=.6,[gain,k]=thresholdFilter(t).match(/[\d.]+/g).map(Number),f=c=>Math.min(1,Math.max(0,(c*gain-.5)*k+.5));
 for(const c of [0,.3,.6,.8,1])assert.ok(Math.abs(f(c)-Math.min(1,Math.max(0,(c-t)/(1-t))))<1e-9);
});

test('bokeh grows lights along each side of its aperture by whole pixels, and centres the discs again',async()=>{
 const {bokehPlan,BOKEH_RADIUS}=await import('../effects.mjs');
 for(const blades of [4,6,8,10,12])for(const [radius,sx] of [[12,1],[12,2],[40,2],[3,1]]){
  const plan=bokehPlan(effect({type:'bokeh',radius,blades,rotation:.4}),sx),r=radius*sx/2**plan.level,side=Math.max(1,Math.round(2*r*Math.sin(Math.PI/blades)));
  assert.ok(plan.level>=1&&r<=BOKEH_RADIUS,`level ${plan.level} for ${radius}x${sx}`);assert.equal(plan.sigma,r/2/2**plan.soft);assert.ok(plan.sigma<=3,'the rest blurs at a level small enough');
  assert.ok(plan.steps.every(([x,y])=>Number.isInteger(x)&&Number.isInteger(y)&&(x||y)),'whole pixels');
  const total=plan.steps.reduce((a,[x,y])=>[a[0]+x,a[1]+y],[0,0]);assert.deepEqual(plan.centre,[-Math.round(total[0]/2),-Math.round(total[1]/2)]);
 }
 // an unturned square: one side along x, one down y, so the moves add to [side, side]
 const square=bokehPlan(effect({type:'bokeh',radius:12,blades:4}),2),side=Math.round(2*(24/2**square.level)*Math.sin(Math.PI/4));
 assert.deepEqual(square.steps.reduce((a,[x,y])=>[a[0]+x,a[1]+y],[0,0]),[side,side]);assert.deepEqual(square.steps.slice(0,2),[[1,0],[2,0]],'1, 2, 4… pixels along each side');
 assert.throws(()=>effect({type:'bokeh',blades:5}),/4, 6, 8, 10 or 12/);assert.throws(()=>effect({type:'bokeh',blades:14}),/at most 12/);
});
