/** Basement / picking: nearest ray intersection with actual oriented, uniformly scaled boxes. */
import { rotateVector } from './rotation.js';

/** Return distance along a world ray, or null. No screen-space bounding-box approximation. */
export function rayBox(ray,entity){
  const p=entity.pose,s=entity.shape;if(!s)return null;
  const origin=[0,0,0],direction=[0,0,0];rotateVector(p.rotation,ray.origin[0]-p.x,ray.origin[1]-p.y,ray.origin[2]-p.z,origin,true);rotateVector(p.rotation,...ray.direction,direction,true);
  let near=0,far=ray.maxDistance??Infinity;
  for(let i=0;i<3;i++){const h=s.size[i]*p.scale/2;if(Math.abs(direction[i])<1e-9){if(Math.abs(origin[i])>h)return null;continue;}let a=(-h-origin[i])/direction[i],b=(h-origin[i])/direction[i];if(a>b)[a,b]=[b,a];near=Math.max(near,a);far=Math.min(far,b);if(near>far)return null;}
  return near;
}

/** A caller-provided membership filter keeps editor selection independent of game content. */
export function pickWorld(world,ray,eligible=()=>true){let hit=null,distance=Infinity;for(const entity of world.entities.values()){if(!eligible(entity))continue;const t=rayBox(ray,entity);if(t!==null&&t<distance){distance=t;hit=entity;}}return hit;}
