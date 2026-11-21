// ===== LV0 BASEMENT =====
// The night's lens and its particles: glare over the lights that ask for it, particle looks (streaks, dots, rings)
// drawn from what physics moves, and the night settings a map holds.
import test from 'node:test';
import assert from 'node:assert/strict';
import {cameraSystem,renderSystem,recordingRenderer,heightView,effectStack,effectsAt,lightGroupOf,GLARE,readGlare,glarePackets,PARTICLE_LOOK,readParticleLook,particlePackets,NIGHT,readNight} from '../index.mjs';
import {physicsSystem} from '../../physics/index.mjs';

const fixture=async()=>{const world=new physicsSystem(),camera=new cameraSystem({position:[200,200],viewport:{width:400,height:400}});
    class Recording extends recordingRenderer{static last;constructor(){super();Recording.last=this;}}
    const render=new renderSystem({physics_system:world,camera});render.registerRenderer('recording',Recording);await render.setRenderer('recording');return {world,render,Recording};};
const lamp=(x,y,more={})=>({shape:'point',position:[x,y],radius:80,color:'#ff40c0',intensity:1,...more});
const bounds={left:0,top:0,right:400,bottom:400};
const commands=packets=>packets.reduce((n,p)=>n+(p.geometry?.commands?.length??0),0);

test('glare settings: true is the defaults, changes are checked, unknown fields refused',()=>{
    assert.equal(readGlare(true),GLARE);
    assert.equal(readGlare({reach:40}).reach,40);assert.equal(readGlare({reach:40}).turn,GLARE.turn,'the rest stay');
    assert.throws(()=>readGlare({size:3}),/Unknown glare field/);
    assert.throws(()=>readGlare({reach:-1}),/reach/);
    assert.equal(readGlare({strength:.5},readGlare({reach:20})).reach,20,'a light\'s changes start from the night\'s');
});

test('only the lights that ask for glare get it: a fog and a star, added, each colour baked once',()=>{
    const packets=glarePackets([lamp(10,10),lamp(50,50,{glare:true}),lamp(90,90,{glare:{reach:30,fog:0}})]);
    assert.equal(packets.length,3,'a fog and a star for the first glaring light, a star alone without fog');
    assert.ok(packets.every(p=>p.blend==='add'),'the lens adds light');
    const stars=packets.filter(p=>p.type==='sprite');assert.equal(stars.length,2);
    assert.equal(stars[0].pixels,stars[1].pixels,'one baked star per colour and shape, shared');
    const px=stars[0].pixels,at=(x,y)=>px.data[(y*px.width+x)*4+3];
    assert.ok(at(64,64)>200,'the core is hot');assert.ok(at(1,1)===0,'the corners are dark');
    assert.equal(stars[1].size[0],60,'the star spans twice its reach');
    assert.deepEqual(glarePackets([lamp(0,0,{glare:true,intensity:0})]),[],'a light that is out has no glare');
});

// Rain as data, the way a game would hand it over: a particle system with a streak look, landing in rings.
const RAIN={density:40,area:[0,0,400,400],height:[30,40],velocity:[[0,0],[0,0],[-70,-60]],life:[2,2],land:'die',
    on_land:{system:{life:[.4,.4],look:{shape:'ring',size:3,grow:true,fade:true,color:'#b9c3dc'}},count:1},
    look:{shape:'streak',color:'#b9c3dc',alpha:.32,trail:.06,bands:true,lit:true}};
const rained=(steps=60,record=RAIN)=>{const world=new physicsSystem();world.createParticleSystem(record);for(let i=0;i<steps;i++)world.updateState();return world;};
const segments=packets=>packets.filter(p=>p.material.stroke&&p.geometry.commands[1]?.[0]==='line').flatMap(p=>{const out=[],c=p.geometry.commands;for(let i=0;i+1<c.length;i+=2)out.push([c[i],c[i+1]]);return out;});

test('particle looks: the defaults, changes checked, unknown fields refused',()=>{
    assert.equal(readParticleLook(null),PARTICLE_LOOK);
    assert.equal(readParticleLook({shape:'streak'}).trail,PARTICLE_LOOK.trail);
    assert.throws(()=>readParticleLook({shape:'cube'}),/shape/);assert.throws(()=>readParticleLook({glow:1}),/Unknown look field/);
    assert.throws(()=>readParticleLook({alpha:2}),/alpha/);assert.throws(()=>readParticleLook({bands:'yes'}),/true or false/);
});

test('rain drawn from physics: a few batched strokes for hundreds of drops, splash rings where they land',()=>{
    const world=rained(),systems=world.readParticleSystems(),drops=systems.find(s=>s.look.shape==='streak'),rings=systems.find(s=>s.look.shape==='ring');
    assert.ok(drops.count>200,`drops fall (${drops.count})`);assert.ok(rings.count>20,`and splash (${rings.count})`);
    const packets=particlePackets(systems,{bounds});
    assert.ok(packets.length<=16,`batched: ${packets.length} packets`);
    assert.ok(segments(packets).length>=drops.count*.9,'a streak a drop');
    assert.deepEqual(particlePackets(systems,{bounds:{left:5000,top:5000,right:5100,bottom:5100}}),[],'nothing in view, nothing drawn');
});

test('drops lean away from the camera: dots under it, streaks outward at the edges',()=>{
    const view=new heightView({camera:[200,200],eye:500}),world=rained(60,{...RAIN,on_land:null,look:{...RAIN.look,lit:false,trail:.1}});
    const segs=segments(particlePackets(world.readParticleSystems(),{bounds,view}));
    const len=([m,l])=>Math.hypot(l[1]-m[1],l[2]-m[2]),far=([m])=>Math.hypot(m[1]-200,m[2]-200);
    const inner=segs.filter(s=>far(s)<60),outer=segs.filter(s=>far(s)>160);
    const mean=list=>list.reduce((n,s)=>n+len(s),0)/list.length;
    assert.ok(inner.length&&outer.length);assert.ok(mean(outer)>mean(inner)*2,'streaks grow toward the edges');
    for(const [m,l] of outer.slice(0,20))assert.ok(Math.hypot(m[1]-200,m[2]-200)>Math.hypot(l[1]-200,l[2]-200),'a streak trails outward: it falls toward its spot, away from where it was');
});

test('near a light a lit particle takes its colour; between steps it is drawn where the blend puts it',()=>{
    const systems=rained().readParticleSystems(),lamp400=[lamp(200,200,{radius:400})];
    assert.ok(particlePackets(systems,{bounds,lights:lamp400}).some(p=>/rgba\(255,64,192,/.test(p.material.stroke??'')),'drops near it are the light\'s colour');
    const plain=systems.map(s=>({...s,look:{...s.look,lit:false}}));
    assert.ok(!particlePackets(plain,{bounds,lights:lamp400}).some(p=>/rgba\(255,64,192,/.test(p.material.stroke??'')));
    const s=systems.find(x=>x.look.shape==='streak'),one={...s,count:1},flat=new heightView({camera:[200,200],eye:1e6}),head=b=>segments(particlePackets([one],{bounds,blend:b,view:flat}))[0][1];
    assert.ok(Math.abs(head(0)[1]-s.px[0])<1e-3&&Math.abs(head(1)[1]-s.x[0])<1e-3,'blend 0 is the step before, 1 the last');
});

test('night settings: defaults filled in, effects and glare checked',()=>{
    const n=readNight({tint:'rgba(24,0,78,.72)',effects:[{type:'grade',tint:'#d0a0ff',tint_amount:.5}],glare:{reach:58}});
    assert.equal(n.scale,NIGHT.scale);assert.equal(n.glare.reach,58);assert.equal(n.glare.turn,GLARE.turn);
    assert.equal(readNight({glare:true}).glare,GLARE);assert.equal(readNight({}).glare,null);
    assert.doesNotThrow(()=>readNight({effects:{preset:'engine:neon_night'}}));
    assert.throws(()=>readNight({effects:[{type:'sparkle'}]}),/effects\[0\]/);
    assert.throws(()=>readNight({tint:'not a colour'}),/tint/);
    assert.throws(()=>readNight({scale:2}),/scale/);
    assert.throws(()=>readNight({dark:1}),/Unknown night field/);
});

test('the render system draws glare after the night and particles over everything, inside a frame',async()=>{
    const {world,render,Recording}=await fixture();
    world.elements.createEntity({kind:'static',position:[200,200],lights:[lamp(0,0,{glare:true}),lamp(40,0)]});
    assert.throws(()=>render.drawParticles(),/inside an open render frame/);
    world.createParticleSystem({...RAIN,area:[0,0,400,400]});for(let i=0;i<40;i++)world.updateState();
    render.beginFrame();render.drawLooks(1);
    assert.equal(render.drawNight({tint:'rgba(0,0,0,.8)',glare:true}),2,'both lights lit the night');
    assert.ok(render.drawParticles()>0);
    render.endFrame();
    const passes=Recording.last.frames[0].passes,packets=passes.flatMap(p=>p.packets);
    const sprites=packets.filter(p=>p.type==='sprite');assert.equal(sprites.length,1,'one star: only the light that asks');
    const last=passes[passes.length-1].packets;assert.ok(last.some(p=>p.type==='sprite'),'the glare comes after the night\'s layer');
    assert.ok(last[last.length-1].type==='shape','the particles are drawn last');
    render.beginFrame();assert.equal(render.drawGlare({settings:{reach:20}}),1);render.endFrame();
});

test('the glare\'s rays, hot colour and fallback light colour are data',()=>{
    assert.throws(()=>readGlare({rays:2.5}),/whole number/);assert.throws(()=>readGlare({hot:'white'}),/colour/);assert.throws(()=>readGlare({rays:40}),/rays/);
    const star=settings=>glarePackets([{shape:'point',position:[0,0],radius:80,intensity:1,glare:{fog:0,...settings}}]).find(p=>p.type==='sprite').pixels;
    const lit=px=>{let n=0;for(let i=3;i<px.data.length;i+=4)if(px.data[i]>0)n++;return n;};
    assert.ok(lit(star({rays:6}))>lit(star({rays:4})),'more rays light more of the star');
    assert.ok(lit(star({diagonal:0}))<lit(star({})),'no short rays without a diagonal');
    const px=star({});
    const tinted=star({color:'#40ff40'}),core=star({hot:'#ff0000',core:.3});
    assert.notEqual(tinted,px,'a light with no colour takes the glare\'s colour');assert.ok(tinted.data[(64*128+100)*4+1]>=tinted.data[(64*128+100)*4],'green along the ray');
    assert.ok(core.data[(64*128+64)*4]>200&&core.data[(64*128+64)*4+1]<120,'the hot colour at the core');
});

test('a particle look\'s height bands and its lit colour are data',()=>{
    assert.throws(()=>readParticleLook({band_count:2.5}),/whole number/);assert.throws(()=>readParticleLook({lit_color:'pink'}));
    const world=rained(60,{...RAIN,on_land:null,look:{...RAIN.look,lit:false}}),systems=world.readParticleSystems();
    const bandsOf=look=>particlePackets(systems.map(s=>({...s,look:{...s.look,...look}})),{bounds}).length;
    assert.equal(bandsOf({}),4,'four bands by default');assert.equal(bandsOf({band_count:8}),8);
    const widths=look=>particlePackets(systems.map(s=>({...s,look:{...s.look,...look}})),{bounds}).map(p=>p.material.stroke_width).filter(Number.isFinite);
    const w=widths({band_width:4});assert.ok(Math.max(...w)/Math.min(...w)>2.5,'the highest band as many times as wide as asked');
    const plainLamp=[{shape:'point',position:[200,200],radius:400,intensity:1}];
    const lit=rained().readParticleSystems().map(s=>({...s,look:{...s.look,lit_color:'#00ff00'}}));
    assert.ok(particlePackets(lit,{bounds,lights:plainLamp}).some(p=>/rgba\(0,255,0,/.test(p.material.stroke??'')),'a light with no colour lends the look\'s lit_color');
});

test('an effects stack laid by degrees: strengths blend from none to their own',()=>{
    const stack=effectStack([{type:'grade',hue:'#a040ff',hue_amount:.4,tint_amount:.3,contrast:1.4},{type:'vignette',strength:.5}]);
    assert.equal(effectsAt(stack,1),stack);assert.deepEqual(effectsAt(stack,0),[]);
    const [g,v]=effectsAt(stack,.5);
    assert.ok(Math.abs(g.hue_amount-.2)<1e-9&&Math.abs(g.tint_amount-.15)<1e-9&&Math.abs(g.contrast-1.2)<1e-9);assert.equal(g.hue,'#a040ff','colours stay');assert.equal(v.strength,.25);
    assert.throws(()=>effectsAt(stack,2),/0 to 1/);
});

test('a light group turned off carries no lights and keeps the night on its glowing parts',async()=>{
    const {world,render}=await fixture();
    world.elements.createEntity({kind:'static',position:[200,200],light_group:'street_lights',lights:[lamp(0,0,{glare:true})]});
    world.elements.createEntity({kind:'static',position:[100,100],lights:[lamp(0,0)]});
    assert.equal(lightGroupOf({light_group:'street_lights'}),'street_lights');assert.equal(lightGroupOf({}),null);
    assert.equal(render.visibleLights().length,2);assert.ok(render.lightGroupOn('street_lights'));
    assert.equal(render.setLightGroup('street_lights',false),true);assert.equal(render.lightGroupOn('street_lights'),false);
    assert.equal(render.visibleLights().length,1,'only the light in no group');
    render.setLightGroup('street_lights',true);assert.equal(render.visibleLights().length,2);
});
