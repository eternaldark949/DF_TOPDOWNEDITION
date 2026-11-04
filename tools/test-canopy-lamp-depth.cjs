'use strict';
const assert=require('node:assert/strict');
const {join}=require('node:path');
const {runtime}=require('./test-game-runtime.cjs');
const e=runtime(join(__dirname,'..','DFAB V8.html'),{affine:true});
const r=e.run(`(()=>{
 const ctx=game.ctx;game.camera={x:0,y:0,zoom:1};_sunShadow.on=true;
 const tree=new Foliage(220,0,'tree',1.7),lamp=new LampEntity({x:245,y:5,lampType:2});
 const record=(reverse)=>{
  const events=[];FoliageLampDepth.begin(ctx);
  const add=FoliageLampDepth.add;
  let owner='';
  // Capture the owner in each deferred closure independently.
  FoliageLampDepth.add=function(c,z,paint){const tag=owner;return add.call(this,c,z,()=>{events.push({z,owner:tag});paint();});};
  const t=()=>{owner='tree';tree.draw(ctx,0,1,5);},l=()=>{owner='lamp';lamp.draw(ctx,1);};
  if(reverse){l();t();}else{t();l();}
  FoliageLampDepth.add=add;
  const pending=FoliageLampDepth.parts.length;
  FoliageLampDepth.flush(ctx);
  return {events,pending,remaining:FoliageLampDepth.parts.length,active:FoliageLampDepth.ctx!==null};
 };
 const a=record(false),b=record(true),m=ctx.getTransform();
 let immediate=false;FoliageLampDepth.add(ctx,0,()=>immediate=true);
 let threw=false;FoliageLampDepth.begin(ctx);FoliageLampDepth.add(ctx,1,()=>{ctx.translate(5,6);throw Error('probe');});
 try{FoliageLampDepth.flush(ctx);}catch(e){threw=true;}
 return {a,b,immediate,threw,restored:ctx.getTransform().e===m.e&&ctx.getTransform().f===m.f,empty:FoliageLampDepth.parts.length===0};
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
