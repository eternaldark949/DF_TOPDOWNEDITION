/** Atrium source of truth: portable JSON; behavior stays in the example's JavaScript. */
import data from './project.json' with {type:'json'};
import { validateProject } from '../../engine/basement/project.js';
import { ASSEMBLY_GENERATORS } from '../../engine/penthouse/assembly.js';
/** Resolve authored generator identities against the libraries this example actually installs. */
export function validateAtriumProject(project){validateProject(project,{generators:ASSEMBLY_GENERATORS});
 // This application's injected Play behavior requires these explicit content conventions.
 // Generic schema and scene-instantiation mechanisms do not know the Atrium's names.
 for(const scene of project.scenes){
  const prop=scene.entities.filter(e=>e.tag==='prop'),lantern=scene.entities.filter(e=>e.tag==='lantern');
  if(prop.length!==1||lantern.length!==1)throw new Error(`${scene.id}: Atrium Play needs one prop and one lantern tag`);
  const propAsset=project.assets.find(a=>a.id===prop[0].asset),lampAsset=project.assets.find(a=>a.id===lantern[0].asset);
  if(!propAsset.colliders.length||!lampAsset.parts.some(p=>p.id==='crystal'&&p.shape))throw new Error(`${scene.id}: missing prop collision or crystal part`);
  if(!scene.lightVariants?.cool||!scene.lightVariants?.warm)throw new Error(`${scene.id}: missing cool/warm light variants`);
 }
 return project;}
export const ATRIUM_PROJECT=validateAtriumProject(data);

/** Unique diagnostic interaction roles stay with their original instance when copied. */
export function cloneAtriumEntity(entity){if(['prop','lantern'].includes(entity.tag))entity.tag=null;return entity;}
/** Preserve the two interaction anchors required by this example's injected game behavior. */
export function canRemoveAtriumEntity(entity){return !entity.locked&&!['prop','lantern'].includes(entity.tag);}
