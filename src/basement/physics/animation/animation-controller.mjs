import {clone,number} from '../core/values.mjs';
import {rigPose} from './rig-pose.mjs';
import {animationClip,clipRecord} from './animation-clip.mjs';
import {name,fields,blendTransform} from './values.mjs';
/** Evaluates clips and procedural overlays. Owned rigs are advanced only by their world. */
export class animationController {
    #pose;#clips=new Map();#layers=new Map();#overlay={};#paused=false;#guard;#authority;#rest;#revision=0;#rootGuard;
    constructor({definition,clips=[],guard=()=>{},authority,root_motion_guard=()=>{}}={}){
        this.#pose=new rigPose(definition);this.#rest=this.#pose.getLocalPose();this.#guard=guard;this.#authority=authority;this.#rootGuard=root_motion_guard;
        for(const clip of clips)this.addClip(clip);
    }
    get revision(){return this.#revision;}
    get definition(){return this.#pose.definition;}
    addClip(packet){
        this.#guard();const clip=packet instanceof animationClip?packet:new animationClip(packet);
        if(this.#clips.has(clip.clip_id))throw new TypeError('Duplicate animation clip');
        const names=new Set(this.definition.getJointNames());
        if(clipRecord(clip).tracks.some(track=>!names.has(track.joint)))throw new TypeError('Animation references an unknown joint');
        this.#clips.set(clip.clip_id,clip);return this;
    }
    play(clip_id,{layer='base',fade=0,weight=1,speed=1,additive=false,mask=null,restart=false,distance_per_cycle=null,root_motion=false}={}){
        this.#guard();name(layer);const clip=this.#clips.get(name(clip_id));if(!clip)throw new TypeError('Unknown animation clip');
        number(fade,'fade seconds',0,60);number(weight,'layer weight',0,1);number(speed,'animation speed',0,16);
        if(typeof additive!=='boolean'||typeof restart!=='boolean')throw new TypeError('Invalid animation flags');
        if(typeof root_motion!=='boolean'||root_motion&&(layer!=='base'||distance_per_cycle!==null||!clipRecord(clip).root_motion))throw new TypeError('Root motion needs a base-layer root track and a time clock');
        if(distance_per_cycle!==null)number(distance_per_cycle,'distance per cycle',1e-5);
        if(mask!==null&&(!Array.isArray(mask)||mask.some(id=>!this.definition.getJointNames().includes(id))||new Set(mask).size!==mask.length))throw new TypeError('Invalid joint mask');
        if(root_motion)this.#rootGuard();
        const previous=this.#layers.get(layer);
        if(previous?.clip_id===clip_id&&!restart)return this;
        this.#layers.set(layer,{clip_id,time:0,started:false,weight,speed,additive,mask:clone(mask),distance_per_cycle,root_motion,fade,fade_age:0,from_pose:fade?(previous&&previous.additive===additive?this.#sampleLayer(previous):additive?{}:this.#pose.getLocalPose()):null});
        this.#evaluate();return this;
    }
    stop(layer='base'){this.#guard();if(this.#layers.delete(name(layer)))this.#evaluate();return this;}
    pause(){this.#guard();this.#paused=true;return this;}
    resume(){this.#guard();this.#paused=false;return this;}
    seek(time,{layer='base'}={}){this.#guard();number(time,'seek seconds',0,1e9);const state=this.#layers.get(name(layer));if(!state)throw new TypeError('Unknown animation layer');state.time=time;state.started=true;this.#evaluate();return this;}
    setProceduralPose(pose={}){
        this.#guard();const trial=new rigPose(this.definition);trial.setPose(pose);this.#overlay=clone(pose);this.#evaluate();return this;
    }
    #sampleLayer(state){
        const target=this.#clips.get(state.clip_id).sample(state.time),t=state.fade?Math.min(1,state.fade_age/state.fade):1;
        if(!state.from_pose||t===1)return target;
        const result={};
        for(const joint of new Set([...Object.keys(state.from_pose),...Object.keys(target)])){
            const baseline=state.additive?{position:[0,0],rotation:0,scale:[1,1]}:this.#rest[joint],from=state.from_pose[joint]??{},to=target[joint]??{};
            const blended=blendTransform({...baseline,...from},{...baseline,...to},t);
            result[joint]=Object.fromEntries([...new Set([...Object.keys(from),...Object.keys(to)])].map(channel=>[channel,blended[channel]]));
        }
        return result;
    }
    #evaluate(){
        this.#pose.resetPose();
        for(const state of this.#layers.values())this.#pose.setPose(this.#sampleLayer(state),{weight:state.weight,mask:state.mask,additive:state.additive});
        this.#pose.setPose(this.#overlay);this.#revision++;
    }
    advance(seconds,{distance=0}={},authority){
        this.#guard();if(this.#authority!==undefined&&authority!==this.#authority)throw new Error('Only the owning world may advance this rig');
        number(seconds,'animation step',0,.1);number(distance,'travel distance',0);if(this.#paused||!seconds)return [];
        const events=[],next=new Map();
        for(const [layer,state] of this.#layers){
            const clip=this.#clips.get(state.clip_id),r=clipRecord(clip),delta=(state.distance_per_cycle===null?seconds:distance/state.distance_per_cycle*clip.duration)*state.speed,end=state.time+delta;
            number(end,'animation clock',0,1e9);
            // Bound pathological authored clips/speeds without partially advancing layers.
            if(delta&&r.markers.length&&delta/r.duration*r.markers.length>4096)throw new RangeError('Animation marker budget exceeded');
            for(const marker of r.markers){
                const first=r.loop?Math.max(0,Math.ceil((state.time-marker.time)/r.duration)):0;
                const last=r.loop?Math.floor((end-marker.time)/r.duration):0;
                for(let cycle=first;cycle<=last;cycle++){
                    const at=marker.time+cycle*r.duration;
                    if(at>end||at<state.time||at===state.time&&(state.started||delta===0))continue;
                    events.push({_offset:delta?(at-state.time)/delta*seconds:0,layer,clip_id:clip.clip_id,name:marker.name,time:at,data:clone(marker.data)});
                }
            }
            next.set(layer,{...state,time:r.loop?end:Math.min(end,r.duration),started:state.started||delta>0,fade_age:Math.min(state.fade,state.fade_age+seconds)});
        }
        events.sort((a,b)=>a._offset-b._offset);this.#layers=next;this.#evaluate();return events.map(({_offset,...event})=>event);
    }
    getRootMotion(seconds){
        number(seconds,'root motion step',0,.1);const state=this.#layers.get('base');
        if(!state?.root_motion||this.#paused)return null;
        return this.#clips.get(state.clip_id).getRootMotion(state.time,state.time+seconds*state.speed);
    }
    getJoint(id,options){return this.#pose.getJoint(id,options);}
    getAnchor(id,options){return this.#pose.getAnchor(id,options);}
    getPose(){return this.#pose.getLocalPose();}
    getState(){return {paused:this.#paused,layer_order:[...this.#layers.keys()],layers:Object.fromEntries([...this.#layers].map(([key,state])=>[key,clone(state)]))};}
    getSnapshot(){return {format_version:1,definition:this.definition.toJSON(),clips:[...this.#clips.values()].map(clip=>clip.toJSON()),...this.getState(),procedural_pose:clone(this.#overlay)};}
    load(snapshot){
        this.#guard();fields(snapshot,['format_version','definition','clips','paused','layers','layer_order','procedural_pose']);
        if(snapshot.format_version!==1||typeof snapshot.paused!=='boolean'||!snapshot.layers||typeof snapshot.layers!=='object'||Array.isArray(snapshot.layers))throw new TypeError('Invalid animation snapshot');
        if(this.#authority!==undefined&&JSON.stringify(snapshot.definition)!==JSON.stringify(this.definition.toJSON()))throw new TypeError('Cannot replace an owned rig definition');
        const trial=new animationController({definition:snapshot.definition,clips:snapshot.clips});
        const order=snapshot.layer_order??Object.keys(snapshot.layers);
        if(!Array.isArray(order)||order.length!==Object.keys(snapshot.layers).length||new Set(order).size!==order.length||order.some(layer=>typeof layer!=='string'||!Object.hasOwn(snapshot.layers,layer)))throw new TypeError('Invalid animation layer order');
        for(const layer of order){
            const state=snapshot.layers[layer];
            fields(state,['clip_id','time','started','weight','speed','additive','mask','distance_per_cycle','fade','fade_age','from_pose','root_motion']);
            trial.play(state.clip_id,{...Object.fromEntries(['weight','speed','additive','mask','distance_per_cycle','fade','root_motion'].map(key=>[key,state[key]])),layer});
            number(state.time,'saved animation time',0,1e9);number(state.fade_age,'saved fade age',0,state.fade);if(typeof state.started!=='boolean')throw new TypeError('Invalid marker cursor');
            if(state.from_pose!==null){const pose=new rigPose(trial.definition);pose.setPose(state.from_pose);}
            trial.#layers.set(layer,clone(state));
        }
        trial.setProceduralPose(snapshot.procedural_pose);trial.#paused=snapshot.paused;trial.#evaluate();
        if(trial.#layers.get('base')?.root_motion)this.#rootGuard();
        this.#pose=trial.#pose;this.#rest=trial.#rest;this.#clips=trial.#clips;this.#layers=trial.#layers;this.#overlay=trial.#overlay;this.#paused=trial.#paused;this.#revision++;return this;
    }
}
