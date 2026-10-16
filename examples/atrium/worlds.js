/**
 * Atrium example / world definitions: authored realms, reconstruction and state schema.
 * Directory receives factories, not these names. Lobby budgets actual procedural work.
 * Persisted data is deliberately small: light selection, crystal rotation and prop position.
 */
import { ATRIUM_PROJECT } from './project.js';
import { Lifetime } from '../../engine/basement/lifetime.js';
import { circleOverlapsBox } from '../../engine/basement/geometry.js';
import { buildLayout } from './layout.js';

/** Immutable-by-convention authoring profiles; runtime mutable state is created per world. */
export const PROFILES = ATRIUM_PROJECT.scenes;

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
  const variant=profile.lightVariants[cool?'cool':'warm'];
  layout.crystal.shape.color=[...variant.crystal];
  resource.lightColors.set(variant.irradiance,15);
}

/**
 * Make a factory with stable world identity across eviction/reconstruction.
 * The generator's finally cleans partial geometry and GPU leases on abort or failure.
 */
export function worldFactory(engine, profile, id, project=ATRIUM_PROJECT) {
  return ({signal,state}) => engine.lobby.preparation.enqueue((function* () {
    const life=new Lifetime(); let complete=false;
    const world=engine.directory.adopt(engine.basement.createWorld(id));
    life.own(()=>engine.directory.releaseWorld(world.id,world));
    try {
      const saved=state ?? {version:1,cool:true,crystalYaw:0,propX:profile.entities.find(e=>e.tag==='prop').position[0]};
      if(saved.version!==1 || typeof saved.cool!=='boolean' || !Number.isFinite(saved.crystalYaw)
        || !Number.isFinite(saved.propX))throw new Error('Unsupported world snapshot');
      const layout=yield* buildLayout(engine,world,profile,project);
      layout.crystal.yaw=saved.crystalYaw; layout.prop.x=saved.propX; layout.propCollider.x=saved.propX;
      world.snapshot(); world.resolve();
      const lease=engine.directory.acquire(`batch:${world.id}`,()=>engine.basement.renderer.createBatch(world),{owner:`realm:${profile.key}/${world.id}`});
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
      profile.lights.forEach((light,i)=>{resource.lights.set([...light.position,light.radius],i*4);resource.lightColors.set(light.color,i*3);});
      complete=true; return resource;
    } finally { if(!complete)life.dispose(); }
  })(),{signal,label:`world.build.${profile.key}`});
}
