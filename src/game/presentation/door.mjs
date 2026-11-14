import DOOR_APPEARANCE from '../data/game-door-appearance.json' with {type:'json'};
import {artScene,rect,circle,ellipse,polygon} from '../../engine/basement/rendering/index.mjs';
export {DOOR_APPEARANCE};
/**
 * Doors drawn from their leaves' bodies, whatever their kind. A door comes from the map's
 * `getDoors()`: its opening, plus each leaf's entity. A hinged leaf is a panel turning about its pin;
 * a sliding leaf is a pane where its body is, over a track along the opening; a door with no leaves
 * is an arch (jambs, threshold and keystone). The look is game data (game-door-appearance.json),
 * with the door's authored `color` for its leaves.
 */
export function doorPresentation(door,{blend=1}={}){
 const leaves=door.leaves.filter(Boolean).map(entity=>{const pose=entity.getRenderState(blend),shape=entity.collision_shape;
  return {motion:entity.data.hinged?'hinge':'slide',position:[...pose.position],rotation:pose.rotation,closed_rotation:entity.data.closed_rotation??0,local_position:[...(shape.local_position??[0,0])],dimensions:[...shape.dimensions]};});
 const color=door.leaves.find(Boolean)?.data.appearance?.color??null;
 return {door_key:door.door_key,type:door.type,opening:structuredClone(door.opening),arch:!door.leaves.length,color,leaves};
}
function hingeLeaf(scene,leaf,look,color){
 const [lx,ly]=leaf.local_position,L=2*Math.hypot(lx,ly),t=Math.abs(lx)>=Math.abs(ly)?leaf.dimensions[1]:leaf.dimensions[0];
 const base=leaf.closed_rotation+Math.atan2(ly,lx),angle=leaf.rotation-leaf.closed_rotation;
 scene.enter({position:leaf.position});
 if(Math.abs(angle)>look.sweep_min_angle){scene.enter({},{dash:look.sweep_dash});scene.stroke([ellipse(0,0,L,L,0,base,base+angle,angle<0)],look.sweep,1);scene.leave();}
 scene.place({rotation:base+angle});
 scene.fill(rect(2,-t/2+2,L-2,t),look.shadow);
 scene.fill(rect(0,-t/2,L,t),color);
 scene.fill(rect(3,-t/2+1,L-6,1.2),look.sheen);
 scene.stroke(rect(0,-t/2,L,t),look.outline,look.outline_width);
 scene.fill(rect(L*look.handle_at,-t/2-2,5,2),look.handle);scene.fill(rect(L*look.handle_at,t/2,5,2),look.handle);
 scene.fill([circle(0,0,look.pin_radius)],look.pin);
 scene.leave();
}
function slideLeaf(scene,leaf,color){
 const [lx,ly]=leaf.local_position,[w,h]=leaf.dimensions;
 scene.enter({position:leaf.position,rotation:leaf.rotation});scene.fill(rect(lx-w/2,ly-h/2,w,h),color);scene.leave();
}
function arch(scene,{length:len,across:th},look){
 scene.fill(rect(-len/2,-th/2,len,th),look.threshold);
 scene.fill(rect(-len/2+4,-.5,len-8,1),look.inlay);
 for(const sx of [-1,1]){scene.fill(rect(sx*len/2-5,-th/2-3,10,th+6),look.jamb);scene.fill(rect(sx*len/2-5,-th/2-3,10,1.5),look.jamb_light);}
 scene.fill(polygon([[0,-th/2-4],[3,-th/2],[0,-th/2+2],[-3,-th/2]]),look.keystone);
}
/** One door's frame packets. `appearance` replaces the game's door look, part by part. */
export function createDoorPackets(packet,{appearance=DOOR_APPEARANCE,scene=new artScene()}={}){
 const look={hinge:{...DOOR_APPEARANCE.hinge,...appearance.hinge},slide:{...DOOR_APPEARANCE.slide,...appearance.slide},arch:{...DOOR_APPEARANCE.arch,...appearance.arch}};
 const {opening}=packet;
 if(packet.arch){scene.enter({position:opening.position,rotation:opening.rotation});arch(scene,opening,look.arch);scene.leave();return scene.finish();}
 for(const leaf of packet.leaves)if(leaf.motion==='slide')slideLeaf(scene,leaf,packet.color??look.slide.color);
 if(packet.leaves.some(leaf=>leaf.motion==='slide')){const {length:len,across:th}=opening;
  scene.enter({position:opening.position,rotation:opening.rotation});scene.fill(rect(-len,-th/2-1,2*len,1),look.slide.track);scene.fill(rect(-len,th/2,2*len,1),look.slide.track);scene.leave();}
 for(const leaf of packet.leaves)if(leaf.motion==='hinge')hingeLeaf(scene,leaf,look.hinge,packet.color??look.hinge.color);
 return scene.finish();
}
