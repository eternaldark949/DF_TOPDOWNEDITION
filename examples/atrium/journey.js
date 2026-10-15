/**
 * Atrium example / journey: game-specific realm links, initial actor and prewarming policy.
 * Loading/lifetime algorithms live in Directory; transaction scheduling lives in Lobby.
 * This module chooses the destination and asks for those mechanisms through public contracts.
 */
import { Lifetime } from '../../engine/basement/lifetime.js';
import { WorldTravel } from '../../engine/lobby/travel.js';
import { PROFILES, worldFactory, legalLanding, applyLight } from './worlds.js';

/** Own the two realm definitions and their tickets for one example session. */
export function createJourney(engine) {
  const life=new Lifetime(),{directory,basement,lobby}=engine,residency=directory.residency;
  const session=basement.identities.create('journey');
  const keys=PROFILES.map(profile=>`${session}:${profile.key}`);
  // Register cleanup before acquisitions: release tickets before removing definitions.
  for(let i=0;i<keys.length;i++){
    residency.register(keys[i],worldFactory(engine,PROFILES[i],basement.identities.create('world')));
    life.own(()=>residency.unregister(keys[i]));
  }
  let travel=null,actor=null,warm=null,disposed=false;
  const initial=residency.prepare(keys[0]); life.own(()=>initial.release());

  /** Prewarm the only linked neighbor. A ticket, not a permanent hidden reference, pins it. */
  function prewarm() {
    warm?.release();
    const other=keys.find(key=>key!==travel.current.key);
    warm=residency.prepare(other);
    warm.ready.catch(error=>{if(error.name!=='AbortError'&&!disposed)message=error.message;});
  }
  let message='Preparing the first world';
  const ready=initial.ready.then(()=>{
    if(disposed)return;
    const resource=initial.value;
    actor=directory.create('toy.actor',{world:resource.world});actor.root.y=-8;
    resource.world.snapshot();
    travel=new WorldTravel({residency,initial,root:actor.root});
    life.own(()=>travel.dispose());
    life.own(lobby.on('boundary',time=>travel.advance(time),'world.transfer'));
    life.own(travel.onCommit(()=>{
      // Destination's active ticket replaces its warm pin. The departed world becomes
      // an unpinned cache entry, allowing explicit trimming or future LRU eviction.
      warm?.release();warm=null;message='Flit complete';
    }));
    prewarm();message='Ready to flit';
  });
  // Disposal order: cancel the warm ticket, release travel/initial pins, then definitions.
  life.own(()=>{warm?.release();warm=null;});

  return {
    ready,keys,
    get actor(){return actor;},
    get travel(){return travel;},
    get current(){return travel?.current.value ?? null;},
    /** Preserve momentum/orientation in the game controller; map the current ground point directly. */
    flit(){
      if(!travel)return;
      const root=actor.root,key=keys.find(candidate=>candidate!==travel.current.key);
      travel.request(key,()=>({x:root.x,y:root.y,z:root.z,yaw:root.yaw}),(destination,pose,_root,value)=>{
        return value.world===destination && legalLanding(value,pose) ? true : 'Destination landing is blocked';
      });
    },
    /** User cancellation releases only the request; a prewarm owner may still need that world. */
    cancel(){travel?.cancel();},
    /** Release preparation/cache ownership and snapshot inactive worlds; the active pin is retained. */
    releaseInactive(){travel?.cancel();warm?.release();warm=null;residency.trim();message='Inactive geometry released; changes retained';},
    /** Change only the active world's authored state, for persistence demonstrations. */
    toggleLight(){const value=travel?.current.value;if(value){value.state.cool=!value.state.cool;applyLight(value);}},
    /** Move the example prop between two legal authored positions; refuse overlap with the actor. */
    moveProp(){
      const value=travel?.current.value;if(!value)return;
      const {prop,propCollider}=value.layout,next=prop.x===6?-6:6;
      const root=actor.root;
      if(Math.abs(root.x-next)<1.5 && Math.abs(root.y-prop.y)<1.5){message='Move away from the prop landing';return;}
      prop.x=next;propCollider.x=next;value.state.propX=next;message='Prop moved';
    },
    /** Diagnostics contain only data; UI cannot mutate residency through this copy. */
    inspect(){return {message,travel:travel?{...travel.last,...travel.stats}:null,residency:residency.inspect()};},
    /** Invalidate asynchronous completion before releasing pins and definitions. */
    dispose(){if(disposed)return;disposed=true;life.dispose();},
  };
}
