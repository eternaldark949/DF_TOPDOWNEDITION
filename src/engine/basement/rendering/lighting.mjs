// ===== LV0 BASEMENT =====
// THE LIGHT LAYER: darkness over the scene with light cut out of it. A layer is built as frame packets:
// the dark (a tint over the bounds), areas where the dark is thinner (a lit room, an open sky), each
// light's cut (its reach, shadowed by an optional visibility polygon), then each light's colour, added.
// Draw it over the finished scene at the dark's strength (canvasRenderer.drawLayer, or a render target).
import {artScene,rect,circle,radial,linear} from './art.mjs';

const finite=(value,name,min=-Infinity)=>{if(!Number.isFinite(value)||value<min)throw new TypeError(`Light ${name} must be a finite number`);return value;};
export const LIGHT_CUT=Object.freeze([[0,1],[1,0]]);
const white=a=>`rgba(255,255,255,${+a.toFixed(4)})`;
const polygonPath=points=>[['move',...points[0]],...points.slice(1).map(p=>['line',...p]),['close']];
/** A rounded strip light (a window, a lit doorway): a band across its middle and a half-ellipse cap at each end. */
function area(scene,[x,y],[w,h],round,stops,opacity,blend){
    const hw=w/2,hh=h/2,r=Math.max(0,Math.min(hw,round??hh)),x0=x-hw+r,x1=x+hw-r;
    scene.enter({},{opacity,blend});
    const band=[];for(const [o,c] of stops){band.push([.5-o/2,c],[.5+o/2,c]);}band.sort((a,b)=>a[0]-b[0]);
    scene.fill(rect(x0,y-hh,x1-x0,hh*2),linear([0,y-hh],[0,y+hh],band));
    if(r>0)for(const side of [-1,1]){scene.enter();scene.clip(rect(side<0?x0-r:x1,y-hh,r,hh*2));scene.enter({position:[side<0?x0:x1,y],scale:[r,hh]});scene.fill([circle(0,0,1)],radial([0,0],0,[0,0],1,stops));scene.leave();scene.leave();}
    scene.leave();
}
function validLight(light,i){
    const name=`light ${i}`;if(!light||!Array.isArray(light.position))throw new TypeError(`${name} needs a position`);
    const shape=light.shape??'point';if(shape!=='point'&&shape!=='area')throw new TypeError(`${name}: shape is point or area`);
    if(shape==='point')finite(light.radius,'radius',0);else if(!Array.isArray(light.size))throw new TypeError(`${name}: an area light needs a size`);
    finite(light.intensity??1,'intensity',0);finite(light.glow??0,'glow',0);
    if(light.polygon!==undefined&&light.polygon!==null&&(!Array.isArray(light.polygon)||light.polygon.length<3))throw new TypeError(`${name}: a polygon needs three points`);
    return shape;
}
/**
 * The light layer's packets.
 *  bounds   {left, top, right, bottom}: where the dark is drawn (the view, with a margin)
 *  tint     the dark's colour, any CSS colour
 *  areas    [{rects: [{x, y, w, h}] | polygon: [[x, y], ...], cut}]: the dark thinned by `cut` (0..1) there
 *  lights   [{position, shape: 'point' | 'area', radius | size + round, inner_radius, polygon, intensity,
 *            cut: [[offset, alpha]], color, glow, glow_stops: [[offset, colour]]}]
 *           A point light cuts a radial gradient from inner_radius to radius (shaped by `cut`, scaled by
 *           `intensity` up to 1), limited to `polygon` when given (from getVisibilityPolygon). Its colour
 *           is added after every cut at `glow` opacity, through `glow_stops` (default: colour fading out).
 *           An area light does the same over a rounded strip of `size`.
 */
export function createLightLayer({bounds,tint,areas=[],lights=[]},{scene=new artScene()}={}){
    const {left,top,right,bottom}=bounds??{};for(const v of [left,top,right,bottom])finite(v,'bounds');
    if(typeof tint!=='string'||!tint)throw new TypeError('The light layer needs a tint colour');
    scene.fill(rect(left,top,right-left,bottom-top),tint);
    thin(scene,areas);
    const shapes=lights.map(validLight);
    lights.forEach((l,i)=>cut(scene,l,shapes[i]));
    lights.forEach((l,i)=>glow(scene,l,shapes[i]));
    return scene.finish();
}
/**
 * The same layer, split so what holds still between frames is painted once. Lights marked `still: true`
 * go into pictures over `extent` ({left, top, right, bottom}: the whole map, not the view): the dark with
 * their cuts, and their colour. The areas and the other lights stay live packets. Returns the parts for
 * canvasRenderer.drawLayer, in order: the dark pictures, the live cuts, the colour pictures (added), the
 * live colour. Cuts (destination-out) and colour (add) each commute, so it is the layer createLightLayer
 * draws.
 *
 * With `tile_size` the pictures are tiles of that size over the extent (a map's regions), and only the
 * tiles meeting `view` are returned: a big map keeps only the tiles near the camera, and a change repaints
 * only the tiles its light reaches. The tiles within `ahead` px of the view come last, marked `prepare`:
 * drawLayer paints them into the cache when the frame's budget allows and draws nothing, so the camera
 * finds them ready. Pass every still light that reaches them. A picture's key names the tint, its tile and every still light that
 * reaches it; a light's `polygon` is known by its array, so give a new array when the shadow changes.
 * `key` prefixes the pictures' keys.
 */
export function createLightLayerParts({extent,tint,areas=[],lights=[],key='light',tile_size=null,view=null,ahead=0}){
    const {left,top,right,bottom}=extent??{};for(const v of [left,top,right,bottom])finite(v,'extent');
    if(typeof tint!=='string'||!tint)throw new TypeError('The light layer needs a tint colour');
    const shapes=lights.map(validLight),still=[],live=[];lights.forEach((l,i)=>(l.still?still:live).push([l,shapes[i],reach(l,shapes[i])]));
    const darks=[],glows=[],ready=[],near=view&&ahead>0?{left:view.left-ahead,top:view.top-ahead,right:view.right+ahead,bottom:view.bottom+ahead}:view;
    const seen=view?view:null;
    for(const tile of tiles(extent,tile_size,near)){
        const shown=!seen||(tile[0]<seen.right&&tile[0]+tile[2]>seen.left&&tile[1]<seen.bottom&&tile[1]+tile[3]>seen.top);
        const [x,y,w,h]=tile,mine=still.filter(([,,r])=>r[0]<x+w&&r[2]>x&&r[1]<y+h&&r[3]>y),name=`${key}:${signature(tint,tile,mine)}`;
        const picture=(part,paint)=>({key:`${name}:${part}`,bounds:tile,build(){const scene=new artScene();paint(scene);return scene.finish();}});
        const dark={picture:picture('dark',scene=>{scene.fill(rect(...tile),tint);for(const [l,shape] of mine)cut(scene,l,shape);})};
        const colour=mine.some(([l])=>l.color&&(l.glow??0)>=.001)?{picture:picture('glow',scene=>{for(const [l,shape] of mine)glow(scene,l,shape);}),blend:'add'}:null;
        if(shown){darks.push(dark);if(colour)glows.push(colour);}
        else{ready.push({...dark,prepare:true});if(colour)ready.push({...colour,prepare:true});}
    }
    const cuts=new artScene(),colour=new artScene();
    thin(cuts,areas);for(const [l,shape] of live){cut(cuts,l,shape);glow(colour,l,shape);}
    return [...darks,...cuts.finish(),...glows,...colour.finish(),...ready];
}
/** A light's reach as [left, top, right, bottom]. */
function reach(l,shape){
    if(shape==='area'){const [x,y]=l.position,[w,h]=l.size;return [x-w/2,y-h/2,x+w/2,y+h/2];}
    const [x,y]=l.position,r=l.radius;return [x-r,y-r,x+r,y+r];
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
function thin(scene,areas){
    for(const a of areas){const k=finite(a.cut,'area cut',0);if(k<.001)continue;
        const shape=a.polygon?polygonPath(a.polygon):(a.rects??[]).flatMap(q=>rect(q.x,q.y,q.w,q.h));if(!shape.length)continue;
        scene.enter({},{blend:'destination-out',opacity:Math.min(1,k)});scene.fill(shape,'#ffffff');scene.leave();}
}
/** A light's cut out of the dark. */
function cut(scene,l,shape){
    const k=Math.min(1,l.intensity??1);if(k<.001)return;const stops=(l.cut??LIGHT_CUT).map(([o,a])=>[o,white(a)]);
    if(shape==='area'){area(scene,l.position,l.size,l.round,stops,k,'destination-out');return;}
    const [x,y]=l.position,outline=l.polygon?polygonPath(l.polygon):[circle(x,y,l.radius)];
    scene.enter({},{blend:'destination-out',opacity:k});scene.fill(outline,radial([x,y],l.inner_radius??0,[x,y],l.radius,stops));scene.leave();
}
/** A light's colour, added. */
function glow(scene,l,shape){
    const k=Math.min(1,l.glow??0);if(k<.001||!l.color)return;const stops=l.glow_stops??[[0,l.color],[1,'rgba(0,0,0,0)']];
    if(shape==='area'){area(scene,l.position,l.size,l.round,stops,k,'add');return;}
    const [x,y]=l.position;scene.enter({},{blend:'add',opacity:k});scene.fill([circle(x,y,l.radius)],radial([x,y],0,[x,y],l.radius,stops));scene.leave();
}
const polygonIds=new WeakMap();let polygonCount=0;
/** A short hash of everything the still pictures show (FNV-1a over the fields, polygons by identity). */
function signature(tint,bounds,still){
    let h=0x811c9dc5;const add=text=>{for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,0x01000193);}};
    add(`${tint}|${bounds}`);
    for(const [l] of still){
        if(l.polygon&&!polygonIds.has(l.polygon))polygonIds.set(l.polygon,++polygonCount);
        add(`|${l.shape},${l.position},${l.radius},${l.size},${l.round},${l.inner_radius},${l.polygon?polygonIds.get(l.polygon):''},${l.intensity},${l.cut},${l.color},${l.glow},${l.glow_stops}`);
    }
    return (h>>>0).toString(36)+still.length;
}
