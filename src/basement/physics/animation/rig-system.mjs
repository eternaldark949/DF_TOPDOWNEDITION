import {characterMotor} from '../motors/character.mjs';
import {number,clone} from '../core/values.mjs';
import {referenceBody} from '../spatial/queries.mjs';
import {animationController} from './animation-controller.mjs';
import {rigPose} from './rig-pose.mjs';
import {fields,name,inverse,multiply,describe} from './values.mjs';
/** Body-owned animation service. No joint bodies, extra clock, or spatial index. */
export class rigSystem {
    #world;#rigs=new Map();#authority=Symbol('world rig clock');#guard=()=>{};
    constructor(world){this.#world=world;}
    _setGuard(guard){this.#guard=guard;}
    #record(body){return this.#world._record(referenceBody(body));}
    createRig(body,{definition,clips=[]}={}){
        this.#guard();const record=this.#record(body);if(this.#rigs.has(record.id))throw new Error('Body already owns a rig');
        const entry={record,controller:null,previous:null};
        const guard=()=>{this.#guard();this.#record(record.handle);if(entry.controller&&this.#rigs.get(record.id)!==entry)throw new Error('Rig was removed');};
        entry.controller=new animationController({definition,clips,authority:this.#authority,guard,root_motion_guard:()=>{if(!(record.motor instanceof characterMotor)||record.parent_mount)throw new Error('Root motion requires an unmounted character motor');}});
        entry.previous=entry.controller.getPose();this.#rigs.set(record.id,entry);return entry.controller;
    }
    getRig(body){return this.#rigs.get(this.#record(body).id)?.controller??null;}
    removeRig(body){
        this.#guard();const record=this.#record(body);
        for(const child of this.#world.getAttachedBodies(record.handle))if(this.#world.getAttachmentState(child)?.rig_anchor)throw new Error('Detach rig-mounted bodies before removing the rig');
        if(record.motor?.intent?.rig_motion_owner===record.id)record.motor.cancelMovement();
        this.#rigs.delete(record.id);
    }
    #entry(body){const entry=this.#rigs.get(this.#record(body).id);if(!entry)throw new TypeError('Body has no rig');return entry;}
    #pose(entry,blend){
        number(blend,'rig blend',0,1);
        if(blend===1)return entry.controller;
        if(entry.cached_pose?.blend===blend&&entry.cached_pose.revision===entry.controller.revision)return entry.cached_pose.pose;
        const pose=new rigPose(entry.controller.definition);
        pose.setPose(entry.previous);pose.setPose(entry.controller.getPose(),{weight:blend});entry.cached_pose={blend,revision:entry.controller.revision,pose};return pose;
    }
    getPose(body,{blend=1,world_space=false,relative_to=null}={}){
        if(typeof world_space!=='boolean')throw new TypeError('world_space must be boolean');
        const entry=this.#entry(body),pose=this.#pose(entry,blend),root=world_space?entry.record.handle.getRenderState(blend):null;
        const options=root?{root:{position:root.position,rotation:root.rotation}}:undefined;
        if(relative_to!==null&&world_space)throw new TypeError('Choose world space or a relative joint');
        const relative=relative_to===null?null:inverse(pose.getJoint(relative_to).matrix),project=value=>relative?describe(multiply(relative,value.matrix)):value;
        return {rig_id:entry.controller.definition.rig_id,joints:Object.fromEntries(entry.controller.definition.getJointNames().map(id=>[id,project(pose.getJoint(id,options))])),anchors:Object.fromEntries(entry.controller.definition.getAnchorNames().map(id=>[id,project(pose.getAnchor(id,options))]))};
    }
    getAnchor(body,anchor,{blend=1,world_space=true}={}){
        name(anchor);if(typeof world_space!=='boolean')throw new TypeError('world_space must be boolean');
        const entry=this.#entry(body),pose=this.#pose(entry,blend),root=world_space?entry.record.handle.getRenderState(blend):null;
        return pose.getAnchor(anchor,root?{root:{position:root.position,rotation:root.rotation}}:undefined);
    }
    _beforeStep(seconds){
        const requests=[];
        for(const entry of this.#rigs.values()){
            const {record,controller}=entry,motor=record.motor,delta=record.config.active&&!record.parent_mount?controller.getRootMotion(seconds):null;
            if(delta===null){if(motor?.intent?.rig_motion_owner===record.id)requests.push(()=>motor.cancelMovement());continue;}
            if(!(motor instanceof characterMotor)||record.parent_mount)throw new Error('Root motion requires an unmounted character motor');
            const distance=number(Math.hypot(...delta),'root motion distance',0),speed=number(distance/seconds,'root motion speed',0),direction=distance?delta.map(v=>v/distance):[0,0];
            requests.push(()=>motor.setMovement(direction,{space:'local',speed,rig_motion_owner:record.id}));
        }
        for(const request of requests)request();
    }
    _capturePrevious(){for(const entry of this.#rigs.values()){entry.previous=entry.controller.getPose();entry.cached_pose=null;}}
    _update(seconds){
        for(const entry of this.#rigs.values()){
            if(!entry.record.config.active)continue;
            const distance=this.#world.getBodyMotion(entry.record.handle).distance;
            for(const marker of entry.controller.advance(seconds,{distance},this.#authority))this.#world._emit('animationMarker',{body:entry.record.handle,...marker});
        }
    }
    _bodyRemoved(id){this.#rigs.delete(id);}
    _clear(){this.#rigs.clear();}
    _saveState(){return [...this.#rigs.values()].map(entry=>({body_id:entry.record.id,animation:entry.controller.getSnapshot(),previous:clone(entry.previous)}));}
    _loadState(entries=[]){
        if(!Array.isArray(entries))throw new TypeError('Invalid saved rigs');
        for(const saved of entries){
            fields(saved,['body_id','animation','previous']);const controller=this.createRig(saved.body_id,{definition:saved.animation?.definition,clips:saved.animation?.clips});controller.load(saved.animation);
            const pose=new rigPose(controller.definition);pose.load({format_version:1,rig_id:controller.definition.rig_id,locals:saved.previous});this.#entry(saved.body_id).previous=pose.getLocalPose();
        }
    }
}
