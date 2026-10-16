/** Penthouse / version-one data-driven box assembly. No editor or game knowledge. */
/** Explicit generator versions available to project/build validation; no allocation here. */
export const ASSEMBLY_GENERATORS=Object.freeze({'toy.assembly':1});

export function assembly({world,asset,materials}){
 const root=world.create(),parts=[];
 for(const part of asset.parts){const [x,y,z]=part.position;parts.push(world.create({parent:part.parent===null?root:parts[part.parent],x,y,z,rotation:part.rotation,shape:part.shape?{...part.shape,size:[...part.shape.size],material:materials.get(part.shape.material)}:null}));}
 return {root,parts};
}
