// ===== LV0 BASEMENT =====
// EFFECTS: what is done to a finished image, as data. A stack is a list of effects applied in order to a
// layer pass before it is laid over its pass, or to the whole frame once everything is drawn. Each backend
// draws the effects it declares (`effect:<type>` capabilities); a frame that asks for another is refused.
import {color,finite} from './values.mjs';
import {readColor} from './colors.mjs';

/**
 * Every effect and its fields with their defaults. Lengths are in the pass's own units (logical pixels).
 * - grade: exposure (stops; 1 doubles), contrast (1 unchanged), saturation (0 grey, 1 unchanged), then a
 *   tint multiplied in by tint_amount. Done on straight colour, as CSS's brightness, contrast and saturate are.
 * - vignette: the edges darkened toward `color`: none inside `radius`, `strength` at `radius + softness`,
 *   both as fractions of the distance from the centre to a corner.
 * - grain: film noise laid over by overlay, `amount` 0 to 1, each grain `size` pixels; `animated` grain
 *   moves every frame, still grain does not.
 * - bloom, fog_glow, star_glow: light. What is brighter than `threshold` (each channel, 0 to 1) is spread
 *   and added back at `strength`, times `color`. Bloom spreads it at `radius` and twice and four times it
 *   (a tight core with a wide skirt); fog glow once, wide; star glow in `rays` streaks `length` long, the
 *   first at `angle` (radians, clockwise on screen).
 */
export const EFFECTS=Object.freeze({
    grade:Object.freeze({exposure:0,contrast:1,saturation:1,tint:'#ffffff',tint_amount:0}),
    vignette:Object.freeze({strength:.5,radius:.55,softness:.45,color:'#000000'}),
    grain:Object.freeze({amount:.08,size:1,animated:true}),
    bloom:Object.freeze({threshold:.65,strength:1.2,radius:8,color:'#ffffff'}),
    fog_glow:Object.freeze({threshold:.45,strength:2,radius:40,color:'#ffffff'}),
    star_glow:Object.freeze({threshold:.75,strength:1.5,length:60,rays:4,angle:Math.PI/4,color:'#ffffff'}),
});
const RANGES={exposure:[-8,8],contrast:[0,8],saturation:[0,8],tint_amount:[0,1],strength:[0,8],'vignette.radius':[0,4],softness:[.001,4],amount:[0,1],size:[1,64],'vignette.strength':[0,1],threshold:[0,.99],radius:[.5,256],length:[1,512],rays:[2,8],angle:[-7,7]};
/** One effect, checked and filled in from its defaults. Unknown types or fields are refused. */
export function effect(spec){
    if(!spec||typeof spec!=='object')throw new TypeError('An effect is {type, ...fields}');
    const defaults=EFFECTS[spec.type];if(!defaults)throw new TypeError(`Unknown effect: ${spec.type} (one of ${Object.keys(EFFECTS).join(', ')})`);
    const out={type:spec.type};
    for(const key of Object.keys(spec))if(key!=='type'&&!Object.hasOwn(defaults,key))throw new TypeError(`Unknown ${spec.type} field: ${key} (one of ${Object.keys(defaults).join(', ')})`);
    for(const [key,fallback] of Object.entries(defaults)){
        const value=spec[key]??fallback;
        if(typeof fallback==='number'){const [lo,hi]=RANGES[`${spec.type}.${key}`]??RANGES[key];out[key]=finite(value,`${spec.type} ${key}`,lo);if(out[key]>hi)throw new RangeError(`${spec.type} ${key} is at most ${hi}`);
            if(key==='rays'&&out[key]%2)throw new RangeError(`${spec.type} rays is 2, 4, 6 or 8`);}
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
