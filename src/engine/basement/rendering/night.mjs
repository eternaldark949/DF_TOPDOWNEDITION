// ===== LV0 BASEMENT =====
// NIGHT SETTINGS: how a place looks at night, as data. A map (or anything else) holds one `night` record;
// whoever draws a night hands its fields to renderSystem.drawNight and its `effects` to render.setEffects.
import {effect} from './effects.mjs';
import {readGlare} from './glare.mjs';
import {readColor} from './colors.mjs';

/**
 * A night's fields and their defaults:
 * - tint: the dark's colour (any CSS colour; its alpha is how dark), drawNight's `tint`.
 * - scale: the share of the frame the light layer is drawn at (0 to 1), drawNight's `scale`.
 * - effects: the frame's effects at night (a list of effects or {preset, ...changes}; see effects.mjs), or null.
 * - glare: the lens's glare over lights that ask for it (true, or GLARE's fields), or null for none.
 * - covers: the height (world units) a part stands over to keep the night on it (drawLooks' `covers`).
 */
export const NIGHT=Object.freeze({tint:'rgba(10,8,30,.86)',scale:.5,effects:null,glare:null,covers:24});
/** A night record checked and filled in from the defaults. Unknown fields are refused. */
export function readNight(night,where='night'){
    if(!night||typeof night!=='object'||Array.isArray(night))throw new TypeError(`${where} is {${Object.keys(NIGHT).join(', ')}}`);
    for(const key of Object.keys(night))if(!Object.hasOwn(NIGHT,key))throw new TypeError(`Unknown ${where} field: ${key} (one of ${Object.keys(NIGHT).join(', ')})`);
    const out={...NIGHT,...night};
    try{readColor(out.tint);}catch{throw new TypeError(`${where}.tint is a CSS colour`);}
    if(!(Number.isFinite(out.scale)&&out.scale>0&&out.scale<=1))throw new RangeError(`${where}.scale is a number over 0, up to 1`);
    const fx=out.effects;
    if(Array.isArray(fx))fx.forEach((e,i)=>{try{effect(e);}catch(error){throw new TypeError(`${where}.effects[${i}]: ${error.message}`);}});
    else if(fx!==null&&!(fx&&typeof fx==='object'&&typeof fx.preset==='string'))throw new TypeError(`${where}.effects is a list of effects, {preset, ...changes} or null`);
    if(!(Number.isFinite(out.covers)&&out.covers>=0))throw new RangeError(`${where}.covers is a height, 0 or more`);
    if(out.glare!==null&&out.glare!==false)out.glare=readGlare(out.glare,undefined,`${where}.glare`);else out.glare=null;
    return Object.freeze(out);
}
