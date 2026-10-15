/** Transfer/residency boundaries: validation, asynchronous cancellation, persistence, and budgets. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { World, Identities } from '../engine/basement/world.js';
import { transferTree } from '../engine/basement/transfer.js';
import { WorldResidency } from '../engine/directory/residency.js';
import { WorldTravel } from '../engine/lobby/travel.js';
import { PreparationQueue } from '../engine/lobby/preparation.js';

/** Flush promise chains without real timers or browser frame-rate assumptions. */
const settle=()=>new Promise(resolve=>setImmediate(resolve));

/** A tiny prepared resource with real world membership and observable cleanup/state. */
function resource(id,ids,state={cool:true}){
  const world=new World(id,ids);
  return {world,state,ready:{geometry:true,collision:true,landing:true},disposed:0,
    capture:()=>state,dispose(){this.disposed++;world.dispose();}};
}

/** Deferred factory completion lets tests control the dangerous cancellation window exactly. */
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}

test('tree transfer preserves identity/attachments, resets interpolation, and publishes no partial state',()=>{
  const ids=new Identities(),source=new World('a',ids),destination=new World('b',ids);
  const actor=source.create({x:3,y:4,yaw:0.7}),bag=source.create({parent:actor,y:2}),other=source.create();
  const originalIds=[actor.id,bag.id];
  const event=transferTree({source,destination,root:actor,landing:{x:10,y:-2},validate:(world,pose)=>{
    assert.equal(source.entities.has(actor.id),true);assert.equal(world.entities.has(actor.id),false);
    return pose.x===10;
  }});
  assert.deepEqual(event.entityIds,originalIds);assert.equal(source.entities.size,1);assert.ok(source.entities.has(other.id));
  assert.equal(destination.entities.get(actor.id),actor);assert.equal(destination.entities.get(bag.id),bag);
  assert.equal(bag.parent,actor);assert.equal(actor.yaw,0.7);assert.equal(bag.worldId,'b');
  destination.resolve(0);assert.equal(actor.pose.x,10);assert.equal(actor.pose.y,-2);
  assert.equal(actor.previous.x,actor.x);assert.ok(Object.isFrozen(event));
});

test('blocked, nonfinite, foreign, duplicate and disposed destinations preserve source',()=>{
  const ids=new Identities(),source=new World('a',ids),destination=new World('b',ids),root=source.create({x:3});
  const args={source,destination,root,landing:{x:0,y:0}};
  assert.throws(()=>transferTree({...args,validate:()=> 'No support'}),/No support/);
  assert.throws(()=>transferTree({...args,landing:{x:NaN,y:0}}),/finite/);
  assert.throws(()=>transferTree({...args,destination:new World('foreign',new Identities())}),/identity domains/);
  destination.entities.set(root.id,{});assert.throws(()=>transferTree(args),/collision/);destination.entities.clear();
  destination.dispose();assert.throws(()=>transferTree(args),/disposed/);
  assert.equal(source.entities.get(root.id),root);assert.equal(root.x,3);assert.equal(root.worldId,'a');
});

test('travel waits for readiness AND boundary, revalidates, preserves source on failure, and notifies once',async()=>{
  const ids=new Identities(),residency=new WorldResidency(),a=resource('a',ids),b=resource('b',ids),pending=deferred();
  residency.register('a',()=>a);residency.register('b',()=>pending.promise);
  const initial=residency.prepare('a');await initial.ready;const root=a.world.create();
  const travel=new WorldTravel({residency,initial,root});let notifications=0,allowed=false;
  travel.onCommit(event=>{notifications++;assert.equal(root.worldId,event.destinationId);assert.equal(travel.current.value.world,b.world);});
  travel.request('b',{x:2,y:3},()=>allowed);travel.advance(1);assert.equal(root.worldId,'a');
  pending.resolve(b);await settle();assert.equal(root.worldId,'a');
  travel.advance(2);assert.equal(root.worldId,'a');assert.equal(travel.stats.failed,1);
  allowed=true;travel.request('b',{x:2,y:3},()=>allowed);await settle();assert.equal(root.worldId,'a');
  travel.advance(3);travel.advance(4);assert.equal(root.worldId,'b');assert.equal(notifications,1);
  assert.equal(travel.last.event.simulationTime,3);assert.equal(a.world.entities.size,0);
  travel.request('missing',{x:0,y:0});assert.equal(travel.stats.failed,2);assert.equal(root.worldId,'b');
  travel.dispose();residency.dispose();
});

test('cancelled late preparation cannot resurrect a record or move an actor',async()=>{
  const ids=new Identities(),residency=new WorldResidency(),a=resource('a',ids),late=resource('b',ids),work=deferred();
  residency.register('a',()=>a);residency.register('b',()=>work.promise);
  const initial=residency.prepare('a');await initial.ready;const root=a.world.create();
  const travel=new WorldTravel({residency,initial,root});travel.request('b',{x:0,y:0});await settle();
  travel.cancel();assert.equal(residency.records.size,1);work.resolve(late);await settle();
  travel.advance(2);assert.equal(root.worldId,'a');assert.equal(late.disposed,1);
  assert.equal(travel.stats.cancelled,1);assert.equal(travel.stats.failed,0);assert.equal(residency.records.size,1);
  travel.dispose();residency.dispose();
});

test('two preparation owners share work; releasing one cannot abort the other',async()=>{
  const ids=new Identities(),residency=new WorldResidency(),work=deferred(),value=resource('b',ids);let made=0,signal;
  residency.register('b',options=>{made++;signal=options.signal;return work.promise;});
  const warm=residency.prepare('b'),request=residency.prepare('b');const cancelled=assert.rejects(request.ready,/released/);
  await settle();request.release();assert.equal(signal.aborted,false);work.resolve(value);
  await warm.ready;assert.equal(warm.value,value);await cancelled;assert.equal(made,1);
  warm.release();residency.trim();assert.equal(value.disposed,1);residency.dispose();
});

test('eviction reconstructs selected state, bounds residency, and leaves no stale world resource',async()=>{
  const ids=new Identities(),residency=new WorldResidency({capacity:1});let made=0;
  residency.register('a',({state})=>{made++;return resource('a',ids,state??{cool:true,propX:6});});
  residency.register('b',()=>resource('b',ids));
  const a=residency.prepare('a');await a.ready;const first=a.value;first.state.cool=false;first.state.propX=-6;
  assert.throws(()=>residency.prepare('b'),/pinned/);a.release();
  const b=residency.prepare('b');await b.ready;assert.equal(first.disposed,1);assert.ok(residency.stats.snapshotBytes>0);
  b.release();const back=residency.prepare('a');await back.ready;const rebuilt=back.value;
  assert.deepEqual(rebuilt.state,{cool:false,propX:-6});assert.notEqual(rebuilt.world,first.world);assert.equal(made,2);
  assert.equal(residency.stats.peakResident,1);back.release();residency.unregister('a');residency.unregister('b');
  assert.equal(residency.records.size,0);assert.equal(residency.stats.snapshotBytes,0);
});

test('snapshot budget failure retains the resident world instead of destroying its changes',async()=>{
  const ids=new Identities(),residency=new WorldResidency({capacity:1,maxStateBytes:8});
  const a=resource('a',ids,{message:'longer than budget'});residency.register('a',()=>a);residency.register('b',()=>resource('b',ids));
  const ticket=residency.prepare('a');await ticket.ready;ticket.release();
  assert.throws(()=>residency.prepare('b'),/snapshot byte budget/);assert.equal(a.disposed,0);
  assert.equal(residency.records.size,1);assert.equal(residency.stats.snapshotBytes,0);residency.dispose();
});

test('failed readiness and engine shutdown release completed and late resources exactly once',async()=>{
  const ids=new Identities(),residency=new WorldResidency(),bad=resource('bad',ids),late=resource('late',ids),work=deferred();
  bad.ready.collision=false;residency.register('bad',()=>bad);residency.register('late',()=>work.promise);
  const broken=residency.prepare('bad');await assert.rejects(broken.ready,/readiness/);broken.release();assert.equal(bad.disposed,1);
  const pending=residency.prepare('late'),rejected=assert.rejects(pending.ready,/Stale/);await settle();
  residency.dispose();work.resolve(late);await rejected;pending.release();assert.equal(late.disposed,1);assert.equal(residency.records.size,0);
});

test('preparation respects step bounds, runs cancellation finally, and cleans failed chunks',async()=>{
  const queue=new PreparationQueue({now:()=>0,maxSteps:1});const controller=new AbortController();let steps=0,cleaned=0;
  const work=queue.enqueue((function*(){try{steps++;yield;steps++;yield;}finally{cleaned++;}})(),{signal:controller.signal});
  const cancelled=assert.rejects(work,/cancelled/);queue.advance();assert.equal(steps,1);controller.abort();await cancelled;
  assert.equal(cleaned,1);assert.equal(queue.jobs.size,0);
  const failed=queue.enqueue((function*(){try{throw new Error('bad chunk');}finally{cleaned++;}})());
  queue.advance();await assert.rejects(failed,/bad chunk/);assert.equal(cleaned,2);queue.dispose();
});


test('deferred landing resolver maps the moving source at commit, preserving current yaw',async()=>{
  const ids=new Identities(),residency=new WorldResidency(),a=resource('a',ids),b=resource('b',ids);
  residency.register('a',()=>a);residency.register('b',()=>b);
  const initial=residency.prepare('a');await initial.ready;const root=a.world.create({x:1});
  const travel=new WorldTravel({residency,initial,root});
  travel.request('b',actor=>({x:actor.x+10,y:actor.y,z:actor.z,yaw:actor.yaw}));
  root.x=4;root.yaw=1.5;await settle();travel.advance(1);
  assert.equal(root.x,14);assert.equal(root.yaw,1.5);travel.dispose();residency.dispose();
});

test('residency and preparation reject invalid budgets instead of silently stalling',()=>{
  assert.throws(()=>new WorldResidency({capacity:1.5}),RangeError);
  assert.throws(()=>new WorldResidency({maxStateBytes:-1}),RangeError);
  assert.throws(()=>new PreparationQueue({maxSteps:0}),RangeError);
  assert.throws(()=>new PreparationQueue({budgetMs:Infinity}),RangeError);
});


test('a boundary observer cannot change the event or turn a committed transfer into failure',async()=>{
  const ids=new Identities(),residency=new WorldResidency(),a=resource('a',ids),b=resource('b',ids);
  residency.register('a',()=>a);residency.register('b',()=>b);
  const initial=residency.prepare('a');await initial.ready;const root=a.world.create();
  const travel=new WorldTravel({residency,initial,root});
  travel.onCommit(event=>{event.destinationId='corrupt';});
  travel.request('b',{x:0,y:0});await settle();travel.advance(1);
  assert.equal(root.worldId,'b');assert.equal(travel.stats.committed,1);assert.equal(travel.stats.failed,0);
  assert.equal(travel.stats.observerErrors,1);assert.equal(travel.last.event.destinationId,'b');
  travel.dispose();assert.throws(()=>travel.onCommit(()=>{}),/disposed/);residency.dispose();
});

test('preparation stops between chunks at its time budget and reports an overlong chunk',async()=>{
  let clock=0,steps=0;
  const queue=new PreparationQueue({budgetMs:2,maxSteps:10,now:()=>clock});
  const pending=queue.enqueue((function*(){steps++;clock+=3;yield;steps++;clock+=3;yield;})());
  const cancelled=assert.rejects(pending,/cancelled/);
  queue.advance();assert.equal(steps,1);assert.equal(queue.stats.peakChunkMs,3);
  queue.advance();assert.equal(steps,2);queue.dispose();await cancelled;
});


test('readiness promises and retained released tickets cannot pin an evicted resource',async()=>{
  const ids=new Identities(),residency=new WorldResidency(),value=resource('a',ids);
  residency.register('a',()=>value);const ticket=residency.prepare('a');
  assert.equal(await ticket.ready,undefined);assert.equal(ticket.value,value);
  const record=residency.records.get('a');ticket.release();residency.trim();
  assert.equal(ticket.value,null);assert.equal(record.value,null);assert.equal(await record.promise,undefined);
  assert.equal(value.disposed,1);residency.dispose();
});

test('real world factory cancellation after batch acquisition cleans partial worlds and leases repeatedly',async()=>{
  const {Directory}=await import('../engine/directory/directory.js');
  const {Penthouse}=await import('../engine/penthouse/penthouse.js');
  const {worldFactory,PROFILES}=await import('../examples/atrium/worlds.js');
  const directory=new Directory(),identities=new Identities(),queue=new PreparationQueue({maxSteps:1,now:()=>0});
  let buffers=0;
  // GL itself is exercised by browser tests; here the renderer boundary is a disposable
  // stand-in so real game construction, Directory leases, and abort-finally can run in Node.
  const renderer={createBatch:()=>{buffers++;return{dispose:()=>buffers--};},prepare:()=>{}};
  const engine={directory,basement:{renderer,createWorld:id=>new World(id,identities)},lobby:{preparation:queue}};
  for(const[name,factory]of Object.entries(new Penthouse().libraries))directory.register(name,factory);
  directory.residency.register('realm',worldFactory(engine,PROFILES[0],'stable-realm'));
  for(let i=0;i<10;i++){
    const ticket=directory.residency.prepare('realm'),cancelled=assert.rejects(ticket.ready,/cancelled|Stale/);
    await settle();
    // Stop at the real GPU-acquisition boundary, before readiness can complete.
    for(let chunk=0;chunk<20&&!directory.resources.size;chunk++)queue.advance();
    assert.equal(directory.resources.size,1);assert.equal(directory.worlds.size,1);
    assert.equal(buffers,1);assert.equal(queue.jobs.size,1);
    ticket.release();await cancelled;
    assert.equal(directory.resources.size,0);assert.equal(directory.worlds.size,0);
    assert.equal(buffers,0);assert.equal(queue.jobs.size,0);assert.equal(directory.residency.records.size,0);
  }
  queue.dispose();directory.dispose();
});
