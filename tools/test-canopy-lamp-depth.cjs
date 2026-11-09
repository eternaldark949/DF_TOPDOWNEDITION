'use strict';
const assert=require('node:assert/strict');
const {join}=require('node:path');
const {runtime}=require('./test-game-runtime.cjs');
const e=runtime(join(__dirname,'..','DFAB V8.html'),{affine:true});
const r=e.run(`(()=>{
 const ctx=game.ctx;game.camera={x:0,y:0,zoom:1};_sunShadow.on=true;
 const tree=new Foliage(220,0,'tree',1.7),lamp=new LampEntity({x:245,y:5,lampType:2});
 const record=(reverse)=>{
  FoliageLampDepth.begin(ctx);
  const Q=FoliageLampDepth.queue, owners=new Map();
  let owner='';
  // Tag each queued shape with whose it is (the queue keeps its items until the next frame).
  const t=()=>{owner='tree';const n0=Q.length;tree.draw(ctx,0,1,5);for(let i=n0;i<Q.length;i++)owners.set(Q.items[i],'tree');},
        l=()=>{owner='lamp';const n0=Q.length;lamp.draw(ctx,1);for(let i=n0;i<Q.length;i++)owners.set(Q.items[i],'lamp');};
  if(reverse){l();t();}else{t();l();}
  const pending=Q.length;
  // The depth order the queue draws in (batching moves a shape only past ones it doesn't overlap)
  const events=Q.items.slice(0,pending).sort((a,b)=>(a.z-b.z)||(a.seq-b.seq)).map(it=>({z:it.z,owner:owners.get(it)}));
  FoliageLampDepth.flush(ctx);
  return {events,pending,remaining:FoliageLampDepth.queue.length,active:FoliageLampDepth.ctx!==null};
 };
 const a=record(false),b=record(true),m=ctx.getTransform();
 let immediate=false;FoliageLampDepth.add(ctx,0,()=>immediate=true);
 let threw=false;FoliageLampDepth.begin(ctx);FoliageLampDepth.add(ctx,1,()=>{ctx.translate(5,6);throw Error('probe');});
 try{FoliageLampDepth.flush(ctx);}catch(e){threw=true;}
 return {a,b,immediate,threw,restored:ctx.getTransform().e===m.e&&ctx.getTransform().f===m.f,empty:FoliageLampDepth.queue.length===0};
})()`);
for(const run of [r.a,r.b]){
 assert.ok(run.pending>100);assert.equal(run.remaining,0);assert.equal(run.active,false);
 assert.ok(run.events.every((p,i,a)=>i===0||p.z>=a[i-1].z));
 const low=run.events.findIndex(p=>p.owner==='lamp'&&p.z<10);
 const canopy=run.events.findIndex(p=>p.owner==='tree'&&p.z>100);
 const high=run.events.findIndex(p=>p.owner==='lamp'&&p.z>140);
 assert.ok(low<canopy&&canopy<high,'Canopy covers low lamp parts but stays beneath the high lantern');
}
assert.equal(r.immediate,true);assert.equal(r.threw,true);assert.equal(r.restored,true);assert.equal(r.empty,true);
assert.deepEqual(e.errors,[]);
console.log('Canopy/lamp height order, reversed submission, standalone fallback and exception cleanup passed.');
