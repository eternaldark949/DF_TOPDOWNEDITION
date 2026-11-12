// ===== LV0 BASEMENT =====
import test from 'node:test';
import assert from 'node:assert/strict';
import {physicsSystem,rigDefinition,rigPose,animationClip,animationController} from '../index.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const definition={rig_id:'arm',joints:[{name:'hand',parent:'root',position:[10,0]},{name:'root'}],anchors:{grip:{joint:'hand',position:[2,0]}}};
const clip={clip_id:'reach',duration:1,tracks:[{joint:'hand',channel:'position',keys:[{time:0,value:[10,0]},{time:1,value:[20,0]}]}],markers:[{name:'contact',time:.5,data:{sound:'tap'}}]};
const advance=(c,n)=>{const events=[];for(let i=0;i<n;i++)events.push(...c.advance(.1));return events;};
test('hierarchies resolve unordered parents, scaling, rotation and named anchors without physical bodies',()=>{
    const d=new rigDefinition(definition),p=new rigPose(d);p.setJoint('root',{position:[3,4],rotation:Math.PI/2,scale:[2,1]});
    const hand=p.getJoint('hand'),grip=p.getAnchor('grip');near(hand.position[0],3);near(hand.position[1],24);near(grip.position[1],28);
    d.toJSON().joints[0].position[0]=999;hand.position[0]=999;near(p.getJoint('hand').position[0],3);
});
test('definition rejects duplicate, unknown and cyclic joints and anchors',()=>{
    for(const joints of [[{name:'a'},{name:'a'}],[{name:'a',parent:'b'}],[{name:'a',parent:'b'},{name:'b',parent:'a'}]])assert.throws(()=>new rigDefinition({joints}));
    assert.throws(()=>new rigDefinition({...definition,anchors:{bad:{joint:'missing'}}}));
});
test('pose writes are atomic and joint limits are enforced',()=>{
    const p=new rigPose({rig_id:'limited',joints:[{name:'root',limits:{min_rotation:-1,max_rotation:1}}]});p.setJoint('root',{rotation:2});near(p.getJoint('root').rotation,1);
    const saved=p.getSnapshot();assert.throws(()=>p.setPose({root:{position:[3,4]},missing:{position:[0,0]}}));assert.deepEqual(p.getSnapshot(),saved);
    const bad=structuredClone(saved);bad.locals.root.rotation=2;assert.throws(()=>p.load(bad));assert.deepEqual(p.getSnapshot(),saved);
});
test('keyframe sampling clamps, loops and interpolates rotations by the shortest arc',()=>{
    const c=new animationClip({...clip,loop:false});near(c.sample(.5).hand.position[0],15);near(c.sample(99).hand.position[0],20);
    const r=new animationClip({clip_id:'turn',duration:1,loop:false,tracks:[{joint:'root',channel:'rotation',keys:[{time:0,value:Math.PI-.1},{time:1,value:-Math.PI+.1}]}]});near(r.sample(.5).root.rotation,Math.PI);
    const loop=new animationClip(clip);near(loop.sample(1.25).hand.position[0],12.5);
    assert.throws(()=>new animationClip({...clip,tracks:[clip.tracks[0],clip.tracks[0]]}));
});
test('hold and smooth keyframes have deterministic samples',()=>{
    for(const [interpolation,expected] of [['hold',10],['smooth',11.5625]]){
        const packet=structuredClone(clip);packet.tracks[0].keys[0].interpolation=interpolation;near(new animationClip(packet).sample(.25).hand.position[0],expected);
    }
});
test('marker crossings emit once across loops and pause/seek do not replay events',()=>{
    const c=new animationController({definition,clips:[clip]});c.play('reach');assert.equal(advance(c,25).length,3);
    c.pause();const before=c.getSnapshot();assert.deepEqual(c.advance(.1),[]);assert.deepEqual(c.getSnapshot(),before);
    c.resume().seek(.5);assert.equal(c.advance(.1).length,0);c.seek(1.4);assert.equal(advance(c,2).length,1);
});
test('masks, additive layers, crossfades and procedural poses compose on the same clock',()=>{
    const c=new animationController({definition,clips:[clip,{clip_id:'offset',duration:1,tracks:[{joint:'hand',channel:'position',keys:[{time:0,value:[2,0]}]}]}]});
    c.play('reach').seek(.5);c.play('offset',{layer:'upper',additive:true,mask:['hand']});near(c.getJoint('hand').position[0],17);
    c.setProceduralPose({root:{position:[3,4]}});near(c.getAnchor('grip').position[0],22);
    c.stop('upper');near(c.getJoint('hand').position[0],18);
    c.setProceduralPose({}).play('offset',{fade:.1});near(c.getJoint('hand').position[0],15);c.advance(.05);near(c.getJoint('hand').position[0],8.5);c.advance(.05);near(c.getJoint('hand').position[0],2);
});
test('distance synchronized clips use actual travel instead of wall clock time',()=>{
    const c=new animationController({definition,clips:[clip]});c.play('reach',{distance_per_cycle:100});advance(c,4);near(c.getJoint('hand').position[0],10);
    c.advance(.1,{distance:25});near(c.getJoint('hand').position[0],12.5);
});
test('world owns the animation clock and joints add no bodies or grid instances',()=>{
    const w=new physicsSystem(),body=w.createCharacter(),c=w.rigs.createRig(body,{definition,clips:[clip]});c.play('reach');
    assert.throws(()=>c.advance(.1),/owning world/);for(let i=0;i<6;i++)w.updateState();near(c.getJoint('hand').position[0],11);
    assert.equal(w.getStatistics().bodies,1);assert.equal(w.getStatistics().spatial.instances,1);
    const before=w.savePhysicsState();for(let i=0;i<100;i++)w.rigs.getPose(body,{blend:.5});assert.deepEqual(w.savePhysicsState(),before);
    near(w.rigs.getAnchor(body,'grip',{world_space:false,blend:0}).position[0],12+5/6);near(w.rigs.getAnchor(body,'grip',{world_space:false}).position[0],13);
});
test('native anchor mounts keep real identity, animate velocity, interpolate and combine mass',()=>{
    const w=new physicsSystem(),parent=w.createBody({mass:10,collision_mask:0}),child=w.createBody({mass:5,collision_mask:0}),c=w.rigs.createRig(parent,{definition,clips:[clip]});
    c.play('reach');w.attachBody(child,{parent_body:parent,rig_anchor:'grip',local_position:[1,0],combine_mass:true});const id=child.body_id;
    near(child.position[0],13);near(w.getMassProperties(parent).mass,15);const oldInertia=w.getMassProperties(parent).inertia;
    w.updateState(.1);near(child.position[0],14);near(child.linear_velocity[0],10);near(child.getRenderState(.5).position[0],13.5);
    assert.equal(child.body_id,id);assert.equal(w.getStatistics().bodies,2);assert.ok(w.getMassProperties(parent).inertia>oldInertia);
    assert.throws(()=>w.rigs.removeRig(parent),/Detach/);assert.throws(()=>w.attachBody(w.createBody(),{parent_body:parent,rig_anchor:'missing'}));
});
test('world snapshot restores playback and anchors and validates before replacing live bodies',()=>{
    const w=new physicsSystem(),parent=w.createBody({collision_mask:0}),child=w.createBody({collision_mask:0}),c=w.rigs.createRig(parent,{definition,clips:[clip]});c.play('reach');w.attachBody(child,{parent_body:parent,rig_anchor:'grip'});w.updateState(.1);
    const saved=w.savePhysicsState(),bad=structuredClone(saved);bad.rigs[0].animation.layers.base.clip_id='unknown';assert.throws(()=>w.loadPhysicsState(bad));assert.equal(w.fetchBody(parent.body_id),parent);assert.deepEqual(w.savePhysicsState(),saved);
    w.loadPhysicsState(saved);assert.deepEqual(w.savePhysicsState(),saved);near(w.rigs.getAnchor(parent.body_id,'grip').position[0],13);w.updateState(.1);near(w.fetchBody(child.body_id).position[0],14);
    assert.throws(()=>c.play('reach'),/removed|belong/);
});
test('rig removal and world clearing invalidate old controllers even when body ids are reused',()=>{
    const w=new physicsSystem(),body=w.createBody(),c=w.rigs.createRig(body,{definition,clips:[clip]});w.rigs.removeRig(body);assert.throws(()=>c.play('reach'),/removed/);
    const next=w.rigs.createRig(body,{definition});w.clearWorld();w.createBody();assert.throws(()=>next.pause());
});
test('controller snapshot restore is atomic, deterministic, and rejects unknown fields',()=>{
    const c=new animationController({definition,clips:[clip]});c.play('reach');advance(c,4);const snapshot=c.getSnapshot(),other=new animationController({definition});other.load(snapshot);
    assert.deepEqual(other.advance(.1),c.advance(.1));assert.deepEqual(other.getSnapshot(),c.getSnapshot());
    const before=other.getSnapshot(),bad=structuredClone(before);bad.layers.base.time=NaN;assert.throws(()=>other.load(bad));assert.deepEqual(other.getSnapshot(),before);
    assert.throws(()=>new animationClip({...clip,surprise:true}));
});
const rootClip={clip_id:'stride',duration:1,tracks:[],root_motion:[{time:0,value:[0,0]},{time:1,value:[60,0]}]};
test('root tracks unwrap loops and restore their portable authored data',()=>{
    const clip=new animationClip(rootClip);near(clip.getRootMotion(.9,1.2)[0],18);assert.deepEqual(new animationClip(clip.toJSON()).toJSON(),clip.toJSON());
    const c=new animationController({definition,clips:[clip]});c.play('stride',{root_motion:true});assert.deepEqual(c.getRootMotion(.1),[6,0]);
    assert.throws(()=>c.play('stride',{root_motion:true,distance_per_cycle:10}));
});
test('root motion requests the native motor and respects walls, axis locks, and cancellation ownership',()=>{
    const w=new physicsSystem(),body=w.createCharacter({collision_shape:{shape_type:'circle',radius:2}}),c=w.rigs.createRig(body,{definition,clips:[rootClip]});
    w.elements.createStatic({position:[20,0],collision_shape:{shape_type:'box',dimensions:[2,100]}});
    c.play('stride',{root_motion:true});for(let i=0;i<90;i++)w.updateState();assert.ok(body.position[0]>2&&body.position[0]<18);
    c.stop();body.setMovement([-1,0],{speed:20});w.updateState();assert.equal(body.physics_controller.intent.rig_motion_owner,undefined);
    body.setMovement([0,1],{speed:10});w.rigs.removeRig(body);assert.deepEqual(body.physics_controller.intent.direction,[0,1]);
});
test('marker payload validation and unknown tracks cannot partially mutate a controller',()=>{
    assert.throws(()=>new animationClip({...clip,markers:[{name:'bad',time:.5,data:{x:NaN}}]}));
    assert.throws(()=>new animationClip({...clip,markers:[{name:'bad',time:.5,data:()=>{}}]}));
    const c=new animationController({definition,clips:[clip]}),before=c.getSnapshot();assert.throws(()=>c.addClip({...clip,clip_id:'bad',tracks:[{...clip.tracks[0],joint:'absent'}]}));assert.deepEqual(c.getSnapshot(),before);
});
test('crossfading a base layer does not apply an upper additive layer twice',()=>{
    const offset={clip_id:'offset',duration:1,tracks:[{joint:'hand',channel:'position',keys:[{time:0,value:[2,0]}]}]},rest={clip_id:'rest',duration:1,tracks:[]};
    const c=new animationController({definition,clips:[clip,offset,rest]});c.play('reach').seek(.5).play('offset',{layer:'upper',additive:true});near(c.getJoint('hand').position[0],17);
    c.play('rest',{fade:.1});near(c.getJoint('hand').position[0],17);c.advance(.05);near(c.getJoint('hand').position[0],14.5);c.advance(.05);near(c.getJoint('hand').position[0],12);
    c.stop('upper').play('offset',{layer:'upper',additive:true,fade:.1});near(c.getJoint('hand').position[0],10);c.advance(.05);near(c.getJoint('hand').position[0],11);
});
test('loading an owned controller invalidates interpolated pose caches',()=>{
    const w=new physicsSystem(),body=w.createBody({collision_mask:0}),c=w.rigs.createRig(body,{definition,clips:[clip]});c.play('reach').seek(.1);const first=w.rigs.getAnchor(body,'grip',{blend:.5,world_space:false}).position[0],saved=c.getSnapshot();saved.layers.base.time=.8;c.load(saved);
    assert.ok(w.rigs.getAnchor(body,'grip',{blend:.5,world_space:false}).position[0]>first);
});
test('root movement and world-space anchors honor native axis locks and body rotation',()=>{
    const w=new physicsSystem(),body=w.createCharacter({rotation:Math.PI/2,axis_lock:{y:true}}),c=w.rigs.createRig(body,{definition,clips:[rootClip]});c.play('stride',{root_motion:true});
    for(let i=0;i<5;i++)w.updateState();near(body.position[1],0);const a=w.rigs.getAnchor(body,'grip');near(a.position[0],body.position[0]);near(a.position[1],12);
});
test('invalid root-motion owners reject at selection and mounting suspends translation safely',()=>{
    const w=new physicsSystem(),prop=w.createBody({collision_mask:0}),p=w.createCharacter(),c=w.rigs.createRig(prop,{definition,clips:[rootClip]});
    const before=c.getSnapshot();assert.throws(()=>c.play('stride',{root_motion:true}),/character motor/);assert.deepEqual(c.getSnapshot(),before);
    const rig=w.rigs.createRig(p,{definition,clips:[rootClip]});rig.play('stride',{root_motion:true});w.updateState();w.attachBody(p,{parent_body:prop,local_position:[0,20]});w.updateState();assert.deepEqual(p.position,[prop.position[0],prop.position[1]+20]);assert.equal(p.physics_controller.intent,null);
});
test('a non-humanoid example uses the same animation and body attachment API',async()=>{
    const {createRigExample}=await import('../examples/rig.mjs'),{world,base,load}=createRigExample();let markers=0;world.on('animationMarker',()=>markers++);
    for(let i=0;i<61;i++)world.updateState();assert.equal(markers,1);assert.equal(world.getStatistics().bodies,2);assert.equal(world.getStatistics().spatial.instances,2);assert.equal(world.rigs.getRig(base).definition.getJointNames().length,3);assert.deepEqual(load.position,world.rigs.getAnchor(base,'hook').position);
});
test('snapshots preserve numeric layer insertion order and partial crossfades',()=>{
    const offset={clip_id:'offset',duration:1,tracks:[{joint:'hand',channel:'position',keys:[{time:0,value:[2,0]}]}]};
    const c=new animationController({definition,clips:[clip,offset]});c.play('reach',{layer:'2'}).seek(.4,{layer:'2'}).play('offset',{layer:'1',additive:true,fade:.1});c.advance(.05);
    const snapshot=c.getSnapshot(),other=new animationController({definition});other.load(JSON.parse(JSON.stringify(snapshot)));assert.deepEqual(other.getState().layer_order,['2','1']);assert.deepEqual(other.getPose(),c.getPose());assert.deepEqual(other.advance(.05),c.advance(.05));assert.deepEqual(other.getPose(),c.getPose());
});
test('marker ordering follows crossings within the step rather than independent layer clock origins',()=>{
    const first={clip_id:'older',duration:20,tracks:[],markers:[{name:'late',time:10.09}]},second={clip_id:'younger',duration:1,tracks:[],markers:[{name:'early',time:.02}]};
    const c=new animationController({definition,clips:[first,second]});c.play('older').seek(10).play('younger',{layer:'action'});assert.deepEqual(c.advance(.1).map(e=>e.name),['early','late']);assert.throws(()=>c.getAnchor('toString'),/Unknown rig anchor/);
});

const limb={rig_id:'limb',joints:[{name:'shoulder'},{name:'elbow',parent:'shoulder',position:[10,0]},{name:'wrist',parent:'elbow',position:[10,0]},{name:'finger',parent:'wrist',position:[4,0]}]};
const reach=(c,joint)=>c.getJoint(joint).position;
test('a two-bone goal puts the end on a reachable target, on the chosen elbow side, and straightens toward one out of reach',()=>{
    for(const bend of [1,-1]){
        const c=new animationController({definition:limb});c.setIkGoal('hand',{solver:'two_bone',joints:['shoulder','elbow','wrist'],target:[12,9],bend});
        const w=reach(c,'wrist'),e=reach(c,'elbow');near(w[0],12);near(w[1],9);near(Math.hypot(...e),10);
        const side=Math.sign(12*e[1]-9*e[0]);assert.equal(side,bend===1?-1:1,'bend picks the elbow side');
    }
    const far=new animationController({definition:limb}).setIkGoal('hand',{solver:'two_bone',joints:['shoulder','elbow','wrist'],target:[0,50]});
    near(reach(far,'wrist')[0],0);near(reach(far,'wrist')[1],20);
});
test('a chain goal reaches with any number of joints, and look-at turns one joint within its limit',()=>{
    const c=new animationController({definition:limb}).setIkGoal('tip',{solver:'chain',joints:['shoulder','elbow','wrist','finger'],target:[5,14],tolerance:1e-4,iterations:64});
    const f=reach(c,'finger');assert.ok(Math.hypot(f[0]-5,f[1]-14)<1e-3,`chain reached (${f})`);
    const head=new animationController({definition:{rig_id:'head',joints:[{name:'neck',limits:{min_rotation:-1,max_rotation:1}}]}});
    head.setIkGoal('look',{solver:'look_at',joints:['neck'],target:[0,10]});near(head.getJoint('neck').rotation,1);
    head.setIkGoal('look',{solver:'look_at',joints:['neck'],target:[10,10],max_angle:.5});near(head.getJoint('neck').rotation,.5);
    assert.throws(()=>head.setIkGoal('bad',{solver:'two_bone',joints:['neck'],target:[0,0]}));
    assert.throws(()=>new animationController({definition:limb}).setIkGoal('bad',{solver:'chain',joints:['wrist','shoulder'],target:[0,0]}),'joints must run root to tip');
});
test('IK solves after clips at partial weight and survives a snapshot',()=>{
    const wave={clip_id:'wave',duration:1,tracks:[{joint:'shoulder',channel:'rotation',keys:[{time:0,value:0},{time:1,value:1}]}]};
    const c=new animationController({definition:limb,clips:[wave]});c.play('wave');c.advance(.05);
    c.setIkGoal('hand',{solver:'two_bone',joints:['shoulder','elbow','wrist'],target:[0,15]});near(reach(c,'wrist')[0],0);near(reach(c,'wrist')[1],15);
    c.moveIkGoal('hand',[15,0],{weight:0});near(c.getJoint('shoulder').rotation,c.getPose().shoulder.rotation);
    c.moveIkGoal('hand',[0,15],{weight:1});const copy=new animationController({definition:limb,clips:[wave]});copy.load(c.getSnapshot());
    assert.deepEqual(copy.getIkGoals(),c.getIkGoals());near(reach(copy,'wrist')[1],15);
    c.removeIkGoal('hand');assert.deepEqual(c.getIkGoals(),{});
});
test('an owned rig solves world-space goals against its body, and the goal saves with the world',()=>{
    const p=new physicsSystem(),body=p.elements.createCharacter({position:[100,50],rotation:Math.PI/2,collision_shape:{shape_type:'circle',radius:4}});
    const rig=p.rigs.createRig(body,{definition:limb});rig.setIkGoal('hand',{solver:'two_bone',joints:['shoulder','elbow','wrist'],target:[88,62],space:'world'});
    const hand=p.rigs.getPose(body,{world_space:true}).joints.wrist.position;near(hand[0],88);near(hand[1],62);
    body.teleportTo([102,52]);p.updateState();const moved=p.rigs.getPose(body,{world_space:true}).joints.wrist.position;near(moved[0],88);near(moved[1],62);
    const copy=new physicsSystem();copy.loadPhysicsState(p.savePhysicsState());
    const again=copy.rigs.getPose(copy.elements.getEntities()[0],{world_space:true}).joints.wrist.position;near(again[0],88);near(again[1],62);
});

const tail={rig_id:'tail',joints:[{name:'base'},{name:'a',parent:'base',position:[-10,0]},{name:'b',parent:'a',position:[-10,0],limits:{min_rotation:-.6,max_rotation:.6}},{name:'c',parent:'b',position:[-10,0]},{name:'tip',parent:'c',position:[-10,0]}]};
const sway={clip_id:'sway',duration:1,tracks:[{joint:'a',channel:'rotation',keys:[{time:0,value:-.4},{time:.5,value:.4},{time:1,value:-.4}]}]};
const tailWorld=()=>{const p=new physicsSystem(),body=p.elements.createCharacter({position:[100,100],mass:10,collision_shape:{shape_type:'circle',radius:6}});const rig=p.rigs.createRig(body,{definition:tail,clips:[sway]});return {p,body,rig,chain:p.rigs.createPhysicalChain(body,{chain_id:'tail',joints:['a','b','c','tip']})};};
const tipOf=(p,body)=>p.rigs.getPose(body,{world_space:true}).joints.tip.position;
const animatedTip=(rig,body)=>rig.getAnimatedJoint('tip',{root:{position:body.position,rotation:body.rotation}}).position;
test('a physical chain is one hinged capsule per bone that never collides with its owner or itself',()=>{
    const {p,body,chain}=tailWorld();assert.equal(chain.segments.length,3);assert.equal(chain.hinges.length,3);
    for(const id of chain.segments){const s=p.fetchBody(id).getState();assert.equal(s.collision_shape.shape_type,'capsule');assert.ok(s.tags.includes('rig_segment'));
        for(const other of [body.body_id,...chain.segments])if(other!==id)assert.equal(p._canCollide(id,other),false);}
    for(let i=0;i<60;i++)p.updateState();const tip=tipOf(p,body);near(Math.round(tip[0]*1e3)/1e3,60);assert.ok(Math.abs(tip[1]-100)<1e-3,'at rest it holds the rest pose');
    assert.throws(()=>p.rigs.createPhysicalChain(body,{chain_id:'other',joints:['b','c']}),'a joint belongs to one chain');
    assert.throws(()=>p.rigs.createPhysicalChain(body,{chain_id:'gap',joints:['base','b']}),'joints must be parent and child');
});
test('the chain follows its animation with lag, trails its body when it runs, and gives way to a hit',()=>{
    const {p,body,rig,chain}=tailWorld();rig.play('sway');let gap=0,moved=0;
    for(let i=0;i<60;i++){p.updateState();const t=tipOf(p,body),a=animatedTip(rig,body);gap=Math.max(gap,Math.hypot(t[0]-a[0],t[1]-a[1]));moved=Math.max(moved,Math.abs(t[1]-100));}
    assert.ok(moved>8,`the tail swings (${moved.toFixed(1)})`);assert.ok(gap>.5&&gap<12,`it lags a little behind the clip (${gap.toFixed(1)})`);
    rig.stop();for(let i=0;i<120;i++)p.updateState();const settled=tipOf(p,body);assert.ok(Math.hypot(settled[0]-60,settled[1]-100)<.5,'and settles when the clip stops');
    p.fetchBody(chain.segments[2]).applyImpulse([0,300]);p.updateState();p.updateState();
    const hit=tipOf(p,body);assert.ok(hit[1]-100>1,`a hit knocks the tip aside (${(hit[1]-100).toFixed(1)})`);
    const b=p.rigs.getPose(body).joints.b.rotation;assert.ok(Math.abs(b)<=.6+1e-9,'joint limits still hold');
});
test('a chain saves with the world and goes when a segment, the rig or the body goes',()=>{
    const {p,body,rig,chain}=tailWorld();rig.play('sway');for(let i=0;i<20;i++)p.updateState();
    const copy=new physicsSystem();copy.loadPhysicsState(p.savePhysicsState());const twin=copy.fetchBody(body.body_id);
    assert.deepEqual(copy.rigs.getPhysicalChains(twin),p.rigs.getPhysicalChains(body));
    for(let i=0;i<10;i++){p.updateState();copy.updateState();}const a=tipOf(p,body),b=tipOf(copy,twin);near(a[0],b[0]);near(a[1],b[1]);
    p.removeBody(p.fetchBody(chain.segments[1]));assert.equal(p.rigs.getPhysicalChains(body).length,0);for(const id of chain.segments)assert.equal(p.fetchBody(id),null);
    assert.equal(p.getBodyConstraints(body).length,0);
    copy.rigs.removeRig(twin);for(const id of chain.segments)assert.equal(copy.fetchBody(id),null);
});
