import {physicsSystem,rigDefinition,animationClip} from '../index.mjs';

/** A non-humanoid rig with one real physical load. No body is created for a bone. */
export function createRigExample(){
    const world=new physicsSystem();
    const base=world.createBody({mass:100,collision_mask:0});
    const load=world.createBody({mass:5,position:[20,0],collision_shape:{shape_type:'circle',radius:1}});
    const definition=new rigDefinition({
        rig_id:'crane',
        joints:[{name:'base'},{name:'boom',parent:'base'},{name:'tip',parent:'boom',position:[20,0]}],
        anchors:{hook:{joint:'tip'}}
    });
    const clip=new animationClip({
        clip_id:'swing',duration:2,
        tracks:[{joint:'boom',channel:'rotation',keys:[{time:0,value:0},{time:1,value:Math.PI/3,interpolation:'smooth'},{time:2,value:0}]}],
        markers:[{name:'apex',time:1}]
    });
    const animation=world.rigs.createRig(base,{definition,clips:[clip]});
    animation.play('swing');
    world.attachBody(load,{parent_body:base,rig_anchor:'hook',combine_mass:true});
    return {world,base,load,animation};
}
