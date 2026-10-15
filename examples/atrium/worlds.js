/**
 * Atrium example / world definitions: authored realms, reconstruction and state schema.
 * Directory receives factories, not these names. Lobby budgets actual procedural work.
 * Persisted data is deliberately small: light selection, crystal rotation and prop position.
 */
import { Lifetime } from '../../engine/basement/lifetime.js';
import { circleOverlapsBox } from '../../engine/basement/geometry.js';
import { buildLayout } from './layout.js';

/** Immutable-by-convention authoring profiles; runtime mutable state is created per world. */
export const PROFILES = [
  { key:'amber',name:'The Amber Atrium',stone:[0.24,0.18,0.20],trim:[0.68,0.43,0.18],floor:[0.14,0.115,0.14],
    glow:[1,0.47,0.17],window:[0.38,0.15,0.16],foliage:[0.045,0.14,0.10],height:7,ethereal:false,ambient:[0.15,0.11,0.15] },
  { key:'violet',name:'The Violet Court',stone:[0.14,0.16,0.31],trim:[0.35,0.56,0.70],floor:[0.075,0.09,0.18],
    glow:[0.24,0.58,1],window:[0.15,0.19,0.46],foliage:[0.10,0.20,0.27],height:8.5,ethereal:true,ambient:[0.09,0.11,0.26] },
];

/** Horizontal destination query shared by movement and final flit validation. */
export function legalLanding(resource, pose) {
  return Number.isFinite(pose.x) && Number.isFinite(pose.y) && pose.z >= 0 && pose.z < 0.5
    && Math.abs(pose.x)<18.3 && pose.y>-23 && pose.y<17
    && !resource.layout.colliders.some(box => circleOverlapsBox(pose.x,pose.y,0.5,box));
}

/** Apply the game-specific light selection to that world's crystal and retained light data. */
export function applyLight(resource) {
  const {state,profile,layout}=resource;
  const cool=state.cool;
  layout.crystal.shape.color=cool ? [0.25,0.62,1] : [1,0.34,0.19];
  resource.lightColors.set(cool ? [0.3,1.1,2.7] : [3,0.5,0.2],15);
  // Other light slots differ between the worlds; actor transfer never mutates their profiles.
  for(let i=0;i<8;i++)if(i!==5)resource.lightColors.set(profile.ethereal?[0.35,0.9,2.5]:[2.4,0.85,0.3],i*3);
}

/**
 * Make a factory with stable world identity across eviction/reconstruction.
 * The generator's finally cleans partial geometry and GPU leases on abort or failure.
 */
export function worldFactory(engine, profile, id) {
  return ({signal,state}) => engine.lobby.preparation.enqueue((function* () {
    const life=new Lifetime(); let complete=false;
    const world=engine.directory.adopt(engine.basement.createWorld(id));
    life.own(()=>engine.directory.releaseWorld(world.id,world));
    try {
      const saved=state ?? {version:1,cool:true,crystalYaw:0,propX:6};
      if(saved.version!==1 || typeof saved.cool!=='boolean' || !Number.isFinite(saved.crystalYaw)
        || ![-6,6].includes(saved.propX))throw new Error('Unsupported world snapshot');
      const layout=yield* buildLayout(engine,world,profile);
      layout.crystal.yaw=saved.crystalYaw; layout.prop.x=saved.propX; layout.propCollider.x=saved.propX;
      world.snapshot(); world.resolve();
      const lease=engine.directory.acquire(`batch:${world.id}`,()=>engine.basement.renderer.createBatch(world));
      life.own(lease.release);
      // Upload before readiness, so committing cannot expose collisionless placeholder art.
      engine.basement.renderer.prepare(lease.value);
      yield;
      const resource={ world,profile,layout,state:saved,batch:lease.value,
        lights:new Float32Array(32),lightColors:new Float32Array(24),
        ready:Object.freeze({geometry:true,collision:true,landing:true}),
        // Capture selected game facts, not transient actors, GPU buffers, or scene objects.
        capture:()=>({...saved,crystalYaw:layout.crystal.yaw,propX:layout.prop.x}),
        dispose:()=>life.dispose() };
      const positions=[[0,7,5,16],[-15,-4,4,12],[15,-4,4,12],[-15,9,4,12],[15,9,4,12],[0,2,3,10],[-15,-18,4,12],[15,-18,4,12]];
      positions.forEach((position,i)=>resource.lights.set(position,i*4)); applyLight(resource);
      complete=true; return resource;
    } finally { if(!complete)life.dispose(); }
  })(),{signal});
}
