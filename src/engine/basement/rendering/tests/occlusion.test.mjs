// ===== LV0 BASEMENT =====
// The occlusion order: what stands between the eye and another thing draws after it, whatever their heights.
import test from 'node:test';
import assert from 'node:assert/strict';
import {cameraSystem,renderSystem,recordingRenderer,occlusionOrder,canHide,renderFrame} from '../index.mjs';
import {physicsSystem} from '../../physics/index.mjs';

const eye=[0,300];
const solid=(hulls,z0,z1,box,bias=0)=>({hulls,z0,z1,box,eye,bias});

test('a thing wholly lower never hides one above it; a line with the eye on one side holds the other off it',()=>{
 const low=solid([[[-10,-10],[10,-10],[10,10],[-10,10]]],0,5,[-10,-10,10,10]),high=solid([[[-5,-5],[5,-5],[5,5],[-5,5]]],5,9,[-5,-5,5,5]);
 assert.equal(canHide(low,high),false,'every sight line comes down from above');
 assert.equal(canHide(high,low),true);
 // a wall's foot along y = 0, 22 to 126 high; a rail in front of it (toward the eye), 20 to 26 high
 const wall=solid([[[-50,0],[50,0]]],22,126,[-60,-80,60,2]),rail=solid([[[-10,5],[10,5],[10,10],[-10,10]]],20,26,[-11,4,11,12]);
 assert.equal(canHide(wall,rail),false,'the wall is behind the rail');
 assert.equal(canHide(rail,wall),true,'the rail, though it starts lower, can cover the wall');
 // the eye between two things: neither can hide the other
 const west=solid([[[-90,290],[-80,290],[-80,310],[-90,310]]],0,50,[-95,280,-75,320]),east=solid([[[80,290],[90,290],[90,310],[80,310]]],0,50,[75,280,95,320]);
 assert.equal(canHide(west,east),false);assert.equal(canHide(east,west),false);
});

test('occlusionOrder keeps the order given except where one can hide another; a shared solid moves as one',()=>{
 const wall=solid([[[-50,0],[50,0]]],22,126,[-60,-80,60,2]),rail=solid([[[-10,5],[10,5],[10,10],[-10,10]]],20,26,[-11,-10,11,12]);
 const items=[{n:'rail a',solid:rail},{n:'rail b',solid:rail},{n:'loose'},{n:'wall',solid:wall}];
 assert.deepEqual(occlusionOrder(items).map(i=>i.n),['loose','wall','rail a','rail b'],'the rail waits for the wall, its two packets together');
 assert.deepEqual(occlusionOrder(items.slice(2)).map(i=>i.n),['loose','wall'],'nothing to bend');
 assert.deepEqual(occlusionOrder(items,{group:i=>i.n==='wall'?1:0}).map(i=>i.n),['rail a','rail b','loose','wall'],'other groups (layers) are never compared');
 assert.deepEqual(occlusionOrder([{n:'r',solid:{...rail,bias:1}},{n:'w',solid:wall}]).map(i=>i.n),['r','w'],'nor are other biases (a look\'s depth)');
 // three that each say the next can hide them, round in a ring: every item still comes out, once
 const ring=[0,1,2].map(i=>({n:i,solid:solid([[[i,0],[i+1,0],[i+1,1],[i,1]]],0,1,[0,0,3,1])}));
 assert.equal(occlusionOrder(ring).length,3);
});

const scene=async({camera=eye}={})=>{
 class Rec extends recordingRenderer{constructor(...a){super(...a);Rec.last=this;}}
 const world=new physicsSystem(),render=new renderSystem({physics_system:world,camera:new cameraSystem({position:camera,viewport:{width:1200,height:1200}})});
 render.registerRenderer('recording',Rec);await render.setRenderer('recording',{surface:null});render.setHeightView({eye:700});
 return {world,render,frame:()=>{world.updateState(1/60);render.beginFrame();render.drawLooks();render.endFrame();return Rec.last.frames.at(-1).passes.flatMap(p=>p.packets);}};
};
const rect=(x,y,w,h,fill)=>({shape:'rectangle',x,y,width:w,height:h,fill});
const fills=(packets,fill)=>packets.map((p,i)=>p.material?.fill===fill?i:-1).filter(i=>i>=0);

test('a rail in front of a tall wall draws after it, though it starts under the wall\'s foot',async()=>{
 const {world,frame}=await scene();
 // (its top's front, 30.2 high, is drawn over the tower's foot)
 world.elements.createEntity({kind:'static',position:[0,0],components:[
  {name:'tower',layers:[{layer:0,height:0,thickness:22,solid:false,sides:'#444',steps:[rect(-100,-50,200,100,'#333')]},{layer:1,height:22,thickness:104,solid:false,sides:'#555',steps:[rect(-100,-50,200,100,'#666')]}]},
  {name:'balcony',layers:[{layer:0,height:20.2,thickness:10,solid:false,sides:'#c00',steps:[rect(-10,50.5,20,6,'#d00')]}]}]});
 const packets=frame(),wall=fills(packets,'#555'),top=packets.findIndex(p=>p.solid?.z0===30.2);
 assert.ok(wall.length&&top>=0);
 assert.ok(top>Math.max(...wall),'the balcony\'s top, which its base (20.2) put under the storeys (22), draws over them');
});

test('a post in front of the far end of a long wall draws after it, across entities',async()=>{
 const {world,frame}=await scene();
 world.elements.createEntity({kind:'static',position:[0,0],components:[{name:'wall',layers:[{layer:0,height:0,thickness:40,solid:false,sides:'#555',steps:[rect(-400,-10,800,20,'#666')]}]}]});
 world.elements.createEntity({kind:'static',position:[380,15],components:[{name:'post',layers:[{layer:0,height:0,thickness:60,solid:false,sides:'#c00',steps:[rect(-3,-3,6,6,'#d00')]}]}]});
 const packets=frame();
 assert.ok(Math.max(...fills(packets,'#555'))<Math.min(...fills(packets,'#c00')),'its nearest point is farther from the camera than the wall\'s, yet it stands in front');
 // and behind the wall, it goes first
 const behind=await scene({camera:[0,-300]});
 behind.world.elements.createEntity({kind:'static',position:[0,0],components:[{name:'wall',layers:[{layer:0,height:0,thickness:40,solid:false,sides:'#555',steps:[rect(-400,-10,800,20,'#666')]}]}]});
 behind.world.elements.createEntity({kind:'static',position:[0,30],components:[{name:'post',layers:[{layer:0,height:0,thickness:10,solid:false,sides:'#c00',steps:[rect(-3,-3,6,6,'#d00')]}]}]});
 const back=behind.frame(),post=fills(back,'#d00');
 assert.ok(post.length===0||Math.max(...post)<Math.min(...fills(back,'#555')),'a post behind the wall (seen from the north) is under it');
});

test('a frame orders by solids after layer and depth, and leaves packets without them where they were',()=>{
 const frame=new renderFrame();frame.begin(new cameraSystem({position:[0,0],viewport:{width:100,height:100}}).getView());
 const g={type:'path',commands:[['move',0,0],['line',1,0],['line',1,1],['close']]};
 const wall=solid([[[-50,0],[50,0]]],22,126,[-60,-80,60,2]),rail=solid([[[-10,5],[10,5],[10,10],[-10,10]]],20,26,[-11,-10,11,12]);
 frame.submit({type:'shape',geometry:g,material:{fill:'#c00'},depth:20,solid:rail});
 frame.submit({type:'shape',geometry:g,material:{fill:'#555'},depth:22,solid:wall});
 frame.submit({type:'shape',geometry:g,material:{fill:'#000'},depth:30});
 frame.submit({type:'shape',geometry:g,material:{fill:'#fff'},depth:1,layer:5,solid:wall});
 assert.deepEqual(frame.finish().passes[0].packets.map(p=>p.material.fill),['#555','#c00','#000','#fff']);
});

test('a posed hand shares world occlusion with a higher-layer table and wall',async()=>{
 async function order(camera,wall){
    const {world,frame,render}=await scene({camera});
    const actor=world.elements.createEntity({kind:'character',position:[0,20],components:[
        {name:'hand',joint:'hand',layers:[{layer:0,height:0,thickness:2,solid:false,steps:[rect(-8,-8,16,16,'#e94')]}]}
    ]});
    world.rigs.createRig(actor,{definition:{joints:[{name:'hand',height:35}]},clips:[]});
    world.elements.createEntity({kind:'static',position:[0,wall?0:20],look:{layer:wall?10:1},components:[
        {name:'fixture',layers:[{layer:0,height:0,thickness:wall?85:20,solid:false,sides:'#348',steps:[rect(-25,-10,50,20,'#452')]}]}
    ]});
    try{
        const packets=frame(),hand=packets.findIndex(p=>p.solid?.z0===37),fixture=packets.flatMap((p,i)=>p.layer===(wall?10:1)&&p.solid?[i]:[]);
        assert.ok(hand>=0&&fixture.length, JSON.stringify(packets.map(p=>[p.material?.fill,p.solid?.z0,p.layer])));
        return {hand,fixture};
    }finally{render.dispose();}
 }
 const table=await order([0,300],false);
 assert.ok(table.hand>Math.max(...table.fixture),'the tabletop cannot cover the hand');
 const near=await order([0,300],true);
 assert.ok(near.hand>Math.min(...near.fixture),'the hand can draw ahead of the wall from its own side');
 const far=await order([0,-300],true);
 assert.ok(far.hand<Math.max(...far.fixture),'the opposite view can hide the hand behind the wall');
});
