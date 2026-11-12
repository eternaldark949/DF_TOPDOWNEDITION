// ===== LV0 BASEMENT =====
import {number,clone,angleDelta} from '../core/values.mjs';
import {definitionRecord} from './rig-definition.mjs';
import {name,fields} from './values.mjs';
/**
 * A run of rig joints made physical: one rigid capsule per bone, hinged to the bone before it and
 * the first to the rig's body. Each hinge's motor servoes toward the animated pose (clips, procedural
 * pose and IK): it asks for a turn rate of `follow_rate` × the angle still to go, with at most
 * `follow_torque`. So the chain follows its animation, carries its own weight down the chain, and
 * gives way when something pushes harder than its torque. The measured rotations flow back into the
 * rig. Built from bodies and hinge constraints only: it adds no solver.
 *
 * A segment body sits at its bone's midpoint, turned along the bone, so its mass swings like a limb.
 * `offset` is the bone's heading in its joint's frame; hinge angles carry it.
 */
const PACKET=['chain_id','joints','radius','mass','follow_rate','follow_torque','linear_damping','angular_damping','collision_group','collision_mask'];
const heading=(a,b)=>Math.atan2(b[1]-a[1],b[0]-a[0]);
export class physicalChain{
    #world;#owner;#controller;#authority;
    constructor(world,owner,controller,authority,packet,restored=null){
        this.#world=world;this.#owner=owner;this.#controller=controller;this.#authority=authority;
        fields(packet,PACKET);const r=definitionRecord(controller.definition);
        this.chain_id=name(packet.chain_id??'chain');
        if(!Array.isArray(packet.joints)||packet.joints.length<2||packet.joints.length>65)throw new TypeError('A physical chain takes 2..65 joints, root to tip');
        this.joints=packet.joints.map(name);
        for(const [i,id] of this.joints.entries()){if(!r.index.has(id))throw new TypeError('Unknown chain joint');if(i&&r.joints[r.index.get(id)].parent!==this.joints[i-1])throw new TypeError('Each chain joint must be the child of the one before it');}
        this.parent=r.joints[r.index.get(this.joints[0])].parent;
        this.limits=this.joints.map(id=>r.joints[r.index.get(id)].limits);
        this.config={radius:number(packet.radius??2,'chain radius',1e-3),mass:number(packet.mass??1,'segment mass',1e-6),follow_rate:number(packet.follow_rate??20,'follow rate',0),follow_torque:number(packet.follow_torque??1e5,'follow torque',0),
            linear_damping:number(packet.linear_damping??2,'segment linear damping',0),angular_damping:number(packet.angular_damping??2,'segment angular damping',0),
            collision_group:packet.collision_group??null,collision_mask:packet.collision_mask??null};
        if(restored){Object.assign(this,{segments:restored.segments.map(id=>this.#world.fetchBody(id)),hinges:restored.hinges.map(id=>this.#world.getConstraint(id)),lengths:[...restored.lengths],offsets:[...restored.offsets]});
            if(this.segments.some(b=>!b)||this.hinges.some(c=>!c))throw new TypeError('Saved chain parts are missing');return;}
        const root=this.#root(),points=this.joints.map(id=>controller.getAnimatedJoint(id,{root}));
        this.lengths=[];this.offsets=[];this.segments=[];
        for(let k=0;k<points.length-1;k++){
            const a=points[k].position,b=points[k+1].position,length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<1e-6)throw new TypeError('A chain bone needs length');
            const rotation=heading(a,b);this.lengths.push(length);this.offsets.push(angleDelta(points[k].rotation,rotation));
            this.segments.push(this.#world.createBody({physics_type:'rigid',position:[(a[0]+b[0])/2,(a[1]+b[1])/2],rotation,mass:this.config.mass,linear_damping:this.config.linear_damping,angular_damping:this.config.angular_damping,
                collision_shape:{shape_type:'capsule',radius:this.config.radius,points:[[-length/2,0],[length/2,0]]},
                ...(this.config.collision_group===null?{}:{collision_group:this.config.collision_group}),...(this.config.collision_mask===null?{}:{collision_mask:this.config.collision_mask}),
                tags:['rig_segment']}));
        }
        const ids=[owner.id,...this.segments.map(b=>b.body_id)];
        for(const body of this.segments)this.#world.updateBody(body,{collision_exclusions:ids.filter(id=>id!==body.body_id)});
        this.hinges=this.segments.map((body,k)=>this.#world.createConstraint({constraint_type:'hinge',body_a:body,body_b:k?this.segments[k-1]:owner.handle,local_anchor_a:[-this.lengths[k]/2,0],...this.#drive(k)}));
    }
    #root(){return {position:[...this.#owner.position],rotation:this.#owner.rotation};}
    #angle(k){const turn=body=>this.#world._record(body).rotation;return k?angleDelta(turn(this.segments[k-1]),turn(this.segments[k])):angleDelta(this.#owner.rotation,turn(this.segments[0]));}
    /** Hinge k's anchor on its parent body, servo and limits, from the animated pose. */
    #drive(k){
        const {follow_rate,follow_torque:max_torque}=this.config,local=this.#controller.getAnimatedPose()[this.joints[k]].rotation;
        const shift=k?this.offsets[k]-this.offsets[k-1]:this.offsets[0]+(this.parent===null?0:this.#controller.getAnimatedJoint(this.parent).rotation);
        const anchor=k?[this.lengths[k-1]/2,0]:this.#controller.getAnimatedJoint(this.joints[0]).position,limit=this.limits[k];
        // Hinge angles are wrapped to (-π, π]; a joint limit is carried into that range, and the rig's own limit clamps the rest.
        const wrap=v=>Math.max(-Math.PI,Math.min(Math.PI,v)),near=angleDelta(0,shift),[min_rotation,max_rotation]=limit?[wrap(limit.min_rotation+near),wrap(limit.max_rotation+near)]:[-Math.PI,Math.PI];
        return {local_anchor_b:anchor,target_rotation:local+shift,motor_speed:this.hinges?angleDelta(this.#angle(k),local+shift)*follow_rate:0,max_torque,min_rotation:Math.min(min_rotation,max_rotation),max_rotation};
    }
    /** Before a step: retarget every hinge at the pose the animation wants now. */
    _drive(){for(let k=0;k<this.hinges.length;k++)this.#world.setConstraintMotor(this.hinges[k],this.#drive(k));}
    /** After a step: the joints' local rotations as the bodies hold them. The tip joint keeps its animation. */
    _measure(){
        const out={};
        for(let k=0;k<this.segments.length;k++){
            const relative=this.#angle(k);
            const shift=k?this.offsets[k]-this.offsets[k-1]:this.offsets[0]+(this.parent===null?0:this.#controller.getAnimatedJoint(this.parent).rotation);
            out[this.joints[k]]=relative-shift;
        }
        return out;
    }
    owns(body_id){return this.segments.some(b=>b.body_id===body_id);}
    _remove(){for(const body of this.segments)if(this.#world.fetchBody(body.body_id))this.#world.removeBody(body);}
    getState(){return {chain_id:this.chain_id,joints:[...this.joints],segments:this.segments.map(b=>b.body_id),hinges:this.hinges.map(c=>c.constraint_id)};}
    _saveState(){return {packet:{chain_id:this.chain_id,joints:[...this.joints],...clone(this.config)},segments:this.segments.map(b=>b.body_id),hinges:this.hinges.map(c=>c.constraint_id),lengths:[...this.lengths],offsets:[...this.offsets]};}
}
