/**
 * Penthouse / data-driven part assembly. No editor or game knowledge.
 * Each authored part becomes one world entity under the asset's root, parent before child.
 * A part's shape is either a box (`size` in metres) or, from project schema v4, a mesh
 * (`mesh` names an authored mesh asset and `size` scales its frame per axis). Meshes are
 * resolved through the scene's injected AuthoredMeshes; a skinned mesh gives its entity a
 * fresh SkeletonPose at rest, which the scene instance poses from authored `poses`.
 */
import { SkeletonPose } from '../basement/skeleton.js';

/** Explicit generator versions available to project/build validation; no allocation here. */
export const ASSEMBLY_GENERATORS=Object.freeze({'toy.assembly':1});

/** Build one asset's parts into `world`. `meshes` is required only when a part names a mesh. */
export function assembly({world,asset,materials,meshes=null}){
 const root=world.create(),parts=[];
 for(const part of asset.parts){
  const [x,y,z]=part.position;
  let shape=null,skin=null;
  if(part.shape){
   shape={...part.shape,size:[...part.shape.size],material:materials.get(part.shape.material)};
   if(part.shape.mesh!==undefined){
    if(!meshes)throw new Error(`Part ${part.id} names mesh ${part.shape.mesh}, but this scene has no mesh provider`);
    shape.mesh=meshes.get(part.shape.mesh);
    if(shape.mesh.skinned)skin=new SkeletonPose(shape.mesh.skeleton);
   }
  }
  parts.push(world.create({parent:part.parent===null?root:parts[part.parent],x,y,z,rotation:part.rotation,shape,skin}));
 }
 return {root,parts};
}
