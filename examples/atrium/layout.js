/** Atrium / map generic document instances to this game's named interaction targets. */
import { createMaterial } from '../../engine/basement/material.js';
import { SceneInstance } from '../../engine/directory/scene-instance.js';
import { ATRIUM_PROJECT } from './project.js';
export function* buildLayout(engine,world,profile,project=ATRIUM_PROJECT){
 const instance=yield* SceneInstance.prepare(engine.directory,world,project,profile);
 const lantern=profile.entities.find(e=>e.tag==='lantern'),prop=profile.entities.find(e=>e.tag==='prop');
 const crystal=instance.part(lantern.id,'crystal');crystal.shape.material=createMaterial(crystal.shape.material);
 return {instance,colliders:instance.colliders,crystal,prop:instance.root(prop.id),propCollider:instance.instances.get(prop.id).colliders[0]};
}
