/** Basement / assembly bounds: placement and framing share the actual local part transforms. */
import { rotateVector, multiplyRotation } from './rotation.js';
/** Return full local AABB, including nested quaternion attachments. No temporary World/IDs. */
export function assetBounds(asset){
 const poses=[],min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(const part of asset.parts){
  const parent=part.parent===null?null:poses[part.parent],position=[...part.position],rotation=part.rotation.map(n=>n/Math.hypot(...part.rotation));
  if(parent){rotateVector(parent.rotation,...position,position);for(let i=0;i<3;i++)position[i]+=parent.position[i];multiplyRotation(parent.rotation,rotation,rotation);}
  poses.push({position,rotation});if(!part.shape)continue;
  for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1]){
   const p=[0,0,0];rotateVector(rotation,x*part.shape.size[0]/2,y*part.shape.size[1]/2,z*part.shape.size[2]/2,p);
   for(let i=0;i<3;i++){min[i]=Math.min(min[i],position[i]+p[i]);max[i]=Math.max(max[i],position[i]+p[i]);}
  }
 }
 return Number.isFinite(min[0])?{min,max}:{min:[0,0,0],max:[0,0,0]};
}

/** Bound resolved world shapes, optionally restricted to a supplied set of runtime IDs.
 * Editor guides are not World entities and cannot inflate this result. No temporary World. */
export function worldBounds(world,ids=null){
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity],v=[0,0,0];
 world.resolve();
 for(const entity of world.entities.values()){
  if(!entity.shape||(ids&&!ids.has(entity.id)))continue;
  const p=entity.pose,s=entity.shape.size;
  for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1]){
   rotateVector(p.rotation,x*s[0]*p.scale/2,y*s[1]*p.scale/2,z*s[2]*p.scale/2,v);
   for(const [i,key]of ['x','y','z'].entries()){min[i]=Math.min(min[i],p[key]+v[i]);max[i]=Math.max(max[i],p[key]+v[i]);}
  }
 }
 return Number.isFinite(min[0])?{min,max}:null;
}
