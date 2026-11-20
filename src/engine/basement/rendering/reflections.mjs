// ===== LV0 BASEMENT =====
// REFLECTIONS: a wet street or a polished floor showing what stands over it. Nothing is painted twice by hand:
// the pass draws what already exists a second time into a few targets the size of the view (or smaller) and
// lays them on the ground, after the floors and under everything standing on them.
//
//  mask     where the floor shines, baked once per region from the map's floor steps (`reflect` on their
//           materials) as pictures, and stamped each frame; only a change of wetness repaints it.
//  light    every light's mirrored glow (head, hot core, long smear, scatter), every glowing (`emits`) shape
//           mirrored, and the probes; on Canvas also the bodies as silhouettes that block the light behind
//           them, lit faintly by the light grid. Cut to the mask and added onto the ground in shimmering bands.
//  probe    (WebGL) the baked mirror of what holds still, per region, that screen-space reflection falls back to
//           where its walk leaves the picture.
//  height   (WebGL) each pixel's height above the ground, for screen-space reflection (the `reflection` effect).
//  plane    the reflection planes (`reflect: {plane: true}`): what stands over them drawn again whole, in full art.
//
// The engine draws from above, so a thing at height z is mirrored `fall` × z lower down the world's y (the
// classic's long smears down a wet street); its shape is not flipped, as a floor seen from above shows it.
import {artScene,rect,circle,radial,readReflect} from './art.mjs';
import {readColor} from './colors.mjs';
import {fallen} from './looks.mjs';
import {viewAhead} from './camera.mjs';
import {effect} from './effects.mjs';

/**
 * Quality as data: each level only changes numbers and switches. `scale` is the light, probe, height and plane
 * targets' size against the view, `mask_scale` the mask's; `lights` and `emits` mirror light objects and
 * glowing shapes; `bodies` is 'none', 'silhouettes' (they block the light) or 'screen' (screen-space
 * reflection on a backend that draws it, full colour; silhouettes elsewhere); `planes` draws reflection
 * planes; `bands` is how many shimmering strips the light target is laid in (1 lays it whole); `steps` the
 * screen-space walk's samples.
 */
export const REFLECTION_QUALITY=Object.freeze({
    off:Object.freeze({scale:0,mask_scale:0,lights:false,emits:false,bodies:'none',planes:false,bands:0,steps:0}),
    low:Object.freeze({scale:.25,mask_scale:.25,lights:true,emits:false,bodies:'silhouettes',planes:false,bands:1,steps:0}),
    medium:Object.freeze({scale:.5,mask_scale:.25,lights:true,emits:true,bodies:'silhouettes',planes:true,bands:12,steps:0}),
    high:Object.freeze({scale:.5,mask_scale:.25,lights:true,emits:true,bodies:'screen',planes:true,bands:12,steps:48}),
});
const LEVELS=Object.freeze(['off','low','medium','high']);
const WET_STEPS=8;
const SKIP=new Set(['text','glow','ground_shadow']);
// what a mask step drops: its paint, and a raised floor step's walls (`thickness`, `sides`: a kerb), as the mask is its footprint
const PAINT=['fill','stroke','line_cap','line_join','dash','alpha','blend','shadow','blur','material','emits','reflect','solid','thickness','sides'];

/** Wetness 0..1 in the eight steps the mask is baked at (dry to soaked). */
export const wetStep=w=>Math.round(Math.max(0,Math.min(1,w))*WET_STEPS)/WET_STEPS;
/**
 * The matrix that draws a thing at height z where its reflection shows: `fall` × z down the world's y, and, under a
 * height view, in the plane of its depth below the floor (toward the camera), so what leans away leans back.
 */
export const reflectionMatrix=(z,fall,view=null)=>fallen(view,fall,z);

/**
 * The floor steps as the mask draws them: each step first clears what is under it (at its own alpha), then,
 * when it shines, paints white at its strength (times `wet` when it shines only wet). `part` 'plane' keeps
 * only the reflection planes' shine. Text, glows and ground shadows are left out; groups keep their places.
 */
export function maskSteps(steps,{materials=()=>null,wet=0,part='all'}={}){
    const out=[];
    for(const step of steps){
        if(step.shape==='group'){out.push({...step,steps:maskSteps(step.steps,{materials,wet,part})});continue;}
        if(SKIP.has(step.shape))continue;
        const record=step.material!==undefined?materials(step.material):null;
        const r=readReflect(step.reflect!==undefined?step.reflect:record?.reflect??null);
        const k=!r||(part==='plane'&&!r.plane)?0:r.strength*(r.wet?wet:1),alpha=step.alpha??record?.alpha??1;
        const shape={...step};for(const key of PAINT)delete shape[key];
        const line=step.shape==='line';if(line&&shape.line_width===undefined)shape.line_width=record?.line_width??1;
        const paint=colour=>line?{stroke:colour}:{fill:colour};
        out.push({...shape,...paint('#ffffff'),alpha,blend:'destination-out'});
        if(k>.002)out.push({...shape,...paint(`rgba(255,255,255,${+Math.min(1,k).toFixed(4)})`),alpha});
    }
    return out;
}
/** Does any floor step shine as a reflection plane? */
function hasPlanes(steps,materials){
    return steps.some(step=>step.shape==='group'?hasPlanes(step.steps,materials):readReflect(step.reflect!==undefined?step.reflect:(step.material!==undefined?materials(step.material):null)?.reflect??null)?.plane===true);
}
/** The tiles of `size` over `extent` that meet `view` (the whole extent when no size), each [x, y, w, h]. */
function tiles({left,top,right,bottom},size,view){
    if(!size)return [[left,top,right-left,bottom-top]];
    const v=view??{left,top,right,bottom},out=[];
    const x0=Math.max(left,left+Math.floor((v.left-left)/size)*size),y0=Math.max(top,top+Math.floor((v.top-top)/size)*size);
    for(let x=x0;x<Math.min(right,v.right);x+=size)for(let y=y0;y<Math.min(bottom,v.bottom);y+=size)out.push([x,y,Math.min(size,right-x),Math.min(size,bottom-y)]);
    return out;
}
const meets=([x,y,w,h],v)=>x<v.right&&x+w>v.left&&y<v.bottom&&y+h>v.top;
const ids=new WeakMap();let count=0;
const idOf=object=>{if(!ids.has(object))ids.set(object,++count);return ids.get(object);};

/**
 * The mask as picture packets, one per tile of `tile_size` over `extent` that meets `view` (the regions a map
 * streams), and those within `ahead` after them marked `prepare`, so they are baked before the camera gets
 * there. A tile's key names the floors (by their array: give a new one when they change), the part and the
 * wetness step, so a frame where nothing changed paints nothing.
 */
export function createReflectionMask({extent,floors,materials=()=>null,wetness=0,tile_size=null,view=null,ahead=0,part='all',key='reflect'}){
    const wet=wetStep(wetness),floorsId=idOf(floors),near=view&&viewAhead(view,ahead),out=[];
    const steps=()=>maskSteps(floors,{materials,wet,part});let cached=null;
    for(const tile of tiles(extent,tile_size,near)){
        const shown=!view||meets(tile,view);
        out.push({type:'picture',prepare:!shown,picture:{key:`${key}:mask:${part}:${floorsId}:${wet}:${tile.join(',')}`,bounds:tile,build(){const scene=new artScene();scene.enter({},{});scene.clip(rect(...tile));scene.draw(cached??=steps());scene.leave();return scene.finish();}}});
    }
    out.sort((a,b)=>a.prepare-b.prepare);
    return out;
}

/** A colour as [r, g, b] 0..255 and its alpha 0..1. */
const rgbOf=c=>{const [r,g,b,a]=readColor(c);return [r*255|0,g*255|0,b*255|0,a];};
const rgba=([r,g,b],a)=>`rgba(${r},${g},${b},${+Math.max(0,Math.min(1,a)).toFixed(4)})`;

/**
 * A light's mirror on the floor, added: a wide faint scatter, a long smear down from it, its head where it
 * falls (`fall` × its height below it) and a hot white core. Reads a light layer's light ({position, color,
 * intensity, glow, radius | size | length}) plus `height` (world units above the ground, default 0) and
 * `reflect` (how strongly it shows, default 1).
 */
export function drawLightReflection(scene,l,{fall=.75,strength=1,view=null}={}){
    if(!l.color)return scene;
    const [x,y]=l.position,h=l.height??0,k=Math.min(1,l.intensity??1)*(l.reflect??1)*strength;if(k<.002)return scene;
    const m=fallen(view,fall,h),c=rgbOf(l.color),r=(l.radius??(l.size?Math.max(...l.size):l.length??60))*m[0],X=m[0]*x+m[4],yr=m[3]*y+m[5],head=Math.max(3,Math.min(24,r*.06+h*.04)),smear=Math.max(head*3,fall*h*1.1+r*.3);
    scene.enter({},{blend:'add'});
    scene.fill([circle(X,yr,r*.45)],radial([X,yr],0,[X,yr],r*.45,[[0,rgba(c,.16*k)],[1,rgba(c,0)]]));
    scene.enter({position:[X,yr+smear*.2],scale:[head*1.5,smear]});scene.fill([circle(0,0,1)],radial([0,0],0,[0,0],1,[[0,rgba(c,.7*k)],[.45,rgba(c,.28*k)],[1,rgba(c,0)]]));scene.leave();
    scene.fill([circle(X,yr,head*2)],radial([X,yr],0,[X,yr],head*2,[[0,rgba(c,.9*k)],[.35,rgba(c,.45*k)],[1,rgba(c,0)]]));
    scene.fill([circle(X,yr,head*.7)],radial([X,yr],0,[X,yr],head*.7,[[0,`rgba(255,255,255,${+(.55*k).toFixed(4)})`],[1,rgba(c,0)]]));
    scene.leave();return scene;
}
/**
 * A glowing shape's mirror (one of drawingEmitters' list): its outline where it falls, in its colour, and a soft
 * smear below it, added.
 */
export function drawEmitterReflection(scene,em,{fall=.75,strength=1,view=null}={}){
    const k=Math.min(1,em.strength)*strength;if(k<.002)return scene;
    const m=fallen(view,fall,em.height),c=rgbOf(em.color),d=fall*em.height,[l,t,r,b]=em.bounds,w=Math.max(4,r-l)*m[0],cx=m[0]*(l+r)/2+m[4],bottom=m[3]*b+m[5];
    scene.enter({matrix:m},{blend:'add'});
    const path=[['move',...em.outline[0]],...em.outline.slice(1).map(p=>['line',...p])];
    if(em.open)scene.stroke(path,rgba(c,.85*k),Math.max(1,em.width));else scene.fill([...path,['close']],rgba(c,.85*k));
    scene.leave();
    const len=Math.max(12,(b-t)*1.5+d*.6);
    scene.enter({position:[cx,bottom+len*.35],scale:[w*.7,len]},{blend:'add'});scene.fill([circle(0,0,1)],radial([0,0],0,[0,0],1,[[0,rgba(c,.35*k)],[1,rgba(c,0)]]));scene.leave();
    return scene;
}
/**
 * The probes: per tile, the baked mirror of the glowing shapes that hold still (`emitters`, each one of
 * drawingEmitters' list) whose reflection reaches it. A tile's key names the emitters by their array, so give a
 * new array when one changes (a sign switched off): only the tiles it reaches repaint.
 */
export function createReflectionProbes({extent,emitters=[],fall=.75,tile_size=null,view=null,ahead=0,key='reflect'}){
    const near=view&&viewAhead(view,ahead),list=emitters.map(em=>{const d=fall*em.height,[l,t,r,b]=em.bounds,len=Math.max(12,(b-t)*1.5+d*.6);return [em,{left:l-(r-l)*.4,top:t+d,right:r+(r-l)*.4,bottom:b+d+len*1.4}];}),out=[];
    const id=idOf(emitters);
    for(const tile of tiles(extent,tile_size,near)){
        const here=list.filter(([,reach])=>meets(tile,reach));if(!here.length)continue;
        const shown=!view||meets(tile,view);
        out.push({type:'picture',prepare:!shown,picture:{key:`${key}:probe:${id}:${fall}:${tile.join(',')}`,bounds:tile,layered:true,build(){const scene=new artScene();for(const [em] of here)drawEmitterReflection(scene,em,{fall});return scene.finish();}}});
    }
    out.sort((a,b)=>a.prepare-b.prepare);
    return out;
}

/** A packet painted one colour (its fill and stroke, no shadow or blur), drawn with `blend`. */
function painted(packet,colour,blend,opacity=1){
    const m=packet.material;if(!m)return null;
    return {...packet,blend,opacity:packet.opacity*opacity,material:{...m,fill:m.fill?colour:null,stroke:m.stroke?colour:null,shadow:null,blur:0}};
}
/** A height as the height layer's colour: red is the height over `hmax`, green says something stands there. */
const heightColour=(z,hmax)=>`rgb(${Math.round(Math.max(0,Math.min(1,z/hmax))*255)},255,0)`;
/**
 * What the height layer draws for one look part ({packets, sides, z0, z1}, from renderSystem.lookParts): its
 * top at its top's height, a drawing at its middle height, and each wall from its base's height at its foot
 * to its top's at its top.
 */
export function heightPackets(part,{hmax=1024,drawing=false}={}){
    const out=[],top=heightColour(drawing?(part.z0+part.z1)/2:part.z1,hmax);
    for(const packet of part.sides){
        const c=packet.geometry?.commands;
        // a wall drawn as a quad (move, line, line, line) shades from its foot to its top; any other side (a triangle, a curve) takes the top's
        if(!c||c.length<4||!c.slice(0,4).every(k=>Number.isFinite(k[1])&&Number.isFinite(k[2]))){const p=painted(packet,top,'normal');if(p)out.push(p);continue;}
        const p=c[0],q=c[1],r=c[2],t=c[3],from=[(p[1]+q[1])/2,(p[2]+q[2])/2],to=[(r[1]+t[1])/2,(r[2]+t[2])/2];
        out.push(painted(packet,{type:'linear',from,to,stops:[[0,heightColour(part.z0,hmax)],[1,heightColour(part.z1,hmax)]]},'normal'));
    }
    for(const packet of part.packets){const p=painted(packet,top,'normal');if(p)out.push(p);}
    return out;
}

/**
 * The reflection pass: owns its targets and lays the reflection on the ground once a frame. Make one per render
 * system, `await prepare()` (and again after a resize) between frames, then call `draw(frame, scene)` inside a
 * render hook. Nothing here advances time: the caller hands it the time and the wetness.
 *
 *  quality    a REFLECTION_QUALITY name or a record of its fields
 *  fall       how far a reflection falls per unit of height (the classic's .75)
 *  layer      the packet layer the reflection is laid on: over the floors, under what stands on them
 *  ground     the look layer of the ground: looks at it or under it are the floor, not things on it
 *  budget_ms  when draw() takes longer than this on 30 frames running, the quality steps down for the
 *             session; after 600 steady frames it tries one step up again. null keeps it fixed.
 *  key        the prefix of its resource ids and picture keys
 */
export class reflectionPass{
    #render;#quality;#level;#fall;#layer;#ground;#budget;#key;#size=null;#slow=0;#steady=0;#stats={};#planes=new WeakMap();#areas=new WeakMap();#split=new WeakMap();
    constructor(render,{quality='medium',fall=.75,layer=-99,ground=-100,budget_ms=2,key='reflect'}={}){
        if(!render?.lookParts)throw new TypeError('A reflection pass draws through a renderSystem');
        this.#render=render;this.#fall=fall;this.#layer=layer;this.#ground=ground;this.#budget=budget_ms;this.#key=key;this.setQuality(quality);
    }
    get quality(){return this.#level;}
    /** The quality now drawn (a level name, or 'custom' for a record). */
    setQuality(quality){
        if(typeof quality==='string'){if(!REFLECTION_QUALITY[quality])throw new TypeError(`Reflection quality is ${LEVELS.join(', ')}`);this.#level=quality;this.#quality=REFLECTION_QUALITY[quality];}
        else{const q={...REFLECTION_QUALITY.medium,...quality};if(!(q.scale>=0&&q.scale<=1&&q.mask_scale>=0&&q.mask_scale<=1))throw new TypeError('Reflection scales are in [0, 1]');this.#level='custom';this.#quality=Object.freeze(q);}
        this.#size=null;return this;
    }
    /** Ids of its targets. */
    target(name){return `${this.#key}:${name}`;}
    /** Registers (or resizes) its targets for the camera's viewport. Call between frames. */
    async prepare(){
        const q=this.#quality,{width,height,pixel_ratio=1}=this.#render.getViewport();
        const size=(s)=>[Math.max(1,Math.ceil(width*pixel_ratio*s)),Math.max(1,Math.ceil(height*pixel_ratio*s))];
        const want={mask:q.mask_scale,plane_mask:q.planes?q.mask_scale:0,light:q.scale,plane:q.planes?q.scale:0,probe:q.bodies==='screen'?q.scale:0,height:q.bodies==='screen'?q.scale:0};
        const sig=JSON.stringify([width,height,pixel_ratio,want]);if(sig===this.#size)return;
        for(const [name,s] of Object.entries(want)){const id=this.target(name);if(this.#render.listResources().includes(id))this.#render.releaseResource(id);if(s>0){const [w,h]=size(s);await this.#render.registerResource(id,{type:'target',width:w,height:h});}}
        this.#size=sig;
    }
    /** The last frame's numbers: {ms, packets, level, ssr}. */
    get statistics(){return {...this.#stats};}
    /**
     * One frame's reflection into the open `frame`:
     *  extent    the map's {left, top, right, bottom}
     *  floors    the map's floor steps (map space) and `materials(name)` their material records
     *  wetness   0 (dry) to 1 (soaked); materials marked `wet` shine that much
     *  lights    light layer lights with `height`, mirrored as glow sprites (moving or not)
     *  emitters  glowing shapes (drawingEmitters' list): `still` ones are baked into the probes, the rest drawn live
     *  grid      the light grid ({sample(x, y)} → [r, g, b]): bodies' silhouettes are lit by it
     *  time      seconds, for the shimmer; `ripple` its sideways reach in px (0 still)
     *  tile_size the regions the mask and probes are baked in; `ahead` readies those the camera nears
     *  blend     the interpolation blend
     * Returns the number of packets it submitted.
     */
    draw(frame,{extent,floors=[],materials=()=>null,wetness=0,lights=[],emitters=[],grid=null,time=0,ripple=2,tile_size=1024,ahead=256,blend=1}={}){
        const start=now(),q=this.#quality;let n=0;
        if(q.scale<=0||!this.#size){this.#stats={ms:0,packets:0,level:this.#level,ssr:false};return 0;}
        const render=this.#render,v=render.getVisibleBounds(blend),fall=this.#fall,view=render.heightViewAt(blend);
        const caps=new Set(render.getCapabilities()),ssr=q.bodies==='screen'&&caps.has('effect:reflection');
        const submit=(packet)=>{frame.submit(packet);n++;};
        const vp=render.getViewport(),screen={width:vp.width,height:vp.height},whole={type:'sprite',space:'screen',position:[vp.width/2,vp.height/2],size:[vp.width,vp.height]};
        const planes=q.planes&&this.#hasPlanes(floors,materials);
        // The mask, and the planes' own, stamped from their baked tiles.
        frame.beginPass({target_id:this.target('mask'),viewport:screen});
        for(const p of createReflectionMask({extent,floors,materials,wetness,tile_size,view:v,ahead,key:this.#key}))submit(p);
        frame.endPass();
        if(planes){frame.beginPass({target_id:this.target('plane_mask'),viewport:screen});for(const p of createReflectionMask({extent,floors,materials,wetness,tile_size,view:v,ahead,part:'plane',key:this.#key}))submit(p);frame.endPass();}
        let split=this.#split.get(emitters);if(!split){split=[emitters.filter(e=>e.still),emitters.filter(e=>!e.still)];this.#split.set(emitters,split);}   // the same array each frame keeps the probes' keys
        const [still,live]=split;
        const probes=q.emits?createReflectionProbes({extent,emitters:still,fall,tile_size,view:v,ahead,key:this.#key}):[];
        // The light target: mirrored lights, glowing shapes, probes (when no screen-space walk falls back to them), silhouettes.
        frame.beginPass({target_id:this.target('light'),viewport:screen});
        if(!ssr)for(const p of probes)submit(p);
        // A light's scatter and smear go under the silhouettes; its head and core over them, so the lamp's own fixture never hides its light.
        const art=new artScene(),heads=[];
        if(q.lights)for(const l of lights){const [scatter,smear,...head]=drawLightReflection(new artScene(),l,{fall,view}).finish();for(const p of [scatter,smear])if(p)submit(p);heads.push(...head);}
        if(q.emits)for(const em of live)drawEmitterReflection(art,em,{fall,view});
        for(const p of art.finish())submit(p);
        if(!ssr&&q.bodies!=='none'){
            for(const {entity,parts} of render.lookParts(blend,{above:this.#ground,mirror:fall,margin:64})){
                const lit=grid?.sample?grid.sample(...entity.position):null,tint=lit?`rgb(${lit.map(c=>Math.round(Math.min(1,c)*90)).join(',')})`:null;
                for(const part of parts)for(const packet of [...part.sides,...part.packets]){const cut=painted(packet,'#000','destination-out');if(cut)submit(cut);if(tint){const glow=painted(packet,tint,'add');if(glow)submit(glow);}}
            }
        }
        for(const p of heads)submit(p);
        submit({...whole,resource_id:this.target('mask'),blend:'destination-in'});
        frame.endPass();
        if(ssr){
            frame.beginPass({target_id:this.target('probe'),viewport:screen});for(const p of probes)submit(p);submit({...whole,resource_id:this.target('mask'),blend:'destination-in'});frame.endPass();
            frame.beginPass({target_id:this.target('height'),viewport:screen});
            for(const {parts} of render.lookParts(blend,{above:this.#ground}).sort((a,b)=>a.layer-b.layer||a.depth-b.depth))for(const part of parts)for(const p of heightPackets(part,{drawing:part.drawing}))submit(p);
            frame.endPass();
        }
        // Reflection planes: what stands over them, whole, cut to the planes' mask.
        if(planes){
            const areas=this.#planeAreas(floors,materials);
            frame.beginPass({target_id:this.target('plane'),viewport:screen});
            for(const {parts} of render.lookParts(blend,{above:this.#ground,mirror:fall,margin:240,filter:e=>areas.some(a=>e.position[0]>a[0]-120&&e.position[0]<a[2]+120&&e.position[1]>a[1]-240&&e.position[1]<a[3])}))
                for(const part of parts)for(const packet of [...part.sides,...part.packets])submit(render.textured({...packet,layer:0,depth:0}));
            submit({...whole,resource_id:this.target('plane_mask'),blend:'destination-in'});
            frame.endPass();
        }
        // Laid on the ground: the light target in shimmering bands, added; the planes over the floor.
        const bands=Math.max(1,q.bands),[tw,th]=this.#targetSize('light');
        for(let i=0;i<bands;i++){
            const y0=vp.height*i/bands,h=vp.height/bands,dx=bands>1?ripple*Math.sin(i*1.7+time*2.3):0;
            submit({type:'sprite',space:'screen',resource_id:this.target('light'),source:[0,th*i/bands,tw,th/bands],position:[vp.width/2+dx,y0+h/2],size:[vp.width,h+.5],blend:'add',layer:this.#layer,depth:0});
        }
        if(planes)submit({...whole,resource_id:this.target('plane'),layer:this.#layer,depth:1e-3});
        if(ssr)frame.setEffects([effect({type:'reflection',height:this.target('height'),mask:this.target('mask'),probe:this.target('probe'),plane:planes?this.target('plane_mask'):null,fall,steps:q.steps,ripple:ripple*.5,time,eye:view?view.eye:0,lean:view?view.lean:1}),...frame.getEffects()]);
        const ms=now()-start;this.#stats={ms,packets:n,level:this.#level,ssr};this.#pace(ms);
        return n;
    }
    /** The packet that lifts the darkness where the reflection shines: give it to the light layer's `cuts`. */
    darknessCut({opacity=.85}={}){const vp=this.#render.getViewport();return {type:'sprite',space:'screen',resource_id:this.target('light'),position:[vp.width/2,vp.height/2],size:[vp.width,vp.height],blend:'destination-out',opacity};}
    #targetSize(name){const q=this.#quality,vp=this.#render.getViewport(),s=name==='mask'||name==='plane_mask'?q.mask_scale:q.scale,pr=vp.pixel_ratio??1;return [Math.max(1,Math.ceil(vp.width*pr*s)),Math.max(1,Math.ceil(vp.height*pr*s))];}
    #hasPlanes(floors,materials){let v=this.#planes.get(floors);if(v===undefined){v=hasPlanes(floors,materials);this.#planes.set(floors,v);}return v;}
    #planeAreas(floors,materials){
        let out=this.#areas.get(floors);if(out)return out;out=[];
        const walk=(steps,m)=>{for(const s of steps){
            if(s.shape==='group'){const r=s.rotation??0,k=typeof s.scale==='number'?[s.scale,s.scale]:s.scale??[1,1],c=Math.cos(r),n=Math.sin(r),g=[c*k[0],n*k[0],-n*k[1],c*k[1],s.x??0,s.y??0];walk(s.steps,[m[0]*g[0]+m[2]*g[1],m[1]*g[0]+m[3]*g[1],m[0]*g[2]+m[2]*g[3],m[1]*g[2]+m[3]*g[3],m[0]*g[4]+m[2]*g[5]+m[4],m[1]*g[4]+m[3]*g[5]+m[5]]);continue;}
            const r=readReflect(s.reflect!==undefined?s.reflect:(s.material!==undefined?materials(s.material):null)?.reflect??null);if(!r?.plane)continue;
            const box=stepBox(s);if(!box)continue;const pts=[[box[0],box[1]],[box[2],box[1]],[box[2],box[3]],[box[0],box[3]]].map(([x,y])=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]]);
            out.push([Math.min(...pts.map(p=>p[0])),Math.min(...pts.map(p=>p[1])),Math.max(...pts.map(p=>p[0])),Math.max(...pts.map(p=>p[1]))]);
        }};
        walk(floors,[1,0,0,1,0,0]);this.#areas.set(floors,out);return out;
    }
    // Steps the quality down when the pass runs long, and back up after a steady while; the saved setting never changes.
    #pace(ms){
        if(this.#budget===null||this.#level==='custom')return;
        if(ms>this.#budget){this.#steady=0;if(++this.#slow>=30){this.#slow=0;const i=LEVELS.indexOf(this.#level);if(i>1){this.#ceiling??=this.#level;this.setQuality(LEVELS[i-1]);}}}
        else{this.#slow=0;if(this.#ceiling&&++this.#steady>=600){this.#steady=0;const i=LEVELS.indexOf(this.#level);this.setQuality(LEVELS[i+1]);if(this.#level===this.#ceiling)this.#ceiling=null;}}
    }
    #ceiling=null;
}
/** A floor step's box [left, top, right, bottom] in its group's space, for the shapes a floor uses. */
function stepBox(s){
    if(s.shape==='rectangle')return [s.x??0,s.y??0,(s.x??0)+s.width,(s.y??0)+s.height];
    if(s.shape==='circle')return [(s.x??0)-s.radius,(s.y??0)-s.radius,(s.x??0)+s.radius,(s.y??0)+s.radius];
    if(s.shape==='ellipse'){const r=Math.max(s.radius_x,s.radius_y);return [(s.x??0)-r,(s.y??0)-r,(s.x??0)+r,(s.y??0)+r];}
    if(s.points){const xs=s.points.map(p=>p[0]),ys=s.points.map(p=>p[1]);return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];}
    return null;
}
const now=()=>globalThis.performance?.now?.()??Date.now();
