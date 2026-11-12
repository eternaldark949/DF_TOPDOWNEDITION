// ===== LV0 BASEMENT =====
import {clone,freeze,number,vector,angleDelta} from '../core/values.mjs';
import {name,fields} from './values.mjs';
const records=new WeakMap();
const channels=['position','rotation','scale'];
function portable(value,seen=new Set(),depth=0){
    if(depth>64)throw new TypeError('Marker data is too deep');
    if(value===null||typeof value==='string'||typeof value==='boolean')return;
    if(typeof value==='number'){number(value,'marker data');return;}
    if(typeof value!=='object'||seen.has(value)||!Array.isArray(value)&&Object.getPrototypeOf(value)?.constructor?.name!=='Object'&&Object.getPrototypeOf(value)!==null)throw new TypeError('Marker data must be portable JSON');
    seen.add(value);for(const child of Array.isArray(value)?value:Object.values(value))portable(child,seen,depth+1);seen.delete(value);
}
function keys(input,channel,duration){
    if(!Array.isArray(input)||!input.length)throw new TypeError('A track needs keyframes');
    let previous=-1;
    return input.map(key=>{
        fields(key,['time','value','interpolation']);
        const time=number(key.time,'key time',0,duration),interpolation=key.interpolation??'linear';
        if(time<=previous||!['linear','hold','smooth'].includes(interpolation))throw new TypeError('Invalid keyframe order/interpolation');
        previous=time;
        const value=channel==='rotation'?number(key.value,'rotation'):vector(key.value,'key value');
        if(channel==='scale'&&value.some(v=>v<=1e-7))throw new TypeError('Animation scale must be positive');
        return {time,value,interpolation};
    });
}
function sample(track,time){
    const list=track.keys;
    if(time<=list[0].time)return clone(list[0].value);
    if(time>=list.at(-1).time)return clone(list.at(-1).value);
    let low=0,high=list.length-1;
    while(high-low>1){const mid=(low+high)>>1;if(list[mid].time<=time)low=mid;else high=mid;}
    const a=list[low],b=list[high];let t=(time-a.time)/(b.time-a.time);
    if(a.interpolation==='hold')t=0;else if(a.interpolation==='smooth')t=t*t*(3-2*t);
    return track.channel==='rotation'?a.value+angleDelta(a.value,b.value)*t:a.value.map((v,i)=>v+(b.value[i]-v)*t);
}
/** Immutable, renderer-independent authored local transform tracks. Seconds and radians. */
export class animationClip {
    constructor(packet){
        fields(packet,['clip_id','duration','loop','tracks','markers','root_motion']);
        const clip_id=name(packet.clip_id),duration=number(packet.duration,'clip duration',1e-5,3600),loop=packet.loop??true;
        if(typeof loop!=='boolean'||!Array.isArray(packet.tracks))throw new TypeError('Invalid animation clip');
        const seen=new Set(),tracks=packet.tracks.map(track=>{
            fields(track,['joint','channel','keys']);const joint=name(track.joint),channel=track.channel,key=joint+'/'+channel;
            if(!channels.includes(channel)||seen.has(key))throw new TypeError('Invalid or duplicate animation track');
            seen.add(key);return {joint,channel,keys:keys(track.keys,channel,duration)};
        });
        if(!Array.isArray(packet.markers??[]))throw new TypeError('Invalid animation markers');
        const markers=(packet.markers??[]).map(marker=>{
            fields(marker,['name','time','data']);
            // Only portable JSON data enters an authored event payload.
            const data=marker.data??null;
            portable(data);const json=JSON.stringify(data);
            return {name:name(marker.name),time:number(marker.time,'marker time',0,duration),data:JSON.parse(json)};
        }).sort((a,b)=>a.time-b.time);
        const root_motion=packet.root_motion==null?null:{channel:'position',keys:keys(packet.root_motion,'position',duration)};
        records.set(this,freeze({clip_id,duration,loop,tracks,markers,root_motion}));Object.freeze(this);
    }
    get clip_id(){return records.get(this).clip_id;}
    get duration(){return records.get(this).duration;}
    get loop(){return records.get(this).loop;}
    toJSON(){const r=records.get(this);return clone({...r,root_motion:r.root_motion?.keys??null});}
    getRootMotion(from,to){
        number(from,'root motion start',0,1e9);number(to,'root motion end',from,1e9);
        const r=records.get(this);if(!r.root_motion)return [0,0];
        const first=sample(r.root_motion,0),last=sample(r.root_motion,r.duration);
        const at=time=>{const cycles=r.loop?Math.floor(time/r.duration):0,local=r.loop?time%r.duration:Math.min(time,r.duration),point=sample(r.root_motion,local);return point.map((v,i)=>v+cycles*(last[i]-first[i]));};
        const a=at(from),b=at(to);return b.map((v,i)=>v-a[i]);
    }
    sample(time){
        number(time,'sample time',0);
        const r=records.get(this),local=r.loop?time%r.duration:Math.min(time,r.duration),pose={};
        for(const track of r.tracks)(pose[track.joint]??={})[track.channel]=sample(track,local);
        return pose;
    }
}
export const clipRecord=clip=>{const r=records.get(clip);if(!r)throw new TypeError('Expected animationClip');return r;};
