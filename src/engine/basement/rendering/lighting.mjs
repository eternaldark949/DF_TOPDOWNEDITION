// ===== LV0 BASEMENT =====
// THE LIGHT LAYER: darkness over the scene with light cut out of it. A layer is built as frame packets:
// the dark (a tint over the bounds), areas where the dark is thinner (a lit room, an open sky), each
// light's cut (its reach, shadowed by an optional visibility polygon), then each light's colour, added.
// Draw it over the finished scene at the dark's strength (a layer pass in the frame, which every backend draws).
import {artScene,rect,polygon,circle,radial,linear} from './art.mjs';
import {viewAhead} from './camera.mjs';

const finite=(value,name,min=-Infinity)=>{if(!Number.isFinite(value)||value<min)throw new TypeError(`Light ${name} must be a finite number`);return value;};
export const LIGHT_CUT=Object.freeze([[0,1],[1,0]]);
const white=a=>`rgba(255,255,255,${+a.toFixed(4)})`;
const polygonPath=points=>[['move',...points[0]],...points.slice(1).map(p=>['line',...p]),['close']];
/** A rounded strip light (a window, a lit doorway, a laser's line): a band across its middle and a half-ellipse cap at each end, turned by `rotation`. */
function area(scene,[x,y],[w,h],round,stops,opacity,blend,rotation=0){
    const hw=w/2,hh=h/2,r=Math.max(0,Math.min(hw,round??hh)),x0=-hw+r,x1=hw-r;
    scene.enter({position:[x,y],rotation},{opacity,blend});
    const band=[];for(const [o,c] of stops){band.push([.5-o/2,c],[.5+o/2,c]);}band.sort((a,b)=>a[0]-b[0]);
    scene.fill(rect(x0,-hh,x1-x0,hh*2),linear([0,-hh],[0,hh],band));
    if(r>0)for(const side of [-1,1]){scene.enter();scene.clip(rect(side<0?x0-r:x1,-hh,r,hh*2));scene.enter({position:[side<0?x0:x1,0],scale:[r,hh]});scene.fill([circle(0,0,1)],radial([0,0],0,[0,0],1,stops));scene.leave();scene.leave();}
    scene.leave();
}
/** A beam (a headlight): from `near_width` either side at its source to `width` either side `length` ahead along
 *  `rotation`, fading along it through `stops` and softer toward its edges; limited to `polygon` when given. */
function beam(scene,l,stops,opacity,blend){
    const [x,y]=l.position,L=l.length,W=l.width,n=l.near_width??15;
    scene.enter({},{blend});if(l.polygon)scene.clip(polygonPath(l.polygon));
    scene.enter({position:[x,y],rotation:l.rotation??0});
    for(const [k,a] of BEAM_LAYERS){scene.enter({},{opacity:opacity*a});scene.fill(polygon([[0,-n*k],[L,-W*k],[L,W*k],[0,n*k]]),linear([0,0],[L,0],stops));scene.leave();}
    scene.leave();scene.leave();
}
/** A beam's softness across it: the whole width faint, its middle stronger (width fraction, opacity). */
const BEAM_LAYERS=Object.freeze([[1,.45],[.55,.55]]);
const SHAPES=Object.freeze(['point','area','beam']);
function validLight(light,i){
    const name=`light ${i}`;if(!light||!Array.isArray(light.position))throw new TypeError(`${name} needs a position`);
    const shape=light.shape??'point';if(!SHAPES.includes(shape))throw new TypeError(`${name}: shape is point, area or beam`);
    if(shape==='point')finite(light.radius,'radius',0);
    else if(shape==='area'){if(!Array.isArray(light.size))throw new TypeError(`${name}: an area light needs a size`);}
    else{finite(light.length,'length',0);finite(light.width,'width',0);finite(light.near_width??15,'near width',0);}
    finite(light.rotation??0,'rotation');finite(light.intensity??1,'intensity',0);finite(light.glow??0,'glow',0);
    if(light.polygon!==undefined&&light.polygon!==null&&(!Array.isArray(light.polygon)||light.polygon.length<3))throw new TypeError(`${name}: a polygon needs three points`);
    return shape;
}
/**
 * The lights an object carries, in the world at its pose, for the light layer: its data's `lights` (a template's
 * or a placement's `lights`: lamps, signs, searchlights, each a light record whose `position` and `rotation` are
 * in the object's own frame, as its drawing is) and its `emission` (a map light or a prop's `light`; a `strip`
 * is an area light). They turn and move with the object; each is `still` (cached in the light tiles) unless it
 * says otherwise or the object moves. A "$name" colour is read from the object's look values. With `view` (a
 * heightView, leaning) a light with a `height` is drawn where that height leans to: a lamp on its post, a
 * searchlight on its crown. A light that says `shadows` ('static', 'dynamic' or 'none') keeps it, with its `origin` on
 * the ground (before any lean) and the height it shines from (`at_height`), for renderSystem.setLightShadows.
 */
/** The light group a thing is in (its `light_group`: a street lamp's 'street_lights'), or null. */
export function lightGroupOf(body){const g=(typeof body?.get==='function'?body.get('light_group'):undefined)??body?.light_group??body?.data?.light_group??null;return typeof g==='string'&&g?g:null;}
export function entityLights(body,{pose=null,view=null}={}){
    const data=typeof body.get==='function'?{lights:body.get('lights'),emission:body.get('emission'),look:body.get('look')}:body.data??{};
    const list=[...(data.lights??[]),...(data.emission?[{...data.emission,shape:data.emission.shape==='strip'?'area':data.emission.shape}]:[])];
    if(!list.length)return [];
    // (an entity's physics_type and elevation each copy its whole body state: read it once, and only for what carries a light)
    const state=typeof body.body?.getState==='function'?body.body.getState():body,elevation=state.elevation??0;
    const at=pose?.position??body.position,a=pose?.rotation??body.rotation??0,c=Math.cos(a),s=Math.sin(a),values=data.look?.values??{};
    const moving=state.physics_type==='dynamic'||body.kind==='character'||body.kind==='vehicle';
    const read=v=>typeof v==='string'&&v.startsWith('$')?values[v.slice(1)]??null:v;
    return list.map((l,i)=>{
        const {position=[0,0],rotation=0,polygon,animation,shadows,look,soft,...rest}=l,[x,y]=position;
        const ground=[at[0]+x*c-y*s,at[1]+x*s+y*c];let where=ground;if(view&&rest.height>0)where=view.scaled(where[0],where[1],view.k(rest.height+elevation));
        const out={...rest,shape:rest.shape??'point',position:where,rotation:a+rotation,still:l.still??!moving};
        // (what casts its shadow, for renderSystem.setLightShadows: its `shadows` and where it stands on the ground, before any lean)
        if(shadows!==undefined&&shadows!==null){out.shadows=shadows;out.origin=ground;out.at_height=(rest.height??0)+elevation;}
        for(const k of ['color'])if(out[k]!==undefined)out[k]=read(out[k]);
        if(out.color===null)delete out.color;if(out.intensity===null)delete out.intensity;if(out.glow===null)delete out.glow;
        validLight(out,i);return out;
    });
}
/**
 * The light layer's packets.
 *  bounds   {left, top, right, bottom}: where the dark is drawn (the view, with a margin)
 *  tint     the dark's colour, any CSS colour
 *  areas    [{rects: [{x, y, w, h}] | polygon: [[x, y], ...], cut}]: the dark thinned by `cut` (0..1) there
 *  lights   [{position, shape: 'point' | 'area' | 'beam', radius | size + round | length + width + near_width,
 *            rotation, inner_radius, polygon, intensity, cut: [[offset, alpha]], color, glow, glow_stops: [[offset, colour]]}]
 *           A point light cuts a radial gradient from inner_radius to radius (shaped by `cut`, scaled by
 *           `intensity` up to 1), limited to `polygon` when given (from getVisibilityPolygon). Its colour
 *           is added after every cut at `glow` opacity, through `glow_stops` (default: colour fading out).
 *           An area light does the same over a rounded strip of `size` turned by `rotation`; a beam (a
 *           headlight) from `near_width` either side at its position to `width` either side `length` ahead
 *           along `rotation`, fading along it, softer toward its edges and limited to `polygon` when given.
 *           A light marked `over: true` stands above what stands tall (a searchlight on a crown, a rooftop
 *           sign): it is drawn after `over` below, so no roof covers it, and is never cached.
 *  cuts     more packets that thin the dark, drawn as cuts after the lights' (a reflection pass's
 *           darknessCut(): the night lifted where a reflection shines). createLightLayerParts takes them too.
 *  over     what stands over the light on the ground, in the order it is drawn: [{packet, over}], a `cover`
 *           laying the plain dark back over every light and glow (a roof leaning over the street's light)
 *           and a `shine` cut out of the dark so it shows at full strength (a lit window). Drawn last, so a
 *           nearer cover hides a farther shine as the scene does (renderSystem.nightOver() gives them after
 *           drawLooks). createLightLayerParts takes it too.
 */
export function createLightLayer({bounds,tint,areas=[],lights=[],cuts=[],over=[]},{scene=new artScene()}={}){
    const {left,top,right,bottom}=bounds??{};for(const v of [left,top,right,bottom])finite(v,'bounds');
    if(typeof tint!=='string'||!tint)throw new TypeError('The light layer needs a tint colour');
    scene.fill(rect(left,top,right-left,bottom-top),tint);
    thin(scene,areas);
    const shapes=lights.map(validLight);
    lights.forEach((l,i)=>cut(scene,l,shapes[i]));
    lights.forEach((l,i)=>glow(scene,l,shapes[i]));
    return [...scene.finish(),...extraCuts(cuts),...nightOver(over,tint)];
}
/**
 * The same layer, split so what holds still between frames is painted once. Lights marked `still: true`
 * go into pictures over `extent` ({left, top, right, bottom}: the whole map, not the view): the dark with
 * their cuts and the areas' thinning, and their colour. The other lights stay live packets. Returns the parts for
 * a layer pass (each picture part as a picture packet), in order: the dark pictures, the live cuts, the colour pictures (added), the
 * live colour. Cuts (destination-out) and colour (add) each commute, so it is the layer createLightLayer
 * draws.
 *
 * A light marked `still: 'glow'` keeps only its colour in the pictures and cuts live: a lamp whose shadow
 * is moving (its colour is not shadowed). The dark and the colour pictures are keyed apart, so one
 * repaints without the other.
 *
 * With `tile_size` the pictures are tiles of that size over the extent (a map's regions), and only the
 * tiles meeting `view` are returned: a big map keeps only the tiles near the camera, and a change repaints
 * only the tiles its light reaches. A tile no still light reaches and no light grid lights (`peakIn`) is the plain dark, with no pictures. The tiles within `ahead` of the view (px all round, or per-side margins
 * `{left, top, right, bottom}` such as camera `aheadOf` gives) come last, marked `prepare`:
 * drawLayer paints them into the cache when the frame's budget allows and draws nothing, so the camera
 * finds them ready. Pass every still light that reaches them; `waiting` lists the reaches
 * ([left, top, right, bottom]) of lights not ready yet (a shadow still to cast), and a tile one of them
 * reaches is not readied until it is, so it is painted once, whole. A picture's key names the tint, its
 * tile, the areas over it and every still light that reaches it; a light's `polygon` is known by its array, so give a new array when the shadow changes.
 * `key` prefixes the pictures' keys.
 */
export function createLightLayerParts({extent,tint,areas=[],lights=[],grids=[],cuts:more=[],over=[],key='light',tile_size=null,view=null,ahead=0,waiting=[]}){
    const {left,top,right,bottom}=extent??{};for(const v of [left,top,right,bottom])finite(v,'extent');
    if(typeof tint!=='string'||!tint)throw new TypeError('The light layer needs a tint colour');
    const all=lights.map(l=>{const shape=validLight(l);return [l,shape,reach(l,shape),l.still?digests(l):null];});
    const cutStill=all.filter(([l])=>l.still===true&&l.over!==true),glowStill=all.filter(([l])=>(l.still===true||l.still==='glow')&&l.over!==true);
    const darks=[],glows=[],ready=[],near=view&&viewAhead(view,ahead);
    const meets=([x,y,w,h])=>([,,r])=>r[0]<x+w&&r[2]>x&&r[1]<y+h&&r[3]>y;
    const lighted=grids.filter(g=>g&&g.peak>=.004).map(g=>[g,null,[g.left,g.top,g.right,g.bottom]]);
    const shades=areas.filter(a=>finite(a.cut,'area cut',0)>=.001).map(a=>[a,null,areaReach(a)]).filter(([,,r])=>r);
    for(const tile of tiles(extent,tile_size,near)){
        const shown=!view||(tile[0]<view.right&&tile[0]+tile[2]>view.left&&tile[1]<view.bottom&&tile[1]+tile[3]>view.top);
        const cuts=cutStill.filter(meets(tile)),lit=glowStill.filter(meets(tile)).filter(([l])=>l.color&&(l.glow??0)>=.001),thinned=shades.filter(meets(tile)).map(([a])=>a),bright=lighted.filter(meets(tile)).map(([g])=>g).filter(g=>typeof g.peakIn!=='function'||g.peakIn(tile)>=.004);
        const picture=(part,list,paint,extra)=>({key:`${key}:${signature(tint,tile,list,part,extra,bright)}:${part}`,bounds:tile,build(){const scene=new artScene();paint(scene);return scene.finish();}});
        // the dark is one plain fill under every tile (tiles laid edge to edge would leave a hairline where their
        // soft edges meet); a tile holds only what is cut out of it, painted white and cut with destination-out
        const dark=cuts.length||thinned.length||bright.length?{picture:picture('dark',cuts,scene=>{thin(scene,thinned,'normal');for(const [l,shape] of cuts)cut(scene,l,shape,'normal');for(const g of bright)drawLightGrid(scene,g,'cut',{clip:tile,blend:'normal'});},thinned),blend:'destination-out'}:null;
        const colour=lit.length||bright.length?{picture:picture('glow',lit,scene=>{for(const [l,shape] of lit)glow(scene,l,shape);for(const g of bright)drawLightGrid(scene,g,'glow',{clip:tile});}),blend:'add'}:null;
        if(shown){if(dark)darks.push(dark);if(colour)glows.push(colour);}
        else if(waiting.some(r=>meets(tile)([,,r])))continue;
        else{if(dark)ready.push({...dark,prepare:true});if(colour)ready.push({...colour,prepare:true});}
    }
    const cuts=new artScene(),colour=new artScene(),cutStamps=[],colourStamps=[],aloft=new artScene();
    for(const [l,shape] of all){
        if(l.over===true){cut(aloft,l,shape);glow(aloft,l,shape);continue;}   // (aloft: drawn over what stands tall, below)
        if(l.still==='stamp'){const [c,g]=stamps(key,l,shape);if(c)cutStamps.push(c);if(g)colourStamps.push(g);continue;}
        if(l.still!==true)cut(cuts,l,shape);if(!l.still)glow(colour,l,shape);
    }
    const plain=new artScene();plain.fill(rect(left,top,right-left,bottom-top),tint);
    return [...plain.finish(),...darks,...cutStamps,...cuts.finish(),...extraCuts(more),...glows,...colourStamps,...colour.finish(),...nightOver(over,tint),...aloft.finish(),...ready];
}
/**
 * A light whose shape holds still while its strength changes (a pulsing sign, a stuttering lamp, a shot in
 * flight): its cut and its colour each painted once as a picture at full strength round its own origin,
 * keyed by its shape alone, and stamped where it is, turned as it is, at its strength. Shots of one kind
 * share one picture.
 */
function stamps(key,l,shape){
    const [x,y]=l.position,a=l.rotation??0,c=Math.cos(a),s=Math.sin(a),matrix=[c,s,-s,c,x,y];
    const local={...l,position:[0,0],rotation:0,intensity:1,glow:1,polygon:l.polygon?l.polygon.map(([px,py])=>[(px-x)*c+(py-y)*s,-(px-x)*s+(py-y)*c]):null};
    const [rl,rt,rr,rb]=reach(local,shape),bounds=[rl,rt,rr-rl,rb-rt];
    if(l.polygon&&!polygonIds.has(l.polygon))polygonIds.set(l.polygon,++polygonCount);
    const id=digests({...local,polygon:null}),ring=l.polygon?`~${polygonIds.get(l.polygon)}`:'';   // (a shadow by its array: a new one when it changes)
    const picture=(part,draw)=>({key:`${key}:stamp:${id[part].toString(36)}${ring}:${part}`,bounds,matrix,build(){const scene=new artScene();draw(scene,local,shape);return scene.finish();}});
    const k=Math.min(1,l.intensity??1),g=Math.min(1,l.glow??0);
    return [k>=.001?{picture:picture('dark',(scene,lt,sh)=>cut(scene,lt,sh,'normal')),blend:'destination-out',opacity:k}:null,
        g>=.001&&l.color?{picture:picture('glow',(scene,lt,sh)=>glow(scene,lt,sh,'normal')),blend:'add',opacity:g}:null];
}
/** An area's reach as [left, top, right, bottom], or null when it has no shape. */
function areaReach(a){
    const points=a.polygon??(a.rects??[]).flatMap(q=>[[q.x,q.y],[q.x+q.w,q.y+q.h]]);if(!points.length)return null;
    const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
}
/** A light's reach as [left, top, right, bottom]. */
function reach(l,shape){
    const [x,y]=l.position;
    if(shape==='point'){const r=l.radius;return [x-r,y-r,x+r,y+r];}
    const c=Math.cos(l.rotation??0),s=Math.sin(l.rotation??0),n=l.near_width??15;
    const corners=shape==='area'?[[-l.size[0]/2,-l.size[1]/2],[l.size[0]/2,-l.size[1]/2],[l.size[0]/2,l.size[1]/2],[-l.size[0]/2,l.size[1]/2]]:[[0,-n],[l.length,-l.width],[l.length,l.width],[0,n]];
    const xs=corners.map(([u,v])=>x+u*c-v*s),ys=corners.map(([u,v])=>y+u*s+v*c);
    return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
}
/** The extent whole, or its tiles of `size` that meet `view`, each [x, y, w, h] (edge tiles cut to the extent). */
function tiles({left,top,right,bottom},size,view){
    if(!size)return [[left,top,right-left,bottom-top]];
    finite(size,'tile_size',1);
    const v=view??{left,top,right,bottom},out=[];
    const x0=Math.max(left,left+Math.floor((v.left-left)/size)*size),y0=Math.max(top,top+Math.floor((v.top-top)/size)*size);
    for(let x=x0;x<Math.min(right,v.right);x+=size)for(let y=y0;y<Math.min(bottom,v.bottom);y+=size)out.push([x,y,Math.min(size,right-x),Math.min(size,bottom-y)]);
    return out;
}
/** The dark thinned where an area is lit. */
function thin(scene,areas,blend='destination-out'){
    for(const a of areas){const k=finite(a.cut,'area cut',0);if(k<.001)continue;
        const shape=a.polygon?polygonPath(a.polygon):(a.rects??[]).flatMap(q=>rect(q.x,q.y,q.w,q.h));if(!shape.length)continue;
        scene.enter({},{blend,opacity:Math.min(1,k)});scene.fill(shape,'#ffffff');scene.leave();}
}
/** A light's cut out of the dark. */
function cut(scene,l,shape,blend='destination-out'){
    const k=Math.min(1,l.intensity??1);if(k<.001)return;const stops=(l.cut??LIGHT_CUT).map(([o,a])=>[o,white(a)]);
    if(shape==='area'){area(scene,l.position,l.size,l.round,stops,k,blend,l.rotation);return;}
    if(shape==='beam'){beam(scene,l,stops,k,blend);return;}
    const [x,y]=l.position,outline=l.polygon?polygonPath(l.polygon):[circle(x,y,l.radius)];
    scene.enter({},{blend,opacity:k});scene.fill(outline,radial([x,y],l.inner_radius??0,[x,y],l.radius,stops));scene.leave();
}
/** A light's colour, added. */
function glow(scene,l,shape,blend='add'){
    const k=Math.min(1,l.glow??0);if(k<.001||!l.color)return;const stops=l.glow_stops??[[0,l.color],[1,'rgba(0,0,0,0)']];
    if(shape==='area'){area(scene,l.position,l.size,l.round,stops,k,blend,l.rotation);return;}
    if(shape==='beam'){beam(scene,l,stops,k,blend);return;}
    const [x,y]=l.position;scene.enter({},{blend,opacity:k});scene.fill([circle(x,y,l.radius)],radial([x,y],0,[x,y],l.radius,stops));scene.leave();
}
/** Packets that lift the dark more (a reflection's light target, a sprite): drawn as cuts, after the lights' (cuts commute). */
const extraCuts=list=>list.map(p=>({...p,blend:'destination-out'}));
// What stands over the light, in the order it is drawn: a cover lays the plain dark back (the layer cleared
// there, then the dark alone), a shine is cut out of it (see renderSystem.nightOver).
const nightOver=(list,tint)=>list.flatMap(({packet:p,over})=>{
    // (one depth for all: the frame sorts a pass by depth, and these keep the order they come in)
    if(over==='shine')return [{...p,blend:'destination-out',layer:0,depth:0}];
    if(over==='cover')return [{...p,blend:'destination-out',layer:0,depth:0},{...p,material:{...p.material,fill:tint,stroke:null},blend:'normal',layer:0,depth:0}];
    throw new TypeError('A light layer `over` entry is {packet, over: "cover" | "shine"}');
});
const polygonIds=new WeakMap();let polygonCount=0;
const bits=new Float64Array(1),words=new Uint32Array(bits.buffer);
/** FNV-1a over plain values (numbers, strings, arrays of them, null, booleans) as they are, without text: `hash = 0x811c9dc5`, then `add` each. */
let hash=0;
const mix=w=>{hash=Math.imul(hash^w,0x01000193);};
function add(v){
    if(typeof v==='number'){bits[0]=v;mix(words[0]);mix(words[1]);}
    else if(typeof v==='string'){mix(0x73);for(let i=0;i<v.length;i++)mix(v.charCodeAt(i));mix(v.length);}
    else if(Array.isArray(v)){mix(0x5b);for(let i=0;i<v.length;i++)add(v[i]);mix(0x5d);}
    else mix(v===null?0x6e:v===undefined?0x75:v===true?0x74:v===false?0x66:0x6f);
}
/** A still light's two digests, once a frame: what its cut draws (its polygon by identity) and what its colour draws. */
function digests(l){
    if(l.polygon&&!polygonIds.has(l.polygon))polygonIds.set(l.polygon,++polygonCount);
    hash=0x811c9dc5;add(l.shape);add(l.position);add(l.radius);add(l.size);add(l.round);add(l.rotation);add(l.length);add(l.width);add(l.near_width);const base=hash;
    add(l.inner_radius);add(l.polygon?polygonIds.get(l.polygon):0);add(l.intensity);add(l.cut);const dark=hash>>>0;
    hash=base;add(l.color);add(l.glow);add(l.glow_stops);
    return {dark,glow:hash>>>0};
}
/** A short hash of everything a still picture shows: its tint, tile and part, the areas over it by value and its lights' digests. */
function signature(tint,bounds,still,part,areas=[],grids=[]){
    hash=0x811c9dc5;add(tint);add(bounds);add(part);for(const g of grids)add(g.key);
    for(const a of areas){mix(0x61);add(a.cut);if(a.polygon)add(a.polygon);else for(const q of a.rects)add([q.x,q.y,q.w,q.h]);}
    for(const entry of still)mix(entry[3][part]);
    return (hash>>>0).toString(36)+still.length;
}

// ----- The light grid ---------------------------------------------------------------------------
// Glowing shapes (steps marked `emits`, see art.mjs) light what is round them without being lights: a
// small grid of the light arriving at each cell, baked once per region and re-baked only when something
// glowing in it changes, like EEVEE's irradiance volume in 2D. The light layer draws it as one more still
// part of its tiles: a cut that thins the dark where the grid is bright, and the grid's colour, added.

/** The light grid's defaults: cell size (16 or 32 world units), blur passes, overall strength, how much of
 *  the dark a fully lit cell cuts (by its brightest channel, so a deep neon lifts it like white), how strongly its colour is added, and what a wall passes on. */
export const LIGHT_GRID=Object.freeze({cell:32,spread:3,strength:1,cut:.9,glow:.35,pass:.06});
export const LIGHT_GRID_CELLS=Object.freeze([16,32]);
const GRID_FIELDS=Object.freeze(['cell','spread','strength','cut','glow','pass','regions']);
/** A map's `light_grid` in its one form (unknown fields refused): the defaults with its own, and `regions` {key: {cell, ...}}. */
export function readLightGrid(settings={}){
    if(!settings||typeof settings!=='object'||Array.isArray(settings))throw new TypeError('light_grid is {cell, spread, strength, cut, glow, pass, regions}');
    for(const key of Object.keys(settings))if(!GRID_FIELDS.includes(key))throw new TypeError(`Unknown light_grid field: ${key} (one of ${GRID_FIELDS.join(', ')})`);
    const one=(s,where)=>{const out={...LIGHT_GRID};for(const key of Object.keys(LIGHT_GRID))if(s[key]!==undefined)out[key]=s[key];
        if(!LIGHT_GRID_CELLS.includes(out.cell))throw new TypeError(`${where}.cell is 16 or 32`);
        if(!(Number.isInteger(out.spread)&&out.spread>=0&&out.spread<=8))throw new TypeError(`${where}.spread is a whole number of passes, 0 to 8`);
        for(const key of ['strength','cut','glow'])if(!(Number.isFinite(out[key])&&out[key]>=0))throw new TypeError(`${where}.${key} is a number of 0 or more`);
        if(!(out.pass>=0&&out.pass<=1))throw new TypeError(`${where}.pass is 0..1`);return out;};
    const base=one(settings,'light_grid'),regions={};
    for(const [key,s] of Object.entries(settings.regions??{})){if(!s||typeof s!=='object')throw new TypeError(`light_grid.regions.${key} is {cell, ...}`);
        for(const k of Object.keys(s))if(!Object.hasOwn(LIGHT_GRID,k))throw new TypeError(`Unknown light_grid.regions.${key} field: ${k}`);regions[key]=one({...base,...s},`light_grid.regions.${key}`);}
    return {...base,regions};
}

// Scratch arrays a bake reuses, by name, grown as needed: no garbage a bake, so baking does not wake the collector.
const SCRATCH=new Map();
function scratch(name,size,Type){let a=SCRATCH.get(name);if(!a||a.length<size){a=new Type(size);SCRATCH.set(name,a);}return size===a.length?a:a.subarray(0,size);}
const DI=Object.freeze([-1,0,1,-1,1,-1,0,1]),DJ=Object.freeze([-1,-1,-1,0,0,1,1,1]),KW=Object.freeze(DI.map((di,q)=>di&&DJ[q]?.5:1));
// Geometry for the bake: boxes are [left, top, right, bottom], outlines lists of [x, y].
const insideOutline=(px,py,pts)=>{let inside=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const [xi,yi]=pts[i],[xj,yj]=pts[j];if((yi>py)!==(yj>py)&&px<(xj-xi)*(py-yi)/(yj-yi)+xi)inside=!inside;}return inside;};
// The point of an emitter nearest (px, py) goes in NX, NY and its distance in ND (0 inside a closed shape; less half
// its width along a line): no arrays made, as a bake asks this for every cell in every emitter's reach.
let NX=0,NY=0,ND=0;
const isBox=pts=>pts.length===4&&pts[0][1]===pts[1][1]&&pts[1][0]===pts[2][0]&&pts[2][1]===pts[3][1]&&pts[3][0]===pts[0][0];
function nearestOnEmitter(e,box,px,py){
    if(box){const B=e.bounds,l=B[0],t=B[1],r=B[2],b=B[3];NX=px<l?l:px>r?r:px;NY=py<t?t:py>b?b:py;const dx=NX-px,dy=NY-py;ND=Math.sqrt(dx*dx+dy*dy);return;}
    const pts=e.outline;if(!e.open&&pts.length>2&&insideOutline(px,py,pts)){NX=px;NY=py;ND=0;return;}
    let best=Infinity;NX=pts[0][0];NY=pts[0][1];
    const n=e.open?pts.length-1:pts.length;
    for(let i=0;i<n;i++){const a=pts[i],b=pts[(i+1)%pts.length],ax=a[0],ay=a[1],ex=b[0]-ax,ey=b[1]-ay,L=ex*ex+ey*ey,t=L?Math.max(0,Math.min(1,((px-ax)*ex+(py-ay)*ey)/L)):0,qx=ax+ex*t,qy=ay+ey*t,d=(qx-px)**2+(qy-py)**2;if(d<best){best=d;NX=qx;NY=qy;}}
    if(pts.length===1)best=(px-NX)**2+(py-NY)**2;
    ND=Math.max(0,Math.sqrt(best)-(e.width??0)/2);
}
/** Whether the segment (ax, ay)–(bx, by) passes through a blocker (a box or an outline). */
function crosses(b,ax,ay,bx,by){
    if(b.box){const [l,t,r,btm]=b.box;let t0=0,t1=1;const dx=bx-ax,dy=by-ay;
        for(const [p,q] of [[-dx,ax-l],[dx,r-ax],[-dy,ay-t],[dy,btm-ay]]){if(p===0){if(q<0)return false;continue;}const k=q/p;if(p<0){if(k>t1)return false;if(k>t0)t0=k;}else{if(k<t0)return false;if(k<t1)t1=k;}}
        return t0<t1;}
    const pts=b.outline;if(insideOutline(ax,ay,pts)||insideOutline(bx,by,pts))return true;
    for(let i=0,j=pts.length-1;i<pts.length;j=i++){const [x1,y1]=pts[j],[x2,y2]=pts[i],d=(bx-ax)*(y2-y1)-(by-ay)*(x2-x1);if(!d)continue;
        const u=((x1-ax)*(y2-y1)-(y1-ay)*(x2-x1))/d,v=((x1-ax)*(by-ay)-(y1-ay)*(bx-ax))/d;if(u>0&&u<1&&v>=0&&v<=1)return true;}
    return false;
}
const containsPoint=(b,x,y)=>b.box?x>b.box[0]&&x<b.box[2]&&y>b.box[1]&&y<b.box[3]:insideOutline(x,y,b.outline);
const blockerOf=b=>{const out=Array.isArray(b)?{box:b}:b.box?{box:b.box}:{outline:b.outline};
    out.bounds=out.box??[Math.min(...out.outline.map(p=>p[0])),Math.min(...out.outline.map(p=>p[1])),Math.max(...out.outline.map(p=>p[0])),Math.max(...out.outline.map(p=>p[1]))];return out;};
const hexRgb=hex=>{const h=hex.length===4?[...hex.slice(1)].map(c=>c+c).join(''):hex.slice(1);return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255);};

/**
 * Bakes one region's light grid: every emitter (drawingEmitters' form: {outline, open, width, bounds,
 * color, strength, reach, height}) adds its colour to each cell in reach, falling off with distance as
 * (1 - d / R)² where d counts its height (√(d² + height²)) and R = reach + height, so a high window
 * reaches farther and softer; a cell a blocker hides from the emitter's nearest point takes only `pass`
 * of it. Then `spread` blur passes bleed the light round corners: a cell inside a blocker takes no light,
 * and light crossing a blocker between two cells keeps only `pass`. Blockers are boxes [left, top, right,
 * bottom] or {outline}; an emitter standing inside a blocker (a sign on a wall) is not hidden by it.
 *  bounds   {left, top, right, bottom}: the region, cut into cells of `cell` world units
 * Returns a lightGrid: {left, top, cell, cols, rows, light (Float32Array, rgb per cell, 0..1 and over),
 * key (a hash of its light, so a picture of it is keyed by what it shows), settings, sample(x, y)}.
 * Emitters and blockers past the region (within an emitter's reach) should be passed too. With `margin` (cells)
 * it is baked that much wider and cut back, so its edge cells see the light past them as the region beside it
 * does and two regions' grids meet without a seam (give `spread` or more).
 */
export function bakeLightGrid({bounds,cell=LIGHT_GRID.cell,emitters=[],blockers=[],spread=LIGHT_GRID.spread,strength=LIGHT_GRID.strength,pass=LIGHT_GRID.pass,cut=LIGHT_GRID.cut,glow=LIGHT_GRID.glow,margin=0}){
    const {left,top,right,bottom}=bounds??{};for(const v of [left,top,right,bottom])finite(v,'grid bounds');
    if(margin>0){   // (baked wider and cut back, so the spread at the edge sees the light past it, as the region beside it does)
        const m=Math.ceil(margin)*cell,wide=bakeLightGrid({bounds:{left:left-m,top:top-m,right:right+m,bottom:bottom+m},cell,emitters,blockers,spread,strength,pass,cut,glow});
        const cols=Math.max(1,Math.ceil((right-left)/cell)),rows=Math.max(1,Math.ceil((bottom-top)/cell)),k=Math.ceil(margin),light=new Float32Array(cols*rows*3);
        for(let j=0;j<rows;j++)light.set(wide.light.subarray(((j+k)*wide.cols+k)*3,((j+k)*wide.cols+k+cols)*3),j*cols*3);
        const rim=new Float32Array((cols+2)*(rows+2)*3);   // (the cells and a ring of the margin, so a drawn grid blends into the one beside it)
        for(let j=0;j<rows+2;j++)rim.set(wide.light.subarray(((j+k-1)*wide.cols+k-1)*3,((j+k-1)*wide.cols+k+cols+1)*3),j*(cols+2)*3);
        return new lightGrid({left,top,cell,cols,rows,light,rim,key:gridKey(left,top,cell,cols,rows,cut,glow,rim),cut,glow});
    }
    if(!LIGHT_GRID_CELLS.includes(cell))throw new TypeError('A light grid cell is 16 or 32 world units');
    const cols=Math.max(1,Math.ceil((right-left)/cell)),rows=Math.max(1,Math.ceil((bottom-top)/cell)),n=cols*rows,light=new Float32Array(n*3);
    const walls=blockers.map(blockerOf).filter(b=>b.bounds[0]<right+cell&&b.bounds[2]>left-cell&&b.bounds[1]<bottom+cell&&b.bounds[3]>top-cell);
    const cx=i=>left+(i+.5)*cell,cy=j=>top+(j+.5)*cell;
    const solid=new Uint8Array(n),span=([l,t,r,b],pad=0)=>[Math.max(0,Math.floor((l-pad-left)/cell)),Math.min(cols-1,Math.floor((r+pad-left)/cell)),Math.max(0,Math.floor((t-pad-top)/cell)),Math.min(rows-1,Math.floor((b+pad-top)/cell))];
    for(const w of walls){const [i0,i1,j0,j1]=span(w.bounds);for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++)if(containsPoint(w,cx(i),cy(j)))solid[j*cols+i]=1;}
    for(const e of emitters){
        const k=e.strength*strength;if(!(k>0))continue;
        const h=e.height??0,R=e.reach+h,[el,et,er,eb]=e.bounds;
        if(er+R<left||el-R>right||eb+R<top||et-R>bottom)continue;
        const near=walls.filter(b=>b.bounds[0]<er+R&&b.bounds[2]>el-R&&b.bounds[1]<eb+R&&b.bounds[3]>et-R);
        const [r,g,b]=hexRgb(e.color),box=!e.open&&isBox(e.outline);
        const i0=Math.max(0,Math.floor((el-R-left)/cell)),i1=Math.min(cols-1,Math.floor((er+R-left)/cell)),j0=Math.max(0,Math.floor((et-R-top)/cell)),j1=Math.min(rows-1,Math.floor((eb+R-top)/cell));
        for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){
            const c=j*cols+i;if(solid[c])continue;
            const px=cx(i),py=cy(j);nearestOnEmitter(e,box,px,py);const qx=NX,qy=NY,d=ND,de=Math.sqrt(d*d+h*h);if(de>=R)continue;
            let f=k*(1-de/R)**2;
            if(d>0){const x0=Math.min(px,qx),x1=Math.max(px,qx),y0=Math.min(py,qy),y1=Math.max(py,qy);
                for(const w of near){const b=w.bounds;if(b[0]>x1||b[2]<x0||b[1]>y1||b[3]<y0)continue;if(!containsPoint(w,qx,qy)&&crosses(w,px,py,qx,qy)){f*=pass;break;}}}
            light[c*3]+=r*f;light[c*3+1]+=g*f;light[c*3+2]+=b*f;
        }
    }
    // Spread, only over the lit cells and `spread` round them (light moves a cell a pass).
    let li=cols,lj=rows,hi=-1,hj=-1;for(let c=0;c<n;c++)if(light[c*3]+light[c*3+1]+light[c*3+2]>0){const i=c%cols,j=(c-i)/cols;if(i<li)li=i;if(i>hi)hi=i;if(j<lj)lj=j;if(j>hj)hj=j;}
    if(spread>0&&hi>=0){
        const I0=Math.max(0,li-spread),I1=Math.min(cols-1,hi+spread),J0=Math.max(0,lj-spread),J1=Math.min(rows-1,hj+spread);
        // A cell near a blocker (or at the box's edge) keeps its eight neighbour weights: half on diagonals, `pass`
        // across a blocker or into one, none outside the box. Every other cell takes the plain kernel.
        const slot=scratch('slot',n,Int32Array).fill(-1),W=scratch('weights',n*8,Float32Array),local=[];let used=0;
        for(let j=J0;j<=J1;j++)for(let i=I0;i<=I1;i++){
            const c=j*cols+i,x=cx(i),y=cy(j);local.length=0;
            for(const w of walls)if(w.bounds[0]<x+cell&&w.bounds[2]>x-cell&&w.bounds[1]<y+cell&&w.bounds[3]>y-cell)local.push(w);
            let plain=!local.length&&i>I0&&i<I1&&j>J0&&j<J1;
            if(plain)for(let q=0;q<8;q++)if(solid[(j+DJ[q])*cols+i+DI[q]]){plain=false;break;}
            if(plain)continue;
            slot[c]=used++;
            for(let q=0;q<8;q++){const a=i+DI[q],b=j+DJ[q];if(a<I0||a>I1||b<J0||b>J1){W[slot[c]*8+q]=0;continue;}const o=b*cols+a;
                let w=(DI[q]&&DJ[q]?.5:1)*(solid[o]?pass:1);
                if(local.length){const ax=cx(a),ay=cy(b);for(const k of local)if(crosses(k,x,y,ax,ay)){w*=pass;break;}}
                W[slot[c]*8+q]=w;}
        }
        const OFF=DI.map((di,q)=>(DJ[q]*cols+di)*3);
        let src=light,dst=scratch('spread',n*3,Float32Array);
        for(let p=0;p<spread;p++){
            for(let j=J0;j<=J1;j++)for(let c=j*cols+I0,e=j*cols+I1;c<=e;c++){
                const c3=c*3;
                if(solid[c]){dst[c3]=dst[c3+1]=dst[c3+2]=0;continue;}
                let wr=2,sr=src[c3]*2,sg=src[c3+1]*2,sb=src[c3+2]*2;const k=slot[c];
                if(k<0){for(let q=0;q<8;q++){const o=c3+OFF[q],w=KW[q];wr+=w;sr+=src[o]*w;sg+=src[o+1]*w;sb+=src[o+2]*w;}}
                else for(let q=0;q<8;q++){const w=W[k*8+q];if(!w)continue;const o=c3+OFF[q];wr+=w;sr+=src[o]*w;sg+=src[o+1]*w;sb+=src[o+2]*w;}
                dst[c3]=sr/wr;dst[c3+1]=sg/wr;dst[c3+2]=sb/wr;
            }
            [src,dst]=[dst,src];
        }
        if(src!==light)for(let j=J0;j<=J1;j++)light.set(src.subarray((j*cols+I0)*3,(j*cols+I1+1)*3),(j*cols+I0)*3);   // (the scratch holds other bakes' cells outside the box)
    }
    return new lightGrid({left,top,cell,cols,rows,light,key:gridKey(left,top,cell,cols,rows,cut,glow,light),cut,glow});
}
function gridKey(left,top,cell,cols,rows,cut,glow,light){hash=0x811c9dc5;add(left);add(top);add(cell);add(cols);add(rows);add(cut);add(glow);for(let i=0;i<light.length;i++)mix(Math.round(light[i]*1024));return (hash>>>0).toString(36);}
/**
 * A grid with the cells of `part` ({left, top, right, bottom}, cut to whole cells) taken from `patch`, a grid
 * baked on the same cells over an area round it: how a moving emitter re-bakes only the cells it passes
 * through. Bake `patch` over `part` grown by `spread` cells each side (within the grid), so its own edges,
 * which see no light from past them, stay out of what is copied. Returns a new grid; `grid` is unchanged.
 */
export function patchLightGrid(grid,patch,part){
    const {left,top,cell,cols,rows}=grid;
    if(patch.cell!==cell||(patch.left-left)%cell||(patch.top-top)%cell)throw new TypeError('A patch is baked on the grid\'s own cells');
    const i0=Math.max(0,Math.floor((part.left-left)/cell)),i1=Math.min(cols-1,Math.ceil((part.right-left)/cell)-1),j0=Math.max(0,Math.floor((part.top-top)/cell)),j1=Math.min(rows-1,Math.ceil((part.bottom-top)/cell)-1);
    const light=grid.light.slice(),rim=grid.rim?.slice()??null,di=(patch.left-left)/cell,dj=(patch.top-top)/cell;
    for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const a=i-di,b=j-dj;if(a<0||a>=patch.cols||b<0||b>=patch.rows)continue;const o=(j*cols+i)*3,q=(b*patch.cols+a)*3;light[o]=patch.light[q];light[o+1]=patch.light[q+1];light[o+2]=patch.light[q+2];}
    if(rim)for(let j=j0-(j0===0);j<=j1+(j1===rows-1);j++)for(let i=i0-(i0===0);i<=i1+(i1===cols-1);i++){const a=i-di,b=j-dj;if(a<0||a>=patch.cols||b<0||b>=patch.rows)continue;const o=((j+1)*(cols+2)+i+1)*3,q=(b*patch.cols+a)*3;rim[o]=patch.light[q];rim[o+1]=patch.light[q+1];rim[o+2]=patch.light[q+2];}
    return new lightGrid({left,top,cell,cols,rows,light,rim,key:gridKey(left,top,cell,cols,rows,grid.cut,grid.glow,rim??light),cut:grid.cut,glow:grid.glow});
}
/** A baked light grid (see bakeLightGrid). `sample(x, y)` gives the light arriving there, [r, g, b], read between cell centres; `peak` is its brightest channel. */
export class lightGrid{
    constructor({left,top,cell,cols,rows,light,rim=null,key,cut=LIGHT_GRID.cut,glow=LIGHT_GRID.glow}){Object.assign(this,{left,top,cell,cols,rows,light,rim,key,cut,glow});this.right=left+cols*cell;this.bottom=top+rows*cell;let m=0;for(const v of light)if(v>m)m=v;this.peak=m;}
    sample(x,y){
        const {cols,rows,cell,light}=this,u=Math.max(0,Math.min(cols-1,(x-this.left)/cell-.5)),v=Math.max(0,Math.min(rows-1,(y-this.top)/cell-.5));
        const i=Math.floor(u),j=Math.floor(v),fx=u-i,fy=v-j,i1=Math.min(cols-1,i+1),j1=Math.min(rows-1,j+1),out=[0,0,0];
        for(let ch=0;ch<3;ch++){const a=light[(j*cols+i)*3+ch],b=light[(j*cols+i1)*3+ch],c=light[(j1*cols+i)*3+ch],d=light[(j1*cols+i1)*3+ch];out[ch]=(a*(1-fx)+b*fx)*(1-fy)+(c*(1-fx)+d*fx)*fy;}
        return out;
    }
    /**
     * The brightest channel arriving over [x, y, w, h] and a cell round it (as drawLightGrid reads it there, its rim
     * included), found once per box: a light tile that the grid does not light is left without its pictures.
     */
    peakIn([x,y,w,h]){
        const id=`${x},${y},${w},${h}`;this.#peaks??=new Map();const known=this.#peaks.get(id);if(known!==undefined)return known;
        const {cols,rows,cell}=this,r=this.rim?1:0,light=this.rim??this.light,stride=cols+2*r;
        const i0=Math.max(-r,Math.floor((x-this.left)/cell)-1),i1=Math.min(cols-1+r,Math.floor((x+w-this.left)/cell)+1),j0=Math.max(-r,Math.floor((y-this.top)/cell)-1),j1=Math.min(rows-1+r,Math.floor((y+h-this.top)/cell)+1);
        let m=0;for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const o=((j+r)*stride+i+r)*3;for(let ch=0;ch<3;ch++)if(light[o+ch]>m)m=light[o+ch];}
        if(this.#peaks.size>4096)this.#peaks.clear();this.#peaks.set(id,m);return m;
    }
    #peaks=null;
}
/**
 * The grid in `scene` (an artScene) as one small image, a pixel a cell, scaled up smoothly (read
 * between cell centres): `part` 'cut' is its brightness in white for a cut (in `blend`, default
 * destination-out), 'glow' its colour (default add). With `clip` [x, y, w, h], only the cells round it.
 * Each part's image is made once per grid.
 */
export function drawLightGrid(scene,grid,part,{clip=null,blend=part==='cut'?'destination-out':'add'}={}){
    const {cols,rows,cell}=grid,r=grid.rim?1:0;if(!((part==='cut'?grid.cut:grid.glow)>0))return scene;
    let i0=-r,i1=cols-1+r,j0=-r,j1=rows-1+r;
    if(clip){const [x,y,w,h]=clip;i0=Math.max(-r,Math.floor((x-grid.left)/cell)-1);i1=Math.min(cols-1+r,Math.floor((x+w-grid.left)/cell)+1);j0=Math.max(-r,Math.floor((y-grid.top)/cell)-1);j1=Math.min(rows-1+r,Math.floor((y+h-grid.top)/cell)+1);}
    if(i1<i0||j1<j0)return scene;
    const image=gridImage(grid,part),source=[i0+r,j0+r,i1-i0+1,j1-j0+1];
    // (one sprite over the cells, its pixels' centres on the cell centres; a clipped one keeps a cell more each side, so its edges read like the whole;
    //  a grid with a rim is cut back to its own bounds, the rim only there for the blend across to the grid beside it)
    scene.enter();if(r)scene.clip(rect(grid.left,grid.top,grid.right-grid.left,grid.bottom-grid.top));
    scene.enter({position:[grid.left+i0*cell,grid.top+j0*cell]},{blend});scene.sprite(image,source,cell);scene.leave();scene.leave();
    return scene;
}
const IMAGES=new WeakMap();
/** A grid part as RGBA pixels, a pixel a cell: the cut white at its brightness, the glow its colour at its strength. */
function gridImage(grid,part){
    let both=IMAGES.get(grid);if(!both)IMAGES.set(grid,both={});
    if(both[part])return both[part];
    const r=grid.rim?1:0,cols=grid.cols+2*r,rows=grid.rows+2*r,light=grid.rim??grid.light,k=part==='cut'?grid.cut:grid.glow,data=new Uint8ClampedArray(cols*rows*4);
    for(let c=0;c<cols*rows;c++){const R=light[c*3],G=light[c*3+1],B=light[c*3+2],o=c*4;
        if(part==='cut'){data[o]=data[o+1]=data[o+2]=255;data[o+3]=Math.round(Math.min(1,Math.max(R,G,B)*k)*255);}   // (a deep neon lifts the dark as much as a white light of its strength)
        else{const m=Math.max(R,G,B);if(m<=0)continue;data[o]=R/m*255;data[o+1]=G/m*255;data[o+2]=B/m*255;data[o+3]=Math.round(Math.min(1,m*k)*255);}}
    return both[part]={width:cols,height:rows,data};
}
/** The grid's packets alone, its colour by default: what a reflection target or a debug view draws. */
export function lightGridPackets(grid,part='glow',options={}){return drawLightGrid(new artScene(),grid,part,options).finish();}
