import { GUN_MATERIALS, WEAPON_MODELS, LASER_MODULE, weaponModel } from '../data/weapon-models.mjs';

const polygon=points=>({type:'path',commands:[...points.map(([x,y],i)=>[i?'line':'move',x,y]),['close']]});
function shape(part){
    if(part.poly)return polygon(part.poly);
    if(part.dot){const [x,y,r]=part.dot;return {type:'path',commands:[['ellipse',x,y,r,r,0,0,Math.PI*2,0],['close']]};}
    const [x,y,w,h,radius]=part.rr??part.ring,raw=Array.isArray(radius)?radius:[radius??0,radius??0,radius??0,radius??0];
    const factor=Math.min(1,w/(raw[0]+raw[1]||1),h/(raw[1]+raw[2]||1),w/(raw[2]+raw[3]||1),h/(raw[3]+raw[0]||1));
    const [tl,tr,br,bl]=raw.map(r=>r*factor),commands=[['move',x+tl,y],['line',x+w-tr,y]];
    const arc=(cx,cy,r,start,end)=>{if(r)commands.push(['ellipse',cx,cy,r,r,0,start,end,0]);};
    arc(x+w-tr,y+tr,tr,-Math.PI/2,0);commands.push(['line',x+w,y+h-br]);arc(x+w-br,y+h-br,br,0,Math.PI/2);
    commands.push(['line',x+bl,y+h]);arc(x+bl,y+h-bl,bl,Math.PI/2,Math.PI);commands.push(['line',x,y+tl]);arc(x+tl,y+tl,tl,Math.PI,Math.PI*1.5);commands.push(['close']);
    return {type:'path',commands};
}
function box(part){
    const r=part.rr??part.ring;if(r)return [r[0],r[1],r[0]+r[2],r[1]+r[3]];
    if(part.dot){const [x,y,r]=part.dot;return [x-r,y-r,x+r,y+r];}
    const xs=part.poly.map(p=>p[0]),ys=part.poly.map(p=>p[1]);return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
}
function mix(a,b,t){const A=parseInt(a.slice(1),16),B=parseInt(b.slice(1),16),channel=s=>Math.round(((A>>s)&255)*(1-t)+((B>>s)&255)*t);return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;}
const gradient=(from,to,stops)=>({type:'linear',from,to,stops});
function paint(parts,offset){
    const packets=[],submit=(geometry,material,clips=[])=>packets.push({type:'shape',space:'screen',position:offset,geometry,material,clips});
    const glints=([x0,y0,x1,y1],alpha,clip)=>{
        const h=y1-y0,L=x1-x0,sk=h*.7;
        for(const [f,w,k]of [[.3,Math.min(1.6,L*.08),1],[.3,.35,.8],[.72,.5,.6]]){
            const x=x0+L*f+(k===.8?Math.min(1.6,L*.08)+.5:0);
            submit(polygon([[x+sk,y0],[x+sk+w,y0],[x+w,y1],[x,y1]]),{fill:`rgba(255,255,255,${alpha*k})`},[{geometry:clip}]);
        }
    };
    for(const part of parts){
        const geometry=shape(part),bounds=box(part),[x0,y0,x1,y1]=bounds;
        if(part.glass){
            submit(geometry,{fill:'rgba(226,218,255,.16)'});
            submit({type:'path',commands:[['move',x0,y0+.2],['line',x1,y0+.2]]},{stroke:'rgba(255,255,255,.55)',stroke_width:.22},[{geometry}]);glints(bounds,.3,geometry);continue;
        }
        if(!part.m){if(part.emit)for(let n=0;n<2;n++)submit(geometry,{fill:part.c,shadow:{color:part.c,blur:2.2}});submit(geometry,{fill:part.c});continue;}
        const M=GUN_MATERIALS[part.m],E=mix(M[1],M[0],.4);
        if(part.dot){
            const [x,y,r]=part.dot;submit(geometry,{fill:gradient([x-r,y-r],[x+r,y+r],[[0,M[2]],[.46,mix(M[2],M[0],.55)],[.46,M[0]],[.8,mix(M[0],M[1],.5)],[1,E]])});
            submit(polygon([[x-r*.55,y-r*.2],[x-r*.2,y-r*.55],[x-r*.05,y-r*.4],[x-r*.4,y-r*.05]]),{fill:'rgba(255,255,255,.7)'});continue;
        }
        submit(geometry,{fill:gradient([0,y0],[0,y1],[[0,E],[.08,E],[.08,M[2]],[.26,mix(M[2],M[0],.5)],[.26,M[0]],[.6,M[0]],[.6,mix(M[0],M[1],.45)],[.9,mix(M[0],M[1],.6)],[.9,E],[1,E]])});
        if(x1-x0>3&&y1-y0>1.6)glints(bounds,.2,geometry);
    }
    return packets;
}

/** Renderer-neutral cached art. Gameplay supplies identity and pose, never a Canvas. */
export class weaponAppearance {
    #render=null;#entries=new Map();#unsubscribe=null;#frameUnsubscribe=null;#prefix;#preparing=false;
    constructor({resource_prefix='weapon-art'}={}){if(typeof resource_prefix!=='string'||!resource_prefix.trim())throw new TypeError('A resource prefix is required');this.#prefix=resource_prefix;}
    async prepare(render){
        if(this.#render||this.#preparing)throw new Error('Weapon appearance is already prepared or preparing');this.#preparing=true;
        const installed=[];
        try{
            for(const [id,model]of Object.entries(WEAPON_MODELS))for(const laser of [false,true]){
                const parts=[...model.parts];if(laser&&model.rail)for(const p of LASER_MODULE){const q=structuredClone(p);if(q.rr){q.rr[0]+=model.rail[0];q.rr[1]+=model.rail[1];}parts.push(q);}
                const bounds=parts.map(box),x=Math.min(...bounds.map(b=>b[0]))-2.5,y=Math.min(...bounds.map(b=>b[1]))-2.5;
                const size=[Math.max(...bounds.map(b=>b[2]))+2.5-x,Math.max(...bounds.map(b=>b[3]))+2.5-y],resource_id=`${this.#prefix}:${id}:${laser?1:0}`;
                if(render.listResources().includes(resource_id))throw new Error(`Weapon resource already exists: ${resource_id}`);
                await render.registerResource(resource_id,{type:'target',width:Math.ceil(size[0]*4),height:Math.ceil(size[1]*4)});installed.push(resource_id);
                this.#entries.set(resource_id,{resource_id,size,origin:[-x/size[0],-y/size[1]],packets:paint(parts,[-x,-y]),dirty:true});
            }
            this.#unsubscribe=render.onSurfaceChanged(()=>{for(const entry of this.#entries.values())entry.dirty=true;});this.#frameUnsubscribe=render.onFrameRendered(({targets})=>{for(const id of targets){const entry=this.#entries.get(id);if(entry)entry.dirty=false;}});this.#render=render;
        }catch(error){if(!render.disposed)for(const id of installed)render.releaseResource(id);this.#entries.clear();throw error;}finally{this.#preparing=false;}
        return this;
    }
    draw(frame,definition_id,{laser=false,...pose}={}){
        if(!this.#render)throw new Error('Prepare weapon resources before drawing');
        const model=weaponModel(definition_id),id=Object.keys(WEAPON_MODELS).find(key=>WEAPON_MODELS[key]===model),entry=this.#entries.get(`${this.#prefix}:${id}:${laser?1:0}`);
        // Cache passes are replayed until a completed frame is observed. An aborted
        // producer frame must not leave the cache marked ready with an empty target.
        if(entry.dirty){frame.beginPass({target_id:entry.resource_id,viewport:{width:entry.size[0],height:entry.size[1]}});for(const packet of entry.packets)frame.submit(packet);frame.endPass();}
        frame.submit({...pose,type:'sprite',resource_id:entry.resource_id,size:entry.size,origin:entry.origin});
    }
    invalidate(){for(const entry of this.#entries.values())entry.dirty=true;}
    dispose(){if(this.#preparing)throw new Error('Wait for appearance preparation before disposal');this.#unsubscribe?.();this.#unsubscribe=null;this.#frameUnsubscribe?.();this.#frameUnsubscribe=null;if(this.#render&&!this.#render.disposed)for(const id of this.#entries.keys())this.#render.releaseResource(id);this.#render=null;this.#entries.clear();}
}
