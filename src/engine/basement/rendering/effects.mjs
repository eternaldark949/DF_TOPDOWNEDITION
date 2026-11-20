// ===== LV0 BASEMENT =====
// EFFECTS: what is done to a finished image, as data. A stack is a list of effects applied in order to a
// layer pass before it is laid over its pass, or to the whole frame once everything is drawn. Each backend
// draws the effects it declares (`effect:<type>` capabilities); a frame that asks for another is refused.
import {color,finite} from './values.mjs';
import {readColor} from './colors.mjs';

/**
 * Every effect and its fields with their defaults. Lengths are in the pass's own units (logical pixels).
 * - grade: exposure (stops; 1 doubles), contrast (1 unchanged), saturation (0 grey, 1 unchanged), then `hue`'s
 *   hue and saturation laid over by hue_amount keeping each pixel's lightness (CSS's `color` blend: one cheap
 *   pass that turns the picture toward a colour), then a tint multiplied in by tint_amount. Done on straight
 *   colour, as CSS's brightness, contrast and saturate are.
 * - vignette: the edges darkened toward `color`: none inside `radius`, `strength` at `radius + softness`,
 *   both as fractions of the distance from the centre to a corner.
 * - grain: film noise laid over by overlay, `amount` 0 to 1, each grain `size` pixels; `animated` grain
 *   moves every frame, still grain does not.
 * - bloom, fog_glow, star_glow: light. What is brighter than `threshold` (each channel, 0 to 1) is spread
 *   and added back at `strength`, times `color`. Bloom spreads it at `radius` and twice and four times it
 *   (a tight core with a wide skirt); fog glow once, wide; star glow in `rays` streaks `length` long, the
 *   first at `angle` (radians, clockwise on screen).
 * - bokeh: out of focus, as a lens sees it. What is brighter than `threshold` is taken out and grown into
 *   the aperture's shape (`blades` sides, 4 to 12, turned by `rotation`) `radius` wide, at `highlights`
 *   times its brightness, so lights become discs; the rest is blurred as wide.
 * - reflection: screen-space reflection on a wet or polished floor (reflections.mjs fills its targets). For
 *   each pixel of the ground (nothing on it in the `height` target) where the `mask` target says it shines,
 *   it marches up in height until it meets what stands there (a pixel at that height `fall` × it up the
 *   world's y, leaning as the height view leans), and adds
 *   that pixel's colour at the mask's strength × `strength`, fading toward `reach` (world units, `steps`
 *   samples). Where the walk leaves the picture or passes under something nearer, the `probe` target (the
 *   baked mirror of what stands still) shows instead. Where the `plane` target's mask covers, it adds
 *   nothing (a reflection plane draws there). `ripple` (px) shifts each row sideways by a sine of its height
 *   at `ripple_scale` radians a pixel, moving with `time` (seconds); `hmax` is the height a full `height`
 *   red stands for; `eye` and `lean` are the height view's (eye 0: drawn flat), so what leans away from the
 *   camera leans toward it in the floor. The targets are resource ids; `probe` and `plane` may be null.
 */
export const EFFECTS=Object.freeze({
    grade:Object.freeze({exposure:0,contrast:1,saturation:1,hue:'#ffffff',hue_amount:0,tint:'#ffffff',tint_amount:0}),
    vignette:Object.freeze({strength:.5,radius:.55,softness:.45,color:'#000000'}),
    grain:Object.freeze({amount:.08,size:1,animated:true}),
    bloom:Object.freeze({threshold:.65,strength:1.2,radius:8,color:'#ffffff'}),
    fog_glow:Object.freeze({threshold:.45,strength:2,radius:40,color:'#ffffff'}),
    star_glow:Object.freeze({threshold:.75,strength:1.5,length:60,rays:4,angle:Math.PI/4,color:'#ffffff'}),
    bokeh:Object.freeze({radius:12,blades:6,rotation:0,threshold:.6,highlights:1}),
    reflection:Object.freeze({height:null,mask:null,probe:null,plane:null,strength:1,fall:.75,reach:360,steps:32,ripple:0,ripple_scale:.12,time:0,hmax:1024,eye:0,lean:1}),
});
/** Fields that name a render target: `true` when the effect needs one. */
const TARGETS=Object.freeze({'reflection.height':true,'reflection.mask':true,'reflection.probe':false,'reflection.plane':false});
const RANGES={exposure:[-8,8],contrast:[0,8],saturation:[0,8],tint_amount:[0,1],hue_amount:[0,1],strength:[0,8],'vignette.radius':[0,4],softness:[.001,4],amount:[0,1],size:[1,64],'vignette.strength':[0,1],threshold:[0,.99],radius:[.5,256],length:[1,512],rays:[2,8],angle:[-7,7],blades:[4,12],rotation:[-7,7],highlights:[0,32],fall:[0,4],reach:[1,4096],steps:[4,64],ripple:[0,32],ripple_scale:[0,4],time:[-1e9,1e9],hmax:[1,1e5],eye:[0,1e6],'reflection.lean':[0,8]};
/** One effect, checked and filled in from its defaults. Unknown types or fields are refused. */
export function effect(spec){
    if(!spec||typeof spec!=='object')throw new TypeError('An effect is {type, ...fields}');
    const defaults=EFFECTS[spec.type];if(!defaults)throw new TypeError(`Unknown effect: ${spec.type} (one of ${Object.keys(EFFECTS).join(', ')})`);
    const out={type:spec.type};
    for(const key of Object.keys(spec))if(key!=='type'&&!Object.hasOwn(defaults,key))throw new TypeError(`Unknown ${spec.type} field: ${key} (one of ${Object.keys(defaults).join(', ')})`);
    for(const [key,fallback] of Object.entries(defaults)){
        const value=spec[key]??fallback,target=TARGETS[`${spec.type}.${key}`];
        if(target!==undefined){if(value===null){if(target)throw new TypeError(`${spec.type} ${key} names a render target`);out[key]=null;continue;}if(typeof value!=='string'||!value||value==='screen')throw new TypeError(`${spec.type} ${key} names a render target`);out[key]=value;continue;}
        if(typeof fallback==='number'){const [lo,hi]=RANGES[`${spec.type}.${key}`]??RANGES[key];out[key]=finite(value,`${spec.type} ${key}`,lo);if(out[key]>hi)throw new RangeError(`${spec.type} ${key} is at most ${hi}`);
            if(key==='rays'&&out[key]%2)throw new RangeError(`${spec.type} rays is 2, 4, 6 or 8`);
            if(key==='blades'&&out[key]%2)throw new RangeError(`${spec.type} blades is 4, 6, 8, 10 or 12`);}
        else if(typeof fallback==='boolean'){if(typeof value!=='boolean')throw new TypeError(`${spec.type} ${key} is true or false`);out[key]=value;}
        else{readColor(value);out[key]=color(value);}   // a colour the backends can read
    }
    return Object.freeze(out);
}
/**
 * A stack: a list of effects, or {preset, ...changes} naming a preset (an `effects` resource, read with
 * `resolve(id)`) whose effects take `changes` by type, e.g. {preset: 'engine:film', grain: {amount: .2}}.
 */
export function effectStack(value,resolve=null){
    if(value==null)return Object.freeze([]);
    if(Array.isArray(value))return Object.freeze(value.map(effect));
    if(typeof value==='object'&&typeof value.preset==='string'){
        if(!resolve)throw new TypeError('A preset needs a data source to be read from');
        const preset=resolve(value.preset);if(preset?.kind!=='effects'||!Array.isArray(preset.effects))throw new TypeError(`${value.preset} is not an effects preset`);
        const {preset:_,...changes}=value;
        for(const type of Object.keys(changes))if(!preset.effects.some(e=>e.type===type))throw new TypeError(`${value.preset} has no ${type} to change`);
        return Object.freeze(preset.effects.map(e=>effect({...e,...changes[e.type]})));
    }
    throw new TypeError('Effects are a list of effects or {preset, ...changes}');
}
/** The capabilities a stack needs. */
export const effectNeeds=stack=>stack.map(e=>`effect:${e.type}`);
/** The render targets a stack reads (a reflection's height, mask, probe and plane). */
export const effectTargets=stack=>stack.flatMap(e=>Object.keys(e).filter(k=>TARGETS[`${e.type}.${k}`]!==undefined&&e[k]!==null).map(k=>e[k]));
/** Checks an `effects` resource for the Directory: a list of valid effects. */
export function validateEffectsPreset(resource,where='effects'){
    if(!Array.isArray(resource?.effects))throw new TypeError(`${where}: an effects preset holds a list of effects`);
    resource.effects.forEach((e,i)=>{try{effect(e);}catch(error){throw new TypeError(`${where}.effects[${i}]: ${error.message}`);}});return resource;
}

// ----- What the effects compute, shared by both backends so they agree -----
/** The grain texture: GRAIN_SIZE square, grey around 128, the same everywhere (a fixed hash, no random). */
export const GRAIN_SIZE=128;
export function grainPixels(){
    const out=new Uint8Array(GRAIN_SIZE*GRAIN_SIZE*4);
    for(let i=0;i<GRAIN_SIZE*GRAIN_SIZE;i++){let h=Math.imul(i^0x9e3779b9,0x85ebca6b);h^=h>>>13;h=Math.imul(h,0xc2b2ae35);h^=h>>>16;const v=(h>>>0)/4294967296;
        // a rough bell around the middle: the sum of two evens
        let g=Math.imul((i+7919)^0x27d4eb2f,0x165667b1);g^=g>>>15;const w=(g>>>0)/4294967296;const n=Math.round(((v+w)/2)*255);out.set([n,n,n,255],i*4);}
    return out;
}
/** Where the grain sits this frame: a still offset, or one that jumps every frame. */
export const grainOffset=(frame,animated)=>{if(!animated)return [0,0];let h=Math.imul(frame+1,0x9e3779b1);h^=h>>>16;return [h&(GRAIN_SIZE-1),(h>>>8)&(GRAIN_SIZE-1)];};

// ----- Light: both backends spread the bright part the same way -----
/** The light effects. */
export const GLOWS=Object.freeze(['bloom','fog_glow','star_glow']);
/** The widest blur done at one level, in that level's pixels; a wider one is done on a smaller level. */
export const GLOW_SIGMA=3,STREAK_SIGMA=8;   // a streak is kept sharper across
/** The size of each level: level 0 is the surface, each next one half the last, rounded up. */
export function glowSizes(width,height,levels){const out=[[width,height]];for(let i=1;i<=levels;i++){const [w,h]=out[i-1];out.push([Math.ceil(w/2),Math.ceil(h/2)]);}return out;}
/**
 * How a light effect is drawn on a surface `sx` device pixels per pass unit: the bright part is taken at
 * level 1 (half size), halved again down to each spread's level, blurred there by `sigma` level pixels
 * (both ways, or along `dir` alone for a streak, y down), then each spread is added at `weight` × strength
 * into one surface the size of level `sum` (the largest spread), and that is added back once over the surface.
 */
export function glowPlan(e,sx){
    const level=(sigma,most)=>Math.min(8,Math.max(1,Math.ceil(Math.log2(sigma/most)))),spread=(sigma,weight,dir=null)=>{const l=level(sigma,dir?STREAK_SIGMA:GLOW_SIGMA);return {level:l,sigma:sigma/2**l,weight,dir};};
    let spreads;
    if(e.type==='bloom')spreads=[spread(e.radius*sx,.5),spread(e.radius*sx*2,.3),spread(e.radius*sx*4,.2)];
    else if(e.type==='fog_glow')spreads=[spread(e.radius*sx,1)];
    else{const lines=e.rays/2;spreads=Array.from({length:lines},(_,k)=>{const t=e.angle+k*Math.PI/lines;return spread(e.length*sx/3,1,[Math.cos(t),Math.sin(t)]);});}
    return {threshold:e.threshold,strength:e.strength,color:e.color,levels:Math.max(...spreads.map(s=>s.level)),sum:Math.min(...spreads.map(s=>s.level)),spreads};
}
/** CSS filter that keeps what is above `t`, stretched back to 0 to 1: brightness(1/(1+t)) then contrast((1+t)/(1-t)). */
export const thresholdFilter=t=>`brightness(${1/(1+t)}) contrast(${(1+t)/(1-t)})`;

// ----- Bokeh: the aperture's shape from straight lines, the same on both backends -----
/** The widest aperture drawn at one level, in that level's pixels; a wider one is drawn on a smaller level. */
export const BOKEH_RADIUS=16;
/**
 * How bokeh is drawn on a surface `sx` device pixels per pass unit, at `level` (halved from the surface):
 * - the bright part is taken at level 1 as glow's is (`thresholdFilter(threshold)`) and halved on down;
 * - the rest is the level less (1 - threshold) times the bright part (Canvas's difference blend at that
 *   opacity), halved `soft` more times and blurred there by `sigma` with its edges repeated (a Gaussian: soft
 *   content looks alike through any aperture, and needs no detail);
 * - each light grows into the aperture, a regular polygon of `blades` sides: polygons with sides in pairs
 *   are sums of straight segments, so the bright part is grown along each side in turn. Each step keeps the
 *   brighter (Canvas's lighten) of the image and a copy moved by `steps[i]`, whole pixels (1, 2, 4… along
 *   the side, the last cut to fit), so no light is thinned by reading between pixels; a light keeps its
 *   brightness however wide its disc, where an average would thin a small light to nothing;
 * - the discs are moved back by `centre` (whole pixels) and added to the rest `highlights` times over, at the level's size.
 * Moves are in level pixels, y down.
 */
export function bokehPlan(e,sx){
    const R=e.radius*sx,level=Math.min(8,Math.max(1,Math.ceil(Math.log2(R/BOKEH_RADIUS)))),r=R/2**level,m=e.blades/2,side=Math.max(1,Math.round(2*r*Math.sin(Math.PI/e.blades)));
    const steps=[],total=[0,0];
    for(let j=0;j<m;j++){
        const t=e.rotation+j*Math.PI/m,dir=[Math.cos(t),Math.sin(t)];let done=0,along=[0,0];
        for(let h=1;done<side;h*=2){const step=Math.min(h,side-done);done+=step;const to=[Math.round(dir[0]*done),Math.round(dir[1]*done)];steps.push([to[0]-along[0],to[1]-along[1]]);along=to;}
        total[0]+=along[0];total[1]+=along[1];
    }
    const soft=Math.max(0,Math.ceil(Math.log2(r/2/GLOW_SIGMA)));
    return {level,soft,sigma:r/2/2**soft,threshold:e.threshold,highlights:e.highlights,steps:steps.filter(([x,y])=>x||y),centre:[-Math.round(total[0]/2),-Math.round(total[1]/2)]};
}
