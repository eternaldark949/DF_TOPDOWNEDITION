/** Basement / assembly bounds: placement and framing share the actual local part transforms. */
import { rotateVector, multiplyRotation } from './rotation.js';
/** Return full local AABB, including nested quaternion attachments. No temporary World/IDs.
 * Mesh parts (schema v4) need `meshBounds(id)` → the mesh's rest {min,max} in its own frame,
 * scaled here by shape.size; without it a mesh part is treated as a unit-scaled box, which
 * is only right for meshes authored inside ±0.5 m. Posed joints do not change these bounds. */
export function assetBounds(asset,meshBounds=null){
 const poses=[],min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(const part of asset.parts){
  const parent=part.parent===null?null:poses[part.parent],position=[...part.position],rotation=part.rotation.map(n=>n/Math.hypot(...part.rotation));
  if(parent){rotateVector(parent.rotation,...position,position);for(let i=0;i<3;i++)position[i]+=parent.position[i];multiplyRotation(parent.rotation,rotation,rotation);}
  poses.push({position,rotation});if(!part.shape)continue;
  const s=part.shape.size,b=part.shape.mesh!==undefined&&meshBounds?meshBounds(part.shape.mesh):{min:[-0.5,-0.5,-0.5],max:[0.5,0.5,0.5]};
  for(const x of [0,1])for(const y of [0,1])for(const z of [0,1]){
   const p=[0,0,0];rotateVector(rotation,(x?b.max[0]:b.min[0])*s[0],(y?b.max[1]:b.min[1])*s[1],(z?b.max[2]:b.min[2])*s[2],p);
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
  if(!entity.shape||entity.pose.visible===false||(ids&&!ids.has(entity.id)))continue;
  // Boxes span ±size/2; meshes span their rest bounds scaled by size (not the posed skin).
  const p=entity.pose,s=entity.shape.size,b=entity.shape.mesh?.data.bounds??{min:[-0.5,-0.5,-0.5],max:[0.5,0.5,0.5]};
  for(const x of [0,1])for(const y of [0,1])for(const z of [0,1]){
   rotateVector(p.rotation,(x?b.max[0]:b.min[0])*s[0]*p.scale,(y?b.max[1]:b.min[1])*s[1]*p.scale,(z?b.max[2]:b.min[2])*s[2]*p.scale,v);
   for(const [i,key]of ['x','y','z'].entries()){min[i]=Math.min(min[i],p[key]+v[i]);max[i]=Math.max(max[i],p[key]+v[i]);}
  }
 }
 return Number.isFinite(min[0])?{min,max}:null;
}
