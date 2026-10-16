/** Penthouse / version-one data-driven box assembly. No editor or game knowledge. */
/** Explicit generator versions available to project/build validation; no allocation here. */
export const ASSEMBLY_GENERATORS=Object.freeze({'toy.assembly':1});

export function assembly({world,asset}){
 const root=world.create(),parts=[];
 for(const part of asset.parts){const [x,y,z]=part.position;parts.push(world.create({parent:part.parent===null?root:parts[part.parent],x,y,z,rotation:part.rotation,shape:part.shape?JSON.parse(JSON.stringify(part.shape)):null}));}
 return {root,parts};
}
