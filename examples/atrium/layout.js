/** Atrium / map generic document instances to this game's named interaction targets. */
import { SceneInstance } from '../../engine/directory/scene-instance.js';
import { ATRIUM_PROJECT } from './project.js';
export function* buildLayout(engine,world,profile,project=ATRIUM_PROJECT){
 const instance=yield* SceneInstance.prepare(engine.directory,world,project,profile);
 const lantern=profile.entities.find(e=>e.tag==='lantern'),prop=profile.entities.find(e=>e.tag==='prop');
 return {instance,colliders:instance.colliders,crystal:instance.part(lantern.id,'crystal'),prop:instance.root(prop.id),propCollider:instance.instances.get(prop.id).colliders[0]};
}
